import { db } from "./db";
import { contributions, loans, expenses, familySettings, capitalAllocations, loanPayments, fundAdjustments, investments, type Contribution, type Loan, type Expense, type FundAdjustment, type LoanPayment, type Investment } from "@shared/schema";
import {
  computeLayerUsage,
  computeNetAssets,
  isWithinYear,
  layerView,
  splitAllocation,
  type LayerUsage,
  type LayerView,
} from "@shared/finance";
import { eq } from "drizzle-orm";

/**
 * محرك رأس المال.
 *
 * مسؤوليته قراءة الصفوف من قاعدة البيانات وحفظ نتيجة التخصيص. كل معادلة
 * مالية تعيش في shared/finance.ts حيث تُختبر بلا قاعدة بيانات — فلا تُكتب
 * قاعدة حسابية في مكانين ولا تختلف نسختاها بمرور الوقت.
 */

export interface AllocationResult {
  year: number;
  netAssets: number;
  locked: boolean;
  protected: { amount: number; percent: number };
  emergency: LayerView;
  flexible: LayerView;
  growth: LayerView;
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

const sum = <T>(rows: T[], amount: (row: T) => string | number) =>
  rows.reduce((total, row) => total + Number(amount(row)), 0);

async function computeTotalNetAssets(): Promise<number> {
  const allContribs: Contribution[] = await db.select().from(contributions)
    .where(eq(contributions.status, "approved"));
  const allLoans: Loan[] = await db.select().from(loans)
    .where(eq(loans.status, "approved"));
  const allExpenses: Expense[] = await db.select().from(expenses);
  const allAdjustments: FundAdjustment[] = await db.select().from(fundAdjustments);
  const allRepayments: LoanPayment[] = await db.select().from(loanPayments);

  const approvedLoanIds = new Set(allLoans.map((l) => l.id));

  return computeNetAssets({
    contributions: sum(allContribs, (c) => c.amount),
    deposits: sum(allAdjustments.filter((a) => a.type === "deposit"), (a) => a.amount),
    withdrawals: sum(allAdjustments.filter((a) => a.type === "withdrawal"), (a) => a.amount),
    loans: sum(allLoans, (l) => l.amount),
    repayments: sum(allRepayments.filter((r) => approvedLoanIds.has(r.loanId)), (r) => r.amount),
    expenses: sum(allExpenses, (e) => e.amount),
  });
}

async function computeUsedAmounts(year: number): Promise<LayerUsage> {
  const allLoans: Loan[] = await db.select().from(loans)
    .where(eq(loans.status, "approved"));
  const yearLoans = allLoans.filter((l) => isWithinYear(l.approvedAt || l.createdAt, year));

  const allExpenses: Expense[] = await db.select().from(expenses);
  const yearExpenses = allExpenses.filter((e) => isWithinYear(e.createdAt, year));

  const allInvestments: Investment[] = await db.select().from(investments);
  const allPaidRepayments: LoanPayment[] = await db.select().from(loanPayments);
  const yearLoanIds = new Set(yearLoans.map((l) => l.id));

  return computeLayerUsage({
    approvedLoans: sum(yearLoans, (l) => l.amount),
    loanRepayments: sum(
      allPaidRepayments.filter((r) => yearLoanIds.has(r.loanId) && isWithinYear(r.paidAt, year)),
      (r) => r.amount,
    ),
    generalExpenses: sum(yearExpenses.filter((e) => e.category !== "emergency"), (e) => e.amount),
    emergencyExpenses: sum(yearExpenses.filter((e) => e.category === "emergency"), (e) => e.amount),
    activeInvestments: sum(
      allInvestments.filter((i) => i.status === "active" && isWithinYear(i.startedAt, year)),
      (i) => i.amount,
    ),
  });
}

/** يجمع نتيجة التخصيص المعروضة — كان هذا البناء مكرراً حرفياً في موضعين */
function buildResult(
  year: number,
  netAssets: number,
  amounts: { protected: number; emergency: number; flexible: number; growth: number },
  percents: { protected: number; emergency: number; flexible: number; growth: number },
  used: LayerUsage,
): AllocationResult {
  return {
    year,
    netAssets,
    locked: true,
    protected: { amount: amounts.protected, percent: percents.protected },
    emergency: layerView(amounts.emergency, percents.emergency, used.emergencyUsed),
    flexible: layerView(amounts.flexible, percents.flexible, used.flexibleUsed),
    growth: layerView(amounts.growth, percents.growth, used.growthUsed),
  };
}

export async function lockYearAllocation(year: number): Promise<AllocationResult> {
  const percents = await getPercentages();
  const netAssets = await computeTotalNetAssets();
  const used = await computeUsedAmounts(year);
  const split = splitAllocation(netAssets, percents);

  const row = {
    netAssets: netAssets.toFixed(3),
    protectedAmount: split.protected.toFixed(3),
    emergencyAmount: split.emergency.toFixed(3),
    flexibleAmount: split.flexible.toFixed(3),
    growthAmount: split.growth.toFixed(3),
    flexibleUsed: used.flexibleUsed.toFixed(3),
    growthUsed: used.growthUsed.toFixed(3),
    emergencyUsed: used.emergencyUsed.toFixed(3),
  };

  const [existing] = await db.select().from(capitalAllocations)
    .where(eq(capitalAllocations.year, year));

  if (existing) {
    await db.update(capitalAllocations)
      .set({ ...row, lockedAt: new Date() })
      .where(eq(capitalAllocations.id, existing.id));
  } else {
    await db.insert(capitalAllocations).values({ year, ...row });
  }

  return buildResult(year, netAssets, split, percents, used);
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

  const percents = await getPercentages();

  // المبالغ من الصف المحفوظ لا من إعادة الحساب — التخصيص مُقفل على قيمته وقت قفله
  return buildResult(
    year,
    Number(existing.netAssets),
    {
      protected: Number(existing.protectedAmount),
      emergency: Number(existing.emergencyAmount),
      flexible: Number(existing.flexibleAmount),
      growth: Number(existing.growthAmount),
    },
    percents,
    used,
  );
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
  // مصروف الطوارئ يُخصم من طبقته، وما عداه من الطبقة المرنة
  const layer = category === "emergency" ? "emergency" : "flexible";
  const available = allocation[layer].available;
  const allowed = Number.isFinite(amount) && amount > 0 && amount <= available;

  return {
    allowed,
    reason: allowed
      ? undefined
      : layer === "emergency"
        ? "المبلغ المطلوب يتجاوز رصيد الطوارئ المتاح"
        : "المبلغ المطلوب يتجاوز الرصيد المرن المتاح",
    layer,
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
