import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../db";
import { capitalAllocations, contributions, expenses, familySettings, fundAdjustments, loanRepayments, loans, members, systemBackups } from "@shared/schema";
import { users } from "@shared/models/auth";
import { asc, desc, eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backupRoot = path.resolve(__dirname, "../../backups");

type BackupPayload = {
  metadata: {
    createdAt: string;
    version: number;
  };
  data: {
    familySettings: typeof familySettings.$inferSelect | null;
    members: Array<typeof members.$inferSelect>;
    contributions: Array<typeof contributions.$inferSelect>;
    loans: Array<typeof loans.$inferSelect>;
    loanRepayments: Array<typeof loanRepayments.$inferSelect>;
    expenses: Array<typeof expenses.$inferSelect>;
    fundAdjustments: Array<typeof fundAdjustments.$inferSelect>;
    capitalAllocations: Array<typeof capitalAllocations.$inferSelect>;
    users: Array<typeof users.$inferSelect>;
  };
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asArray<T>(value: unknown, fieldName: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Backup payload is invalid: ${fieldName} must be an array`);
  }

  return value as T[];
}

function normalizeBackupPayload(payload: unknown): BackupPayload {
  if (!isRecord(payload) || !isRecord(payload.metadata) || !isRecord(payload.data)) {
    throw new Error("Backup payload is invalid");
  }

  const createdAt = payload.metadata.createdAt;
  const version = payload.metadata.version;

  if (typeof createdAt !== "string" || typeof version !== "number") {
    throw new Error("Backup metadata is invalid");
  }

  return {
    metadata: {
      createdAt,
      version,
    },
    data: {
      familySettings: (payload.data.familySettings ?? null) as BackupPayload["data"]["familySettings"],
      members: asArray<BackupPayload["data"]["members"][number]>(payload.data.members, "members"),
      contributions: asArray<BackupPayload["data"]["contributions"][number]>(payload.data.contributions, "contributions"),
      loans: asArray<BackupPayload["data"]["loans"][number]>(payload.data.loans, "loans"),
      loanRepayments: asArray<BackupPayload["data"]["loanRepayments"][number]>(payload.data.loanRepayments, "loanRepayments"),
      expenses: asArray<BackupPayload["data"]["expenses"][number]>(payload.data.expenses, "expenses"),
      fundAdjustments: asArray<BackupPayload["data"]["fundAdjustments"][number]>(payload.data.fundAdjustments, "fundAdjustments"),
      capitalAllocations: Array.isArray(payload.data.capitalAllocations)
        ? (payload.data.capitalAllocations as BackupPayload["data"]["capitalAllocations"])
        : [],
      users: asArray<BackupPayload["data"]["users"][number]>(payload.data.users, "users"),
    },
  };
}

export async function listBackups() {
  return db.select().from(systemBackups).orderBy(desc(systemBackups.backupDate));
}

export async function createBackupSnapshot(createdBy?: string | null) {
  await ensureBackupDirectory();

  const backupDate = new Date();
  const [settingsRows, memberRows, contributionRows, loanRows, repaymentRows, expenseRows, adjustmentRows, allocationRows, userRows] = await Promise.all([
    db.select().from(familySettings).limit(1),
    db.select().from(members).orderBy(asc(members.createdAt)),
    db.select().from(contributions).orderBy(asc(contributions.createdAt)),
    db.select().from(loans).orderBy(asc(loans.createdAt)),
    db.select().from(loanRepayments).orderBy(asc(loanRepayments.installmentNumber)),
    db.select().from(expenses).orderBy(asc(expenses.createdAt)),
    db.select().from(fundAdjustments).orderBy(asc(fundAdjustments.createdAt)),
    db.select().from(capitalAllocations).orderBy(asc(capitalAllocations.year)),
    db.select().from(users).orderBy(asc(users.createdAt)),
  ]);

  const payload: BackupPayload = {
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
      capitalAllocations: allocationRows,
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
    payload: normalizeBackupPayload(JSON.parse(raw)),
  };
}

export async function restoreBackupSnapshot(id: string, restoredBy?: string | null) {
  const snapshot = await readBackupRecord(id);
  if (!snapshot) {
    throw new Error("Backup not found");
  }

  await db.transaction(async (tx) => {
    await tx.delete(loanRepayments);
    await tx.delete(contributions);
    await tx.delete(loans);
    await tx.delete(fundAdjustments);
    await tx.delete(expenses);
    await tx.delete(capitalAllocations);
    await tx.delete(members);
    await tx.delete(users);
    await tx.delete(familySettings);

    if (snapshot.payload.data.familySettings) {
      await tx.insert(familySettings).values(snapshot.payload.data.familySettings);
    }

    if (snapshot.payload.data.members.length > 0) {
      await tx.insert(members).values(snapshot.payload.data.members);
    }

    if (snapshot.payload.data.users.length > 0) {
      await tx.insert(users).values(snapshot.payload.data.users);
    }

    if (snapshot.payload.data.loans.length > 0) {
      await tx.insert(loans).values(snapshot.payload.data.loans);
    }

    if (snapshot.payload.data.contributions.length > 0) {
      await tx.insert(contributions).values(snapshot.payload.data.contributions);
    }

    if (snapshot.payload.data.loanRepayments.length > 0) {
      await tx.insert(loanRepayments).values(snapshot.payload.data.loanRepayments);
    }

    if (snapshot.payload.data.expenses.length > 0) {
      await tx.insert(expenses).values(snapshot.payload.data.expenses);
    }

    if (snapshot.payload.data.fundAdjustments.length > 0) {
      await tx.insert(fundAdjustments).values(snapshot.payload.data.fundAdjustments);
    }

    if (snapshot.payload.data.capitalAllocations.length > 0) {
      await tx.insert(capitalAllocations).values(snapshot.payload.data.capitalAllocations);
    }
  });

  const backupDate = new Date();
  const [settings] = await db.select().from(familySettings).limit(1);
  if (settings?.id) {
    await db.update(familySettings).set({ backupLastRunAt: backupDate }).where(eq(familySettings.id, settings.id));
  }

  return {
    restoredBackupId: snapshot.record.id,
    restoredAt: backupDate,
    restoredBy: restoredBy ?? null,
    fileName: snapshot.record.fileName,
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
