// حسابات مالية صرفة (بدون قاعدة بيانات) ليمكن اختبارها بمعزل عن بقية النظام

export interface RepaymentScheduleLoan {
  id: string;
  amount: string | number;
  repaymentType: string | null;
  repaymentMonths: number | null;
  approvedAt?: Date | null;
  createdAt?: Date | null;
}

export interface RepaymentInstallment {
  loanId: string;
  installmentNumber: number;
  amount: string;
  dueDate: Date;
  status: "scheduled";
}

// يبني جدول الأقساط بحيث يمتص القسط الأخير فرق التقريب ليطابق المجموع مبلغ السلفة تماماً
export function buildRepaymentSchedule(loan: RepaymentScheduleLoan): RepaymentInstallment[] {
  if (loan.repaymentType !== "scheduled" || !loan.repaymentMonths || loan.repaymentMonths <= 0) {
    return [];
  }

  const totalAmount = Number(loan.amount);
  const months = loan.repaymentMonths;
  const baseInstallment = Math.floor((totalAmount / months) * 1000) / 1000;
  const lastInstallment = totalAmount - baseInstallment * (months - 1);
  const approvalDate = loan.approvedAt || loan.createdAt || new Date();

  return Array.from({ length: months }, (_, i) => {
    const dueDate = new Date(approvalDate);
    dueDate.setMonth(dueDate.getMonth() + i + 1);
    return {
      loanId: loan.id,
      installmentNumber: i + 1,
      amount: (i === months - 1 ? lastInstallment : baseInstallment).toFixed(3),
      dueDate,
      status: "scheduled" as const,
    };
  });
}

export interface NetAssetsInput {
  contributions: number;
  deposits: number;
  withdrawals: number;
  loans: number;
  repayments: number;
  expenses: number;
}

// صافي الأصول لا يهبط تحت الصفر
export function computeNetAssets(t: NetAssetsInput): number {
  return Math.max(0, t.contributions + t.deposits - t.withdrawals - t.loans + t.repayments - t.expenses);
}

export interface AllocationPercents {
  protected: number;
  emergency: number;
  flexible: number;
  growth: number;
}

export interface AllocationAmounts {
  protected: number;
  emergency: number;
  flexible: number;
  growth: number;
}

export function splitAllocation(netAssets: number, percents: AllocationPercents): AllocationAmounts {
  return {
    protected: (netAssets * percents.protected) / 100,
    emergency: (netAssets * percents.emergency) / 100,
    flexible: (netAssets * percents.flexible) / 100,
    growth: (netAssets * percents.growth) / 100,
  };
}

export function availableInLayer(allocated: number, used: number): number {
  return Math.max(0, allocated - used);
}
