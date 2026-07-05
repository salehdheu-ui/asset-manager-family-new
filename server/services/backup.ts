import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import path from "path";
import { db } from "../db";
import { auditLogs, capitalAllocations, contributions, expenses, familySettings, fundAdjustments, loanPayments, loanRepayments, loans, members, systemBackups } from "@shared/schema";
import { users } from "@shared/models/auth";
import { asc, desc, eq } from "drizzle-orm";

const backupRoot = path.resolve(process.cwd(), "backups");

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function getWeekOfMonth(date: Date) {
  return Math.min(4, Math.floor((date.getDate() - 1) / 7) + 1);
}

function isMonthEndSnapshot(date: Date) {
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  return nextDay.getMonth() !== date.getMonth();
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function weekKey(date: Date) {
  return `${monthKey(date)}-w${getWeekOfMonth(date)}`;
}

async function ensureBackupDirectory() {
  await mkdir(backupRoot, { recursive: true });
}

export async function listBackups() {
  // بدون الحمولة الكاملة — القائمة تحتاج البيانات الوصفية فقط
  return db.select({
    id: systemBackups.id,
    fileName: systemBackups.fileName,
    storagePath: systemBackups.storagePath,
    backupDate: systemBackups.backupDate,
    backupLevel: systemBackups.backupLevel,
    year: systemBackups.year,
    month: systemBackups.month,
    weekOfMonth: systemBackups.weekOfMonth,
    isMonthEndSnapshot: systemBackups.isMonthEndSnapshot,
    sizeBytes: systemBackups.sizeBytes,
    createdBy: systemBackups.createdBy,
  }).from(systemBackups).orderBy(desc(systemBackups.backupDate));
}

export type BackupLevel = "snapshot" | "pre-restore" | "imported";

export async function createBackupSnapshot(createdBy?: string | null, backupLevel: BackupLevel = "snapshot") {
  await ensureBackupDirectory();

  const backupDate = new Date();
  const [settingsRows, memberRows, contributionRows, loanRows, repaymentRows, paymentRows, expenseRows, adjustmentRows, allocationRows, userRows, auditLogRows] = await Promise.all([
    db.select().from(familySettings).limit(1),
    db.select().from(members).orderBy(asc(members.createdAt)),
    db.select().from(contributions).orderBy(asc(contributions.createdAt)),
    db.select().from(loans).orderBy(asc(loans.createdAt)),
    db.select().from(loanRepayments).orderBy(asc(loanRepayments.installmentNumber)),
    db.select().from(loanPayments).orderBy(asc(loanPayments.paidAt)),
    db.select().from(expenses).orderBy(asc(expenses.createdAt)),
    db.select().from(fundAdjustments).orderBy(asc(fundAdjustments.createdAt)),
    db.select().from(capitalAllocations).orderBy(asc(capitalAllocations.year)),
    // تشمل كلمة المرور (مشفرة bcrypt) — بدونها تستحيل استعادة الحسابات بعد كارثة
    db.select().from(users).orderBy(asc(users.createdAt)),
    db.select().from(auditLogs).orderBy(asc(auditLogs.createdAt)),
  ]);

  const payload = {
    metadata: {
      createdAt: backupDate.toISOString(),
      version: 1,
    },
    data: {
      familySettings: settingsRows[0] ?? null,
      members: memberRows,
      contributions: contributionRows,
      loans: loanRows,
      loanRepayments: repaymentRows,
      loanPayments: paymentRows,
      expenses: expenseRows,
      fundAdjustments: adjustmentRows,
      capitalAllocations: allocationRows,
      users: userRows,
      auditLogs: auditLogRows,
    },
  };

  const prefix = backupLevel === "pre-restore" ? "safety" : "backup";
  const fileName = `${prefix}-${backupDate.getFullYear()}-${pad(backupDate.getMonth() + 1)}-${pad(backupDate.getDate())}-${pad(backupDate.getHours())}-${pad(backupDate.getMinutes())}-${pad(backupDate.getSeconds())}.json`;
  const storagePath = path.join(backupRoot, fileName);
  const content = JSON.stringify(payload, null, 2);

  await writeFile(storagePath, content, "utf8");
  const fileStats = await stat(storagePath);

  const [record] = await db.insert(systemBackups).values({
    fileName,
    storagePath,
    backupDate,
    backupLevel,
    year: backupDate.getFullYear(),
    month: backupDate.getMonth() + 1,
    weekOfMonth: getWeekOfMonth(backupDate),
    isMonthEndSnapshot: isMonthEndSnapshot(backupDate),
    sizeBytes: fileStats.size,
    createdBy: createdBy ?? null,
    payload: payload as Record<string, unknown>,
  }).returning();

  const settings = settingsRows[0];
  if (settings?.id) {
    await db.update(familySettings).set({ backupLastRunAt: backupDate }).where(eq(familySettings.id, settings.id));
  }

  return record;
}

export async function readBackupRecord(id: string) {
  const [record] = await db.select().from(systemBackups).where(eq(systemBackups.id, id)).limit(1);
  if (!record) {
    return undefined;
  }

  if (record.payload) {
    return { record, payload: record.payload };
  }

  try {
    const raw = await readFile(record.storagePath, "utf8");
    return { record, payload: JSON.parse(raw) };
  } catch {
    return undefined;
  }
}

type BackupPayload = {
  metadata?: { createdAt?: string; version?: number };
  data?: {
    familySettings?: Array<Record<string, unknown> | null> | Record<string, unknown> | null;
    members?: Record<string, unknown>[];
    contributions?: Record<string, unknown>[];
    loans?: Record<string, unknown>[];
    loanRepayments?: Record<string, unknown>[];
    loanPayments?: Record<string, unknown>[];
    expenses?: Record<string, unknown>[];
    fundAdjustments?: Record<string, unknown>[];
    capitalAllocations?: Record<string, unknown>[];
    users?: Record<string, unknown>[];
    auditLogs?: Record<string, unknown>[];
  };
};

export interface BackupSummary {
  createdAt: string | null;
  version: number | null;
  counts: Record<string, number>;
}

// ملخص محتوى النسخة — يُعرض للوصي قبل تأكيد الاستعادة
export function summarizeBackupPayload(payload: unknown): BackupSummary {
  const p = payload as BackupPayload;
  const data = p?.data ?? {};
  const countOf = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return {
    createdAt: p?.metadata?.createdAt ?? null,
    version: p?.metadata?.version ?? null,
    counts: {
      members: countOf(data.members),
      users: countOf(data.users),
      contributions: countOf(data.contributions),
      loans: countOf(data.loans),
      loanRepayments: countOf(data.loanRepayments),
      loanPayments: countOf(data.loanPayments),
      expenses: countOf(data.expenses),
      fundAdjustments: countOf(data.fundAdjustments),
      capitalAllocations: countOf(data.capitalAllocations),
      auditLogs: countOf(data.auditLogs),
    },
  };
}

const ARRAY_KEYS = [
  "members", "users", "contributions", "loans", "loanRepayments",
  "loanPayments", "expenses", "fundAdjustments", "capitalAllocations", "auditLogs",
] as const;

// فحص سلامة ملف النسخة قبل قبول استعادته — يرفض الملفات التالفة أو الغريبة
export function validateBackupPayload(payload: unknown): { valid: boolean; reason?: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, reason: "الملف ليس نسخة احتياطية صالحة (البنية الأساسية مفقودة)" };
  }
  const p = payload as BackupPayload;
  if (!p.metadata || typeof p.metadata.version !== "number") {
    return { valid: false, reason: "الملف لا يحتوي على ترويسة نسخة احتياطية (metadata.version)" };
  }
  if (p.metadata.version !== 1) {
    return { valid: false, reason: `إصدار النسخة (${p.metadata.version}) غير مدعوم` };
  }
  if (!p.data || typeof p.data !== "object") {
    return { valid: false, reason: "الملف لا يحتوي على قسم البيانات" };
  }
  for (const key of ARRAY_KEYS) {
    const value = (p.data as Record<string, unknown>)[key];
    if (value !== undefined && !Array.isArray(value)) {
      return { valid: false, reason: `قسم ${key} تالف في الملف` };
    }
  }
  if (!Array.isArray(p.data.members) || p.data.members.length === 0) {
    return { valid: false, reason: "الملف لا يحتوي على أي أعضاء — رفضت الاستعادة حمايةً من مسح البيانات" };
  }
  if (!Array.isArray(p.data.users) || p.data.users.length === 0) {
    return { valid: false, reason: "الملف لا يحتوي على أي مستخدمين — الاستعادة ستقفل النظام بالكامل" };
  }
  return { valid: true };
}

// التواريخ داخل ملف النسخة نصوص ISO — تُعاد كائنات Date قبل الإدراج وإلا رفضتها قاعدة البيانات
const DATE_FIELDS = new Set([
  "createdAt", "updatedAt", "approvedAt", "paidAt", "dueDate",
  "lockedAt", "resetAt", "backupLastRunAt", "backupDate", "expire",
]);

function reviveDates<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (DATE_FIELDS.has(key) && typeof value === "string") {
      const parsed = new Date(value);
      out[key] = Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  return out as T;
}

function reviveRows(rows: Record<string, unknown>[] | undefined) {
  return (rows ?? []).map(reviveDates);
}

async function restoreFromPayload(payload: BackupPayload): Promise<{ lockedAccounts: number }> {
  const data = payload.data ?? {};

  // النسخ القديمة كانت تُصدَّر بلا كلمات مرور — تُدرج بكلمة عشوائية مقفلة ويعاد ضبطها من لوحة الإدارة
  let lockedAccounts = 0;
  let placeholderHash: string | null = null;
  const userRows: Record<string, unknown>[] = [];
  for (const row of data.users ?? []) {
    if (typeof row.password === "string" && row.password.length > 0) {
      userRows.push(row);
    } else {
      placeholderHash = placeholderHash ?? (await bcrypt.hash(randomUUID(), 10));
      userRows.push({ ...row, password: placeholderHash });
      lockedAccounts += 1;
    }
  }

  await db.transaction(async (tx: any) => {
    // Clear dependent tables first to avoid FK violations (if any)
    await tx.delete(loanPayments);
    await tx.delete(loanRepayments);
    await tx.delete(loans);
    await tx.delete(contributions);
    await tx.delete(expenses);
    await tx.delete(fundAdjustments);
    await tx.delete(auditLogs);
    await tx.delete(capitalAllocations);
    await tx.delete(members);
    await tx.delete(familySettings);
    await tx.delete(users);

    // Insert parents first
    const familySettingsRow = Array.isArray(data.familySettings)
      ? data.familySettings[0]
      : data.familySettings;

    if (familySettingsRow && typeof familySettingsRow === "object") {
      await tx.insert(familySettings).values(reviveDates(familySettingsRow as Record<string, unknown>));
    }

    if (data.members?.length) await tx.insert(members).values(reviveRows(data.members) as never);
    if (userRows.length) await tx.insert(users).values(reviveRows(userRows) as never);
    if (data.contributions?.length) await tx.insert(contributions).values(reviveRows(data.contributions) as never);
    if (data.loans?.length) await tx.insert(loans).values(reviveRows(data.loans) as never);
    if (data.loanRepayments?.length) await tx.insert(loanRepayments).values(reviveRows(data.loanRepayments) as never);
    if (data.loanPayments?.length) await tx.insert(loanPayments).values(reviveRows(data.loanPayments) as never);
    if (data.expenses?.length) await tx.insert(expenses).values(reviveRows(data.expenses) as never);
    if (data.fundAdjustments?.length) await tx.insert(fundAdjustments).values(reviveRows(data.fundAdjustments) as never);
    if (data.auditLogs?.length) await tx.insert(auditLogs).values(reviveRows(data.auditLogs) as never);
    if (data.capitalAllocations?.length) await tx.insert(capitalAllocations).values(reviveRows(data.capitalAllocations) as never);
  });

  return { lockedAccounts };
}

export async function restoreBackupSnapshot(id: string, actorId?: string | null) {
  const snapshot = await readBackupRecord(id);
  if (!snapshot) {
    return undefined;
  }

  const payload = snapshot.payload as BackupPayload;
  const validation = validateBackupPayload(payload);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  // نسخة أمان تلقائية من الوضع الحالي قبل المسح — تتيح التراجع عن استعادة خاطئة
  const safetySnapshot = await createBackupSnapshot(actorId ?? null, "pre-restore");

  const { lockedAccounts } = await restoreFromPayload(payload);

  return {
    record: snapshot.record,
    safetySnapshotId: safetySnapshot.id,
    summary: summarizeBackupPayload(payload),
    lockedAccounts,
  };
}

// استيراد نسخة من ملف خارجي (مُنزَّل سابقاً) — طريق النجاة عند فقدان الخادم بالكامل
export async function importBackupPayload(payload: unknown, actorId?: string | null) {
  const validation = validateBackupPayload(payload);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  // نسخة أمان من الوضع الحالي أولاً
  const safetySnapshot = await createBackupSnapshot(actorId ?? null, "pre-restore");

  // خزّن الملف المستورد نفسه كسجل نسخة للتتبع
  const backupDate = new Date();
  await ensureBackupDirectory();
  const fileName = `imported-${backupDate.getFullYear()}-${pad(backupDate.getMonth() + 1)}-${pad(backupDate.getDate())}-${pad(backupDate.getHours())}-${pad(backupDate.getMinutes())}-${pad(backupDate.getSeconds())}.json`;
  const storagePath = path.join(backupRoot, fileName);
  const content = JSON.stringify(payload, null, 2);
  await writeFile(storagePath, content, "utf8");
  const fileStats = await stat(storagePath);

  const [importedRecord] = await db.insert(systemBackups).values({
    fileName,
    storagePath,
    backupDate,
    backupLevel: "imported",
    year: backupDate.getFullYear(),
    month: backupDate.getMonth() + 1,
    weekOfMonth: getWeekOfMonth(backupDate),
    isMonthEndSnapshot: false,
    sizeBytes: fileStats.size,
    createdBy: actorId ?? null,
    payload: payload as Record<string, unknown>,
  }).returning();

  const { lockedAccounts } = await restoreFromPayload(payload as BackupPayload);

  return {
    record: importedRecord,
    safetySnapshotId: safetySnapshot.id,
    summary: summarizeBackupPayload(payload),
    lockedAccounts,
  };
}

export async function applyRetentionPolicy() {
  const backups = await listBackups();
  const [settings] = await db.select().from(familySettings).limit(1);
  type BackupRecord = typeof backups[number];

  const keepDays = Math.max(1, settings?.backupKeepDays ?? 7);
  const keepWeeksPerMonth = Math.max(1, settings?.backupKeepWeeksPerMonth ?? 4);
  const keepMonths = Math.max(1, settings?.backupKeepMonths ?? 12);

  const now = Date.now();
  const keepIds = new Set<string>();
  const latestWeeklyByKey = new Map<string, BackupRecord>();
  const latestMonthlyByKey = new Map<string, BackupRecord>();

  for (const backup of backups) {
    const backupDate = new Date(backup.backupDate);
    const ageInDays = (now - backupDate.getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays <= keepDays) {
      keepIds.add(backup.id);
    }

    const wk = weekKey(backupDate);
    if (!latestWeeklyByKey.has(wk)) {
      latestWeeklyByKey.set(wk, backup);
    }

    const mk = monthKey(backupDate);
    if (!latestMonthlyByKey.has(mk)) {
      latestMonthlyByKey.set(mk, backup);
    }
  }

  const weeklyByMonth = new Map<string, BackupRecord[]>();
  for (const backup of Array.from(latestWeeklyByKey.values())) {
    const key = monthKey(new Date(backup.backupDate));
    const current = weeklyByMonth.get(key) ?? [];
    current.push(backup);
    weeklyByMonth.set(key, current);
  }

  for (const monthBackups of Array.from(weeklyByMonth.values())) {
    monthBackups
      .sort((a: BackupRecord, b: BackupRecord) => new Date(b.backupDate).getTime() - new Date(a.backupDate).getTime())
      .slice(0, keepWeeksPerMonth)
      .forEach((backup: BackupRecord) => keepIds.add(backup.id));
  }

  Array.from(latestMonthlyByKey.values())
    .sort((a: BackupRecord, b: BackupRecord) => new Date(b.backupDate).getTime() - new Date(a.backupDate).getTime())
    .slice(0, keepMonths)
    .forEach((backup: BackupRecord) => keepIds.add(backup.id));

  const deletedBackups: typeof backups = [];

  for (const backup of backups) {
    if (keepIds.has(backup.id)) {
      continue;
    }

    try {
      await rm(backup.storagePath, { force: true });
    } catch {
    }

    await db.delete(systemBackups).where(eq(systemBackups.id, backup.id));
    deletedBackups.push(backup);
  }

  return {
    kept: backups.length - deletedBackups.length,
    deleted: deletedBackups.length,
    deletedBackups,
  };
}
