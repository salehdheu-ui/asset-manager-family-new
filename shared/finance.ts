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

// ــــ المتأخرات بالمبلغ ــــ

// الاشتراك الشهري يتغيّر بين سنة وأخرى، فيُسجَّل كسعر له تاريخ سريان.
// الشهر يُحاسَب بالسعر الذي كان سارياً فيه، فتغيير المبلغ اليوم لا يُعيد كتابة الماضي.
export interface RatePeriod {
  amount: number;
  year: number;   // أول شهر يسري فيه هذا السعر
  month: number;
}

// السعر الساري في شهر معيّن: آخر سعر بدأ سريانه في ذلك الشهر أو قبله.
// الأشهر السابقة لأول سعر مسجَّل لا سعر لها ⇒ لا متأخرات عليها إطلاقاً.
export function rateForMonth(rates: RatePeriod[], year: number, month: number): number {
  const key = year * 12 + month;
  let best: RatePeriod | null = null;
  for (const r of rates) {
    const rk = r.year * 12 + r.month;
    if (rk > key) continue;
    if (!best || rk > best.year * 12 + best.month) best = r;
  }
  return best ? best.amount : 0;
}

// الشهر الذي يلي شهراً معيّناً — السعر الجديد يبدأ منه افتراضياً لا من الشهر الجاري
export function nextMonthOf(year: number, month: number): { year: number; month: number } {
  return month >= 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export interface ArrearsInput {
  /** سجل الأسعار بتواريخ سريانها — يُفضَّل على expectedMonthly */
  rates?: RatePeriod[];
  /** تاريخ انضمام العضو — لا يُحاسَب على شهر سبق انضمامه */
  joinedAt?: Date | string | null;
  /** سعر ثابت لكل الأشهر (للتوافق مع الاستدعاءات القديمة والاختبارات) */
  expectedMonthly?: number;
  dueMonths: Array<{ year: number; month: number }>; // الأشهر التي مضت مهلتها
  paidByMonth: Record<string, number>;         // "2026-8" ⇒ المبلغ المعتمد في ذلك الشهر
}

export interface ArrearsResult {
  expectedTotal: number;   // المتوقع عن كل الأشهر المستحقة
  paidTotal: number;       // المدفوع المعتمد منها
  arrears: number;         // المتأخر عليه بالريال
  missedMonths: number;    // أشهر لم يدفع فيها شيئاً
  partialMonths: number;   // أشهر دفع فيها أقل من المتوقع
  chargedMonths: number;   // الأشهر التي كان لها سعر ساري فحوسبت فعلاً
}

// يحسب المتأخرات بالريال لا بعدد الأشهر — الشهر الذي دُفع فيه أكثر من المتوقع لا يغطي شهراً آخر
export function computeArrears(input: ArrearsInput): ArrearsResult {
  const rates = input.rates;
  const flat = input.expectedMonthly ?? 0;
  if ((!rates || rates.length === 0) && flat <= 0) {
    return { expectedTotal: 0, paidTotal: 0, arrears: 0, missedMonths: 0, partialMonths: 0, chargedMonths: 0 };
  }

  let expectedTotal = 0;
  let paidTotal = 0;
  let arrears = 0;
  let missedMonths = 0;
  let partialMonths = 0;
  let chargedMonths = 0;

  const joined = input.joinedAt ? new Date(input.joinedAt) : null;
  const joinedKey = joined ? joined.getFullYear() * 12 + (joined.getMonth() + 1) : null;

  for (const m of input.dueMonths) {
    // شهر سبق انضمام العضو لا شأن له به
    if (joinedKey !== null && m.year * 12 + m.month < joinedKey) continue;

    const expected = rates && rates.length > 0 ? rateForMonth(rates, m.year, m.month) : flat;
    const paid = input.paidByMonth[`${m.year}-${m.month}`] ?? 0;
    paidTotal += paid;

    // شهر لم يكن له سعر ساري لا يُحاسَب عليه — لا يدخل المتوقع ولا المتأخر
    if (expected <= 0) continue;

    chargedMonths += 1;
    expectedTotal += expected;
    const shortfall = Math.max(0, expected - paid);
    arrears += shortfall;
    if (paid <= 0) missedMonths += 1;
    else if (shortfall > 0) partialMonths += 1;
  }

  return {
    expectedTotal: Number(expectedTotal.toFixed(3)),
    paidTotal: Number(paidTotal.toFixed(3)),
    arrears: Number(arrears.toFixed(3)),
    missedMonths,
    partialMonths,
    chargedMonths,
  };
}

// ــــ حصة العضو من الصندوق ــــ
export interface ShareContribution {
  memberId: string;
  amount: number;
  at: Date | string; // تاريخ دخول المبلغ الصندوق
}

export interface MemberShare {
  memberId: string;
  contributed: number;   // إجمالي ما ساهم به
  weight: number;        // ريال × شهر (وزن زمني)
  percent: number;       // نسبته من الصندوق
  value: number;         // مقابل نسبته من صافي الأصول الحالي
}

// الحصة مرجّحة بالزمن: ريال بقي سنة في الصندوق أثقل من ريال دخل الشهر الماضي
export function computeMemberShares(
  contributions: ShareContribution[],
  netAssets: number,
  now: Date = new Date(),
): MemberShare[] {
  const byMember = new Map<string, { contributed: number; weight: number }>();

  for (const c of contributions) {
    const at = new Date(c.at);
    const monthsHeld = Math.max(0, (now.getTime() - at.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    const entry = byMember.get(c.memberId) ?? { contributed: 0, weight: 0 };
    entry.contributed += c.amount;
    entry.weight += c.amount * monthsHeld;
    byMember.set(c.memberId, entry);
  }

  const totalWeight = Array.from(byMember.values()).reduce((s, e) => s + e.weight, 0);
  const totalContributed = Array.from(byMember.values()).reduce((s, e) => s + e.contributed, 0);

  return Array.from(byMember.entries()).map(([memberId, e]) => {
    // قبل مرور أي وقت تكون الأوزان صفراً — نرجع لنسبة المبالغ حتى لا تختفي الحصص
    const percent = totalWeight > 0
      ? (e.weight / totalWeight) * 100
      : totalContributed > 0 ? (e.contributed / totalContributed) * 100 : 0;
    return {
      memberId,
      contributed: Number(e.contributed.toFixed(3)),
      weight: Number(e.weight.toFixed(3)),
      percent: Number(percent.toFixed(2)),
      value: Number(((percent / 100) * netAssets).toFixed(3)),
    };
  }).sort((a, b) => b.percent - a.percent);
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

// ــــ الزكاة ــــ
export const ZAKAT_RATE = 0.025;        // ربع العشر
export const HAWL_DAYS = 354;           // السنة القمرية تقريباً — تبسيط موثّق بدل حساب هجري كامل

export interface ZakatResult {
  netAssets: number;
  nisab: number;
  reachesNisab: boolean;   // هل بلغ المال النصاب؟
  amount: number;          // الواجب إخراجه
}

// الزكاة 2.5٪ من صافي الأصول، ولا تجب إن لم يبلغ المال النصاب
export function computeZakat(netAssets: number, nisab: number): ZakatResult {
  const assets = Math.max(0, netAssets);
  const reachesNisab = nisab > 0 && assets >= nisab;
  return {
    netAssets: Number(assets.toFixed(3)),
    nisab: Number(Math.max(0, nisab).toFixed(3)),
    reachesNisab,
    amount: reachesNisab ? Number((assets * ZAKAT_RATE).toFixed(3)) : 0,
  };
}

// اكتمال الحول: مرور سنة قمرية على بداية الدورة
export function isHawlComplete(cycleStart: Date | string, now: Date = new Date()): boolean {
  return daysSince(cycleStart, now) >= HAWL_DAYS;
}

// الأيام المتبقية لاكتمال الحول (صفر إن اكتمل)
export function daysUntilHawl(cycleStart: Date | string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil(HAWL_DAYS - daysSince(cycleStart, now)));
}

function daysSince(from: Date | string, now: Date): number {
  return (now.getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24);
}

// ــــ الاستثمار ــــ
export interface InvestmentReturnInput {
  amount: number;          // المبلغ المستثمر
  currentValue: number;    // آخر تقييم (أو قيمة الخروج)
}

export interface InvestmentReturn {
  gain: number;            // الربح أو الخسارة بالريال
  returnPercent: number;   // نسبته من رأس المال المستثمر
}

export function computeInvestmentReturn(input: InvestmentReturnInput): InvestmentReturn {
  const gain = input.currentValue - input.amount;
  return {
    gain: Number(gain.toFixed(3)),
    returnPercent: input.amount > 0 ? Number(((gain / input.amount) * 100).toFixed(2)) : 0,
  };
}

// ــــ الأقساط المتأخرة فعلاً ــــ
export interface InstallmentLike {
  id?: string;
  loanId?: string;
  installmentNumber: number;
  amount: number | string;
  dueDate: Date | string | null;
  status: string;
}

// السداد قد يُسجَّل كمبلغ حر لا كتعليم قسط، فتبقى الأقساط «مجدولة» رغم سداد السلفة.
// لذا تُغطّى الأقساط بالترتيب بما دُفع على السلفة، ولا يُعد متأخراً إلا ما لم يغطّه الدفع
// ومضت مهلته. سلفة سُدّدت بالكامل لا أقساط متأخرة عليها إطلاقاً.
export function overdueInstallments<T extends InstallmentLike>(
  installments: T[],
  totalPaidOnLoan: number,
  now: Date = new Date(),
): T[] {
  const ordered = [...installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
  let remainingPaid = Math.max(0, totalPaidOnLoan);
  const late: T[] = [];

  for (const inst of ordered) {
    if (inst.status === "paid") continue;
    const amount = Number(inst.amount) || 0;
    if (remainingPaid >= amount) {
      remainingPaid -= amount;   // غطّاه الدفع الحر
      continue;
    }
    // مغطى جزئياً: الباقي عليه، ويُعد متأخراً إن مضت مهلته
    remainingPaid = 0;
    if (inst.dueDate && isInstallmentLate(inst.dueDate, now)) late.push(inst);
  }

  return late;
}

// المبلغ المتأخر فعلاً من قسط مغطى جزئياً يساوي ما لم يُدفع منه
export function overdueAmount<T extends InstallmentLike>(
  installments: T[],
  totalPaidOnLoan: number,
  now: Date = new Date(),
): number {
  const ordered = [...installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
  let remainingPaid = Math.max(0, totalPaidOnLoan);
  let due = 0;

  for (const inst of ordered) {
    if (inst.status === "paid") continue;
    const amount = Number(inst.amount) || 0;
    const covered = Math.min(remainingPaid, amount);
    remainingPaid -= covered;
    const uncovered = amount - covered;
    if (uncovered > 0 && inst.dueDate && isInstallmentLate(inst.dueDate, now)) due += uncovered;
  }

  return Number(due.toFixed(3));
}
