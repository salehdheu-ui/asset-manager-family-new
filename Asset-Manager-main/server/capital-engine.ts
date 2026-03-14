import { db } from "./db";
import { contributions, loans, expenses, familySettings, capitalAllocations, loanRepayments, fundAdjustments } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

export interface AllocationResult {
  year: number;
  netAssets: number;
  locked: boolean;
  protected: { amount: number; percent: number };
  emergency: { amount: number; percent: number; used: number; available: number };
  flexible: { amount: number; percent: number; used: number; available: number };
  growth: { amount: number; percent: number; used: number; available: number };
}

export interface TransactionCheck {
  allowed: boolean;
  reason?: string;
  layer: string;
  available: number;
  requested: number;
}

async function getPercentages() {
  const [settings] = await db.select().from(familySettings).limit(1);
  return {
    protected: settings?.protectedPercent ?? 45,
    emergency: settings?.emergencyPercent ?? 15,
    flexible: settings?.flexiblePercent ?? 20,
    growth: settings?.growthPercent ?? 20,
  };
}

async function computeTotalNetAssets(): Promise<number> {
  const allContribs = await db.select().from(contributions)
    .where(eq(contributions.status, "approved"));
  const allLoans = await db.select().from(loans)
    .where(eq(loans.status, "approved"));
  const allExpenses = await db.select().from(expenses);
  const allAdjustments = await db.select().from(fundAdjustments);

  const totalContribs = allContribs.reduce((sum, c) => sum + Number(c.amount), 0);
  const totalLoans = allLoans.reduce((sum, l) => sum + Number(l.amount), 0);
  const totalExpenses = allExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalDeposits = allAdjustments.filter(a => a.type === 'deposit').reduce((sum, a) => sum + Number(a.amount), 0);
  const totalWithdrawals = allAdjustments.filter(a => a.type === 'withdrawal').reduce((sum, a) => sum + Number(a.amount), 0);

  let totalRepayments = 0;
  for (const loan of allLoans) {
    const reps = await db.select().from(loanRepayments)
      .where(and(eq(loanRepayments.loanId, loan.id), eq(loanRepayments.status, "paid")));
    totalRepayments += reps.reduce((sum, r) => sum + Number(r.amount), 0);
  }

  return Math.max(0, totalContribs + totalDeposits - totalWithdrawals - totalLoans + totalRepayments - totalExpenses);
}

async function computeUsedAmounts(year: number) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);

  const allLoans = await db.select().from(loans)
    .where(eq(loans.status, "approved"));
  const yearLoans = allLoans.filter(l => {
    const d = l.approvedAt || l.createdAt;
    return d && d >= yearStart && d <= yearEnd;
  });

  const allExpenses = await db.select().from(expenses);
  const yearExpenses = allExpenses.filter(e => {
    const d = e.createdAt;
    return d && d >= yearStart && d <= yearEnd;
  });

  const loansTotal = yearLoans.reduce((sum, l) => sum + Number(l.amount), 0);
  const emergencyExpenses = yearExpenses.filter(e => e.category === 'emergency').reduce((sum, e) => sum + Number(e.amount), 0);
  const generalExpenses = yearExpenses.filter(e => e.category !== 'emergency').reduce((sum, e) => sum + Number(e.amount), 0);

  let totalRepayments = 0;
  for (const loan of yearLoans) {
    const reps = await db.select().from(loanRepayments)
      .where(and(eq(loanRepayments.loanId, loan.id), eq(loanRepayments.status, "paid")));
    totalRepayments += reps.filter(r => {
      const d = r.paidAt;
      return d && d >= yearStart && d <= yearEnd;
    }).reduce((sum, r) => sum + Number(r.amount), 0);
  }

  return {
    flexibleUsed: Math.max(0, loansTotal - totalRepayments + generalExpenses),
    growthUsed: 0,
    emergencyUsed: emergencyExpenses,
  };
}

export async function lockYearAllocation(year: number): Promise<AllocationResult> {
  const percents = await getPercentages();
  const netAssets = await computeTotalNetAssets();
  const used = await computeUsedAmounts(year);

  const protectedAmt = netAssets * percents.protected / 100;
  const emergencyAmt = netAssets * percents.emergency / 100;
  const flexibleAmt = netAssets * percents.flexible / 100;
  const growthAmt = netAssets * percents.growth / 100;

  const [existing] = await db.select().from(capitalAllocations)
    .where(eq(capitalAllocations.year, year));

  if (existing) {
    await db.update(capitalAllocations)
      .set({
        netAssets: netAssets.toFixed(3),
        protectedAmount: protectedAmt.toFixed(3),
        emergencyAmount: emergencyAmt.toFixed(3),
        flexibleAmount: flexibleAmt.toFixed(3),
        growthAmount: growthAmt.toFixed(3),
        flexibleUsed: used.flexibleUsed.toFixed(3),
        growthUsed: used.growthUsed.toFixed(3),
        emergencyUsed: used.emergencyUsed.toFixed(3),
        lockedAt: new Date(),
      })
      .where(eq(capitalAllocations.id, existing.id));
  } else {
    await db.insert(capitalAllocations).values({
      year,
      netAssets: netAssets.toFixed(3),
      protectedAmount: protectedAmt.toFixed(3),
      emergencyAmount: emergencyAmt.toFixed(3),
      flexibleAmount: flexibleAmt.toFixed(3),
      growthAmount: growthAmt.toFixed(3),
      flexibleUsed: used.flexibleUsed.toFixed(3),
      growthUsed: used.growthUsed.toFixed(3),
      emergencyUsed: used.emergencyUsed.toFixed(3),
    });
  }

  return {
    year,
    netAssets,
    locked: true,
    protected: { amount: protectedAmt, percent: percents.protected },
    emergency: { amount: emergencyAmt, percent: percents.emergency, used: used.emergencyUsed, available: Math.max(0, emergencyAmt - used.emergencyUsed) },
    flexible: { amount: flexibleAmt, percent: percents.flexible, used: used.flexibleUsed, available: Math.max(0, flexibleAmt - used.flexibleUsed) },
    growth: { amount: growthAmt, percent: percents.growth, used: used.growthUsed, available: Math.max(0, growthAmt - used.growthUsed) },
  };
}

export async function rebalanceYear(year: number): Promise<AllocationResult> {
  const [existing] = await db.select().from(capitalAllocations)
    .where(eq(capitalAllocations.year, year));

  if (!existing) {
    return lockYearAllocation(year);
  }

  const used = await computeUsedAmounts(year);

  await db.update(capitalAllocations)
    .set({
      flexibleUsed: used.flexibleUsed.toFixed(3),
      growthUsed: used.growthUsed.toFixed(3),
      emergencyUsed: used.emergencyUsed.toFixed(3),
    })
    .where(eq(capitalAllocations.id, existing.id));

  const lockedNet = Number(existing.netAssets);
  const protectedAmt = Number(existing.protectedAmount);
  const emergencyAmt = Number(existing.emergencyAmount);
  const flexibleAmt = Number(existing.flexibleAmount);
  const growthAmt = Number(existing.growthAmount);

  const percents = await getPercentages();

  return {
    year,
    netAssets: lockedNet,
    locked: true,
    protected: { amount: protectedAmt, percent: percents.protected },
    emergency: { amount: emergencyAmt, percent: percents.emergency, used: used.emergencyUsed, available: Math.max(0, emergencyAmt - used.emergencyUsed) },
    flexible: { amount: flexibleAmt, percent: percents.flexible, used: used.flexibleUsed, available: Math.max(0, flexibleAmt - used.flexibleUsed) },
    growth: { amount: growthAmt, percent: percents.growth, used: used.growthUsed, available: Math.max(0, growthAmt - used.growthUsed) },
  };
}

export async function checkLoanTransaction(amount: number, year: number): Promise<TransactionCheck> {
  const allocation = await rebalanceYear(year);
  const available = allocation.flexible.available;

  if (amount > available) {
    return {
      allowed: false,
      reason: `المبلغ المطلوب (${amount.toLocaleString()} ر.ع) يتجاوز الحد المتاح في رأس المال المرن (${available.toLocaleString()} ر.ع). المبلغ المخصص لهذه السنة مقفل عند ${allocation.flexible.amount.toLocaleString()} ر.ع بناءً على صافي الأصول في بداية السنة.`,
      layer: "flexible",
      available,
      requested: amount,
    };
  }

  return { allowed: true, layer: "flexible", available, requested: amount };
}

export async function checkExpenseTransaction(amount: number, category: string, year: number): Promise<TransactionCheck> {
  const allocation = await rebalanceYear(year);

  if (category === "emergency") {
    const available = allocation.emergency.available;
    if (amount > available) {
      return {
        allowed: false,
        reason: `المبلغ المطلوب (${amount.toLocaleString()} ر.ع) يتجاوز الحد المتاح في احتياطي الطوارئ (${available.toLocaleString()} ر.ع). المبلغ المخصص لهذه السنة مقفل عند ${allocation.emergency.amount.toLocaleString()} ر.ع بناءً على صافي الأصول في بداية السنة.`,
        layer: "emergency",
        available,
        requested: amount,
      };
    }
    return { allowed: true, layer: "emergency", available, requested: amount };
  }

  const available = allocation.flexible.available;
  if (amount > available) {
    return {
      allowed: false,
      reason: `المبلغ المطلوب (${amount.toLocaleString()} ر.ع) يتجاوز الحد المتاح في رأس المال المرن (${available.toLocaleString()} ر.ع). المبلغ المخصص لهذه السنة مقفل عند ${allocation.flexible.amount.toLocaleString()} ر.ع بناءً على صافي الأصول في بداية السنة.`,
      layer: "flexible",
      available,
      requested: amount,
    };
  }

  return { allowed: true, layer: "flexible", available, requested: amount };
}

export async function resetYearAllocation(year: number, adminId: string): Promise<AllocationResult> {
  await db.update(capitalAllocations)
    .set({
      flexibleUsed: "0",
      growthUsed: "0",
      emergencyUsed: "0",
      resetAt: new Date(),
      resetBy: adminId,
    })
    .where(eq(capitalAllocations.year, year));

  return lockYearAllocation(year);
}

export async function getAllocationForYear(year: number): Promise<AllocationResult> {
  return rebalanceYear(year);
}
