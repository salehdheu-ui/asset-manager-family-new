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

// السلفة التي تتجاوز هذا المبلغ (ر.ع) تتطلب تصويت العائلة قبل اعتماد الوصي
export const LOAN_VOTE_THRESHOLD = 2000;

export interface CommitmentInput {
  monthsConsidered: number;   // نافذة الحساب (عادة 12 شهراً)
  contributedMonths: number;  // أشهر ساهم فيها فعلاً (معتمدة)
  totalBorrowed: number;      // إجمالي سلفه المعتمدة
  totalRepaid: number;        // إجمالي ما سدده
  overdueInstallments: number; // أقساط تجاوزت استحقاقها دون سداد
}

// درجة الالتزام من 100: انتظام المساهمات 60٪ + سلوك السداد 40٪ (خصم 5 نقاط لكل قسط متأخر بحد أقصى 40٪)
export function computeCommitmentScore(input: CommitmentInput): number {
  const contribution = input.monthsConsidered > 0
    ? Math.min(1, input.contributedMonths / input.monthsConsidered)
    : 1;
  const repaymentBase = input.totalBorrowed > 0
    ? Math.min(1, input.totalRepaid / input.totalBorrowed)
    : 1; // من لا سلف عليه لا يُعاقب
  const penalty = Math.min(0.4, input.overdueInstallments * 0.05);
  const score = contribution * 60 + Math.max(0, repaymentBase - penalty) * 40;
  return Math.round(Math.min(100, Math.max(0, score)));
}

export interface ForecastMonth {
  month: string;               // "2026-08"
  expectedContributions: number;
  scheduledRepayments: number;
  projectedBalance: number;
}

// إسقاط السيولة: الرصيد الحالي + متوسط المساهمات الشهرية + الأقساط المجدولة المستحقة في كل شهر
export function projectCashflow(opts: {
  startBalance: number;
  avgMonthlyContributions: number;
  scheduledByMonth: Record<string, number>;
  months: string[];
}): ForecastMonth[] {
  let balance = opts.startBalance;
  return opts.months.map((month) => {
    const repayments = opts.scheduledByMonth[month] ?? 0;
    balance += opts.avgMonthlyContributions + repayments;
    return {
      month,
      expectedContributions: Number(opts.avgMonthlyContributions.toFixed(3)),
      scheduledRepayments: Number(repayments.toFixed(3)),
      projectedBalance: Number(balance.toFixed(3)),
    };
  });
}
