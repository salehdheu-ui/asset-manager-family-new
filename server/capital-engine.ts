import { db } from "./db";
import { contributions, loans, expenses, familySettings, capitalAllocations, loanPayments, fundAdjustments, type Contribution, type Loan, type Expense, type FundAdjustment, type LoanPayment } from "@shared/schema";
import { computeNetAssets, splitAllocation } from "@shared/finance";
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
  const allContribs: Contribution[] = await db.select().from(contributions)
    .where(eq(contributions.status, "approved"));
  const allLoans: Loan[] = await db.select().from(loans)
    .where(eq(loans.status, "approved"));
  const allExpenses: Expense[] = await db.select().from(expenses);
  const allAdjustments: FundAdjustment[] = await db.select().from(fundAdjustments);

  const totalContribs = allContribs.reduce((sum: number, c: Contribution) => sum + Number(c.amount), 0);
  const totalLoans = allLoans.reduce((sum: number, l: Loan) => sum + Number(l.amount), 0);
  const totalExpenses = allExpenses.reduce((sum: number, e: Expense) => sum + Number(e.amount), 0);
  const totalDeposits = allAdjustments.filter((a: FundAdjustment) => a.type === 'deposit').reduce((sum: number, a: FundAdjustment) => sum + Number(a.amount), 0);
  const totalWithdrawals = allAdjustments.filter((a: FundAdjustment) => a.type === 'withdrawal').reduce((sum: number, a: FundAdjustment) => sum + Number(a.amount), 0);

  const allRepayments: LoanPayment[] = await db.select().from(loanPayments);
  const approvedLoanIds = new Set(allLoans.map((l: Loan) => l.id));
  const totalRepayments = allRepayments
    .filter((r: LoanPayment) => approvedLoanIds.has(r.loanId))
    .reduce((sum: number, r: LoanPayment) => sum + Number(r.amount), 0);

  return computeNetAssets({
    contributions: totalContribs,
    deposits: totalDeposits,
    withdrawals: totalWithdrawals,
    loans: totalLoans,
    repayments: totalRepayments,
    expenses: totalExpenses,
  });
}

async function computeUsedAmounts(year: number) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const allLoans: Loan[] = await db.select().from(loans)
    .where(eq(loans.status, "approved"));
  const yearLoans = allLoans.filter((l: Loan) => {
    const d = l.approvedAt || l.createdAt;
    return d && d >= yearStart && d < yearEnd;
  });

  const allExpenses: Expense[] = await db.select().from(expenses);
  const yearExpenses = allExpenses.filter((e: Expense) => {
    const d = e.createdAt;
    return d && d >= yearStart && d < yearEnd;
  });

  const loansTotal = yearLoans.reduce((sum: number, l: Loan) => sum + Number(l.amount), 0);
  const emergencyExpenses = yearExpenses.filter((e: Expense) => e.category === 'emergency').reduce((sum: number, e: Expense) => sum + Number(e.amount), 0);
  const generalExpenses = yearExpenses.filter((e: Expense) => e.category !== 'emergency').reduce((sum: number, e: Expense) => sum + Number(e.amount), 0);

  const allPaidRepayments: LoanPayment[] = await db.select().from(loanPayments);
  const yearLoanIds = new Set(yearLoans.map((l: Loan) => l.id));
  const totalRepayments = allPaidRepayments
    .filter((r: LoanPayment) => yearLoanIds.has(r.loanId) && r.paidAt && r.paidAt >= yearStart && r.paidAt < yearEnd)
    .reduce((sum: number, r: LoanPayment) => sum + Number(r.amount), 0);

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

  const split = splitAllocation(netAssets, percents);
  const protectedAmt = split.protected;
  const emergencyAmt = split.emergency;
  const flexibleAmt = split.flexible;
  const growthAmt = split.growth;

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
  const allowed = Number.isFinite(amount) && amount > 0 && amount <= available;

  return {
    allowed,
    reason: allowed ? undefined : "المبلغ المطلوب يتجاوز الرصيد المرن المتاح",
    layer: "flexible",
    available,
    requested: amount,
  };
}

export async function checkExpenseTransaction(amount: number, category: string, year: number): Promise<TransactionCheck> {
  const allocation = await rebalanceYear(year);

  if (category === "emergency") {
    const available = allocation.emergency.available;
    const allowed = Number.isFinite(amount) && amount > 0 && amount <= available;
    return {
      allowed,
      reason: allowed ? undefined : "المبلغ المطلوب يتجاوز رصيد الطوارئ المتاح",
      layer: "emergency",
      available,
      requested: amount,
    };
  }

  const available = allocation.flexible.available;
  const allowed = Number.isFinite(amount) && amount > 0 && amount <= available;

  return {
    allowed,
    reason: allowed ? undefined : "المبلغ المطلوب يتجاوز الرصيد المرن المتاح",
    layer: "flexible",
    available,
    requested: amount,
  };
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
