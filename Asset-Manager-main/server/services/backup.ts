import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../db";
import { contributions, expenses, familySettings, fundAdjustments, loanRepayments, loans, members, systemBackups } from "@shared/schema";
import { users } from "@shared/models/auth";
import { asc, desc, eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backupRoot = path.resolve(__dirname, "../../backups");

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
  return db.select().from(systemBackups).orderBy(desc(systemBackups.backupDate));
}

export async function createBackupSnapshot(createdBy?: string | null) {
  await ensureBackupDirectory();

  const backupDate = new Date();
  const [settingsRows, memberRows, contributionRows, loanRows, repaymentRows, expenseRows, adjustmentRows, userRows] = await Promise.all([
    db.select().from(familySettings).limit(1),
    db.select().from(members).orderBy(asc(members.createdAt)),
    db.select().from(contributions).orderBy(asc(contributions.createdAt)),
    db.select().from(loans).orderBy(asc(loans.createdAt)),
    db.select().from(loanRepayments).orderBy(asc(loanRepayments.installmentNumber)),
    db.select().from(expenses).orderBy(asc(expenses.createdAt)),
    db.select().from(fundAdjustments).orderBy(asc(fundAdjustments.createdAt)),
    db.select().from(users).orderBy(asc(users.createdAt)),
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
      expenses: expenseRows,
      fundAdjustments: adjustmentRows,
      users: userRows,
    },
  };

  const fileName = `backup-${backupDate.getFullYear()}-${pad(backupDate.getMonth() + 1)}-${pad(backupDate.getDate())}-${pad(backupDate.getHours())}-${pad(backupDate.getMinutes())}-${pad(backupDate.getSeconds())}.json`;
  const storagePath = path.join(backupRoot, fileName);
  const content = JSON.stringify(payload, null, 2);

  await writeFile(storagePath, content, "utf8");
  const fileStats = await stat(storagePath);

  const [record] = await db.insert(systemBackups).values({
    fileName,
    storagePath,
    backupDate,
    backupLevel: "snapshot",
    year: backupDate.getFullYear(),
    month: backupDate.getMonth() + 1,
    weekOfMonth: getWeekOfMonth(backupDate),
    isMonthEndSnapshot: isMonthEndSnapshot(backupDate),
    sizeBytes: fileStats.size,
    createdBy: createdBy ?? null,
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

  const raw = await readFile(record.storagePath, "utf8");
  return {
    record,
    payload: JSON.parse(raw),
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
