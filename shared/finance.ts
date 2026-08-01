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

// ــــ مهلة الاستحقاق الشهرية ــــ
// التزام الشهر (مساهمة أو قسط) يُمهَل حتى نهاية يوم 26 من ذلك الشهر،
// فلا يُحسب العضو متأخراً قبل مرور هذا التاريخ.
export const MONTHLY_DUE_DAY = 26;

// آخر لحظة سماح لالتزامات شهر معين
export function monthDeadline(year: number, month: number): Date {
  return new Date(year, month - 1, MONTHLY_DUE_DAY, 23, 59, 59, 999);
}

// هل مضت مهلة هذا الشهر؟ (أي أصبح التأخير محسوباً عليه)
export function isMonthDue(year: number, month: number, now: Date = new Date()): boolean {
  return now.getTime() > monthDeadline(year, month).getTime();
}

// عدد أشهر السنة التي مضت مهلتها حتى الآن — يُستخدم مقاماً لنسب الالتزام
export function dueMonthsInYear(year: number, now: Date = new Date()): number {
  if (year < now.getFullYear()) return 12;
  if (year > now.getFullYear()) return 0;
  const currentMonth = now.getMonth() + 1;
  return isMonthDue(year, currentMonth, now) ? currentMonth : currentMonth - 1;
}

// آخر (count) شهراً مضت مهلتها — من الأحدث للأقدم
export function recentDueMonths(now: Date = new Date(), count = 12): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  // الشهر الجاري لا يدخل الحساب قبل مرور مهلته
  let cursor = isMonthDue(now.getFullYear(), now.getMonth() + 1, now)
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(now.getFullYear(), now.getMonth() - 1, 1);

  for (let i = 0; i < count; i++) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  }
  return months;
}

// القسط يُعد متأخراً بعد الأبعد بين تاريخ استحقاقه ومهلة يوم 26 من شهره
export function isInstallmentLate(dueDate: Date | string, now: Date = new Date()): boolean {
  const due = new Date(dueDate);
  const grace = monthDeadline(due.getFullYear(), due.getMonth() + 1);
  const deadline = due.getTime() > grace.getTime() ? due : grace;
  return now.getTime() > deadline.getTime();
}

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
