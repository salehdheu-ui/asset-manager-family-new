import { storage } from "../storage";
import { getAllocationForYear } from "../capital-engine";

export interface DashboardSummaryResult {
  totalContributions: number;
  totalLoans: number;
  totalExpenses: number;
  totalRepayments: number;
  totalDeposits: number;
  totalWithdrawals: number;
  netCapital: number;
  /** الرصيد الحقيقي بلا تصفير — سالبٌ إن تجاوز الخارج الداخل */
  actualNetCapital: number;
  /** الصندوق في عجز: خرج منه أكثر مما دخله */
  inDeficit: boolean;
  allocation: any;
  lockedNetAssets: number;
  layers: Array<{
    id: string;
    name: string;
    percentage: number;
    amount: number;
    locked: boolean;
    used: number;
    available: number;
  }>;
}

export async function computeDashboardSummary(): Promise<DashboardSummaryResult> {
  const currentYear = new Date().getFullYear();
  const [allContributions, allLoans, allExpenses, settings, allAdjustments] = await Promise.all([
    storage.getContributions(),
    storage.getLoans(),
    storage.getActiveExpenses(),
    storage.getFamilySettings(),
    storage.getFundAdjustments()
  ]);

  const approvedContributions = allContributions.filter(c => c.status === "approved");
  const approvedLoans = allLoans.filter(l => l.status === "approved");

  const totalContributions = approvedContributions.reduce((sum, c) => sum + Number(c.amount), 0);
  const totalLoans = approvedLoans.reduce((sum, l) => sum + Number(l.amount), 0);
  const totalExpenses = allExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalDeposits = allAdjustments.filter(a => a.type === 'deposit').reduce((sum, a) => sum + Number(a.amount), 0);
  const totalWithdrawals = allAdjustments.filter(a => a.type === 'withdrawal').reduce((sum, a) => sum + Number(a.amount), 0);

  // مجموع السداد على السلف المعتمدة — استعلام واحد بدل تحميل جدول الدفعات كاملاً
  const totalRepayments = await storage.getRepaidTotalOnApprovedLoans();

  const netCapital = totalContributions + totalDeposits - totalWithdrawals - totalLoans + totalRepayments - totalExpenses;
  // التصفير لازم لحساب الطبقات (نسبة من رقم سالب لا معنى لها)، لكنه كان يُخفي
  // العجز عن الوصي في الشاشة التي يقرأها كل يوم — فيبقى الرقمان معاً: مصفَّر
  // للحساب، وحقيقي للعرض
  const capital = Math.max(0, netCapital);

  const percents = settings || { protectedPercent: 45, emergencyPercent: 15, flexiblePercent: 20, growthPercent: 20 };
  const allocation = await getAllocationForYear(currentYear);

  return {
    totalContributions,
    totalLoans,
    totalExpenses,
    totalRepayments,
    totalDeposits,
    totalWithdrawals,
    netCapital: capital,
    actualNetCapital: Number(netCapital.toFixed(3)),
    inDeficit: netCapital < 0,
    allocation,
    lockedNetAssets: allocation.netAssets,
    layers: [
      { id: "protected", name: "رأس المال المحمي", percentage: percents.protectedPercent, amount: allocation.protected.amount, locked: true, used: 0, available: 0 },
      { id: "emergency", name: "احتياطي الطوارئ", percentage: percents.emergencyPercent, amount: allocation.emergency.amount, locked: true, used: allocation.emergency.used, available: allocation.emergency.available },
      { id: "flexible", name: "رأس المال المرن", percentage: percents.flexiblePercent, amount: allocation.flexible.amount, locked: false, used: allocation.flexible.used, available: allocation.flexible.available },
      { id: "growth", name: "رأس مال النمو", percentage: percents.growthPercent, amount: allocation.growth.amount, locked: true, used: allocation.growth.used, available: allocation.growth.available },
    ]
  };
}
