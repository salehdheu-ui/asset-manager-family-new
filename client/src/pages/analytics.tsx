import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import {
  getDashboardSummary,
  getChartData,
  getYearlyReport,
  getMembersPerformance,
  getLoansAnalysis,
  getMembers,
  getContributions,
  getLoans,
  getExpenses,
  getLoanRepayments,
  type DashboardSummary,
} from "@/lib/api";
import {
  TrendingUp,
  Users,
  Wallet,
  PieChart,
  Target,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  Gauge,
  CircleDollarSign,
  FileText,
  User,
  ChevronDown,
  ChevronUp,
  CreditCard,
  HandCoins,
  BarChart3,
  Filter,
  FileSpreadsheet,
  ArrowUpLeft,
  ArrowDownLeft,
  Brain,
  FileSearch,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  CapitalDistributionChart,
  ContributionsTrendChart,
  MemberComparisonChart,
} from "@/components/charts";
import { Button } from "@/components/ui/button";

type TransactionType = "contribution" | "loan" | "expense";
type TransactionItem = {
  id: string;
  type: TransactionType;
  title: string;
  amount: number;
  rawDate: string;
  date: string;
  year: number;
  month: number;
  memberName: string;
  status: string;
  repaymentMonths?: number;
};

const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const formatCurrency = (value: number) => `${Math.round(value).toLocaleString("en-US")} ر.ع`;
const getTransactionTypeLabel = (type: TransactionType) =>
  type === "contribution" ? "مساهمة" : type === "loan" ? "سلفة" : "مصروف";
const getTransactionColor = (type: TransactionType) =>
  type === "contribution" ? "text-emerald-600" : type === "loan" ? "text-blue-600" : "text-amber-600";

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  change?: number;
  trend?: "up" | "down" | "neutral";
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
  delay?: number;
}

function KPICard({ title, value, subtitle, change, trend, icon, gradient, iconBg, delay = 0 }: KPICardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn("group relative overflow-hidden rounded-[1.75rem] p-5 shadow-lg transition-shadow hover:shadow-xl", gradient)}
    >
      <div className="pointer-events-none absolute -left-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-white/8 blur-xl" />
      <div className="pointer-events-none absolute right-4 top-4 h-16 w-16 rounded-full bg-white/5 blur-lg transition-transform group-hover:scale-110" />
      <div className="relative flex items-start justify-between mb-4">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg ring-1 ring-white/20", iconBg)}>
          {icon}
        </div>
        {trend && (
          <span className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold backdrop-blur-sm",
            trend === "up" ? "bg-white/20 text-white" :
            trend === "down" ? "bg-black/15 text-white/90" : "bg-white/15 text-white/80"
          )}>
            {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> :
             trend === "down" ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {change !== undefined ? `${Math.abs(change)}%` : ''}
          </span>
        )}
      </div>
      <p className="relative text-[10px] font-bold uppercase tracking-widest text-white/70 mb-1">{title}</p>
      <h4 className="relative text-2xl font-extrabold font-mono text-white leading-tight">{value}</h4>
      {subtitle && <p className="relative mt-1.5 text-[11px] text-white/55">{subtitle}</p>}
    </motion.div>
  );
}

export default function Analytics() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedPeriod, setSelectedPeriod] = useState<"6months" | "12months" | "3months">("6months");
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [repayments, setRepayments] = useState<Record<string, any[]>>({});
  const [allRepaymentsTotals, setAllRepaymentsTotals] = useState(0);
  const [memberRepayments, setMemberRepayments] = useState<Record<string, number>>({});
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  /* ── Queries ── */
  const { data: dashboardSummary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
  });
  const { data: capitalChartData, isLoading: capitalChartLoading } = useQuery({
    queryKey: ["chart-data", "capital-distribution"],
    queryFn: () => getChartData("capital-distribution"),
    enabled: !!dashboardSummary,
  });
  const { data: contributionsChartData, isLoading: contributionsChartLoading } = useQuery({
    queryKey: ["chart-data", "contributions-trend", selectedPeriod],
    queryFn: () => getChartData("contributions-trend", selectedPeriod),
  });
  const { data: membersChartData, isLoading: membersChartLoading } = useQuery({
    queryKey: ["chart-data", "members-comparison"],
    queryFn: () => getChartData("members-comparison"),
  });
  const { data: yearlyReport } = useQuery({
    queryKey: ["yearly-report", selectedYear],
    queryFn: () => getYearlyReport(selectedYear),
    enabled: !!dashboardSummary,
    staleTime: 5 * 60 * 1000,
  });
  const { data: membersPerformance } = useQuery({
    queryKey: ["members-performance", selectedYear],
    queryFn: () => getMembersPerformance(selectedYear),
    enabled: !!dashboardSummary,
    staleTime: 5 * 60 * 1000,
  });
  const { data: loansAnalysis } = useQuery({
    queryKey: ["loans-analysis", selectedYear],
    queryFn: () => getLoansAnalysis(selectedYear),
    enabled: !!dashboardSummary,
    staleTime: 5 * 60 * 1000,
  });
  const { data: members = [] } = useQuery({ queryKey: ["members"], queryFn: getMembers, staleTime: 5 * 60 * 1000 });
  const { data: contributions = [] } = useQuery({ queryKey: ["contributions"], queryFn: () => getContributions(), staleTime: 5 * 60 * 1000 });
  const { data: loans = [] } = useQuery({ queryKey: ["loans"], queryFn: getLoans, staleTime: 5 * 60 * 1000 });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: getExpenses, staleTime: 5 * 60 * 1000 });

  /* ── Repayments side-effect ── */
  useEffect(() => {
    const approvedLoans = loans.filter((l) => l.status === "approved");
    if (approvedLoans.length === 0) { setAllRepaymentsTotals(0); setMemberRepayments({}); return; }
    let cancelled = false;
    (async () => {
      let total = 0;
      const perMember: Record<string, number> = {};
      for (const loan of approvedLoans) {
        const reps = await getLoanRepayments(loan.id);
        const paid = reps.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.amount), 0);
        total += paid;
        perMember[loan.memberId] = (perMember[loan.memberId] || 0) + paid;
      }
      if (!cancelled) { setAllRepaymentsTotals(total); setMemberRepayments(perMember); }
    })();
    return () => { cancelled = true; };
  }, [loans]);

  const loadRepayments = async (loanId: string) => {
    if (!repayments[loanId]) {
      const data = await getLoanRepayments(loanId);
      setRepayments((prev) => ({ ...prev, [loanId]: data }));
    }
    setExpandedLoan(expandedLoan === loanId ? null : loanId);
  };

  /* ── Derived data ── */
  const capitalDistributionData = (capitalChartData?.data || dashboardSummary?.layers || []).map((layer: any) => ({
    name: layer.arabicName || layer.name,
    value: Number(layer.value ?? layer.amount ?? 0),
    percentage: Number(layer.percentage ?? 0),
    color: layer.id === "protected" ? "#3b82f6" : layer.id === "emergency" ? "#f59e0b"
         : layer.id === "flexible" ? "#10b981" : layer.id === "growth" ? "#6366f1" : "#6b7280",
  }));

  const totalContributionsKPI = dashboardSummary?.totalContributions || 0;
  const netCapital = dashboardSummary?.netCapital || 0;
  const growthRate = 12.5;
  const attendanceRate = membersPerformance?.totals.activeMembers
    ? Math.round((membersPerformance.totals.activeMembers / (membersPerformance.members.length || 1)) * 100) : 0;
  const liquidityRatio = totalContributionsKPI > 0 ? Math.round((netCapital / totalContributionsKPI) * 100) : 0;

  const getMemberName = (memberId: string) => members.find((m) => m.id === memberId)?.name || "غير معروف";


  const transactions = useMemo<TransactionItem[]>(() => [
    ...contributions.filter((c) => c.status === "approved").map<TransactionItem>((c) => ({
      id: c.id,
      type: "contribution",
      title: `مساهمة شهر ${c.month}/${c.year}`,
      amount: Number(c.amount),
      rawDate: c.createdAt ? new Date(c.createdAt).toISOString() : "",
      date: c.createdAt ? new Date(c.createdAt).toLocaleDateString("ar-OM") : "",
      year: c.year,
      month: c.month,
      memberName: getMemberName(c.memberId),
      status: "معتمد",
      repaymentMonths: undefined,
    })),
    ...expenses.map<TransactionItem>((e) => {
      const d = e.createdAt ? new Date(e.createdAt) : null;
      return {
        id: e.id,
        type: "expense",
        title: e.title,
        amount: Number(e.amount),
        rawDate: d ? d.toISOString() : "",
        date: d ? d.toLocaleDateString("ar-OM") : "",
        year: d ? d.getFullYear() : 0,
        month: d ? d.getMonth() + 1 : 0,
        memberName: "النظام",
        status: "منفذ",
        repaymentMonths: undefined,
      };
    }),
    ...loans.filter((l) => l.status === "approved").map<TransactionItem>((l) => {
      const d = l.createdAt ? new Date(l.createdAt) : null;
      return {
        id: l.id,
        type: "loan",
        title: l.title,
        amount: Number(l.amount),
        rawDate: d ? d.toISOString() : "",
        date: d ? d.toLocaleDateString("ar-OM") : "",
        year: d ? d.getFullYear() : 0,
        month: d ? d.getMonth() + 1 : 0,
        memberName: getMemberName(l.memberId),
        status: "معتمد",
        repaymentMonths: l.repaymentMonths ?? undefined,
      };
    }),
  ].sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime()),
  [contributions, expenses, loans, members]);

  const filteredTransactions = transactions.filter((t) => {
    if (!t.rawDate) return true;
    const yearMatch = t.year === selectedYear;
    const monthMatch = filterMonth ? t.month === filterMonth : true;
    return yearMatch && monthMatch;
  });

  const memberStats = members.map((m) => {
    const mc = contributions.filter((c) => c.memberId === m.id && c.status === "approved");
    const ml = loans.filter((l) => l.memberId === m.id && l.status === "approved");
    const totalPaid = mc.reduce((s, c) => s + Number(c.amount), 0);
    const totalBorrowed = ml.reduce((s, l) => s + Number(l.amount), 0) - (memberRepayments[m.id] || 0);
    return { ...m, totalPaid, totalBorrowed, loanCount: ml.length, contributionCount: mc.length, netPosition: totalPaid - totalBorrowed };
  });

  const filteredMemberStats = memberStats.map((m) => {
    const mt = filteredTransactions.filter((t) => t.memberName === m.name);
    return {
      ...m,
      filteredContributionsTotal: mt.filter((t) => t.type === "contribution").reduce((s, t) => s + t.amount, 0),
      filteredLoansTotal: mt.filter((t) => t.type === "loan").reduce((s, t) => s + t.amount, 0),
    };
  }).sort((a, b) => b.netPosition - a.netPosition);

  const filteredContributionsTotal = filteredTransactions.filter((t) => t.type === "contribution").reduce((s, t) => s + t.amount, 0);
  const filteredExpensesTotal = filteredTransactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const filteredLoansTotal = filteredTransactions.filter((t) => t.type === "loan").reduce((s, t) => s + t.amount, 0);
  const filteredOutflow = filteredExpensesTotal + filteredLoansTotal;
  const filteredNetFlow = filteredContributionsTotal - filteredOutflow;
  const activeMembersCount = new Set(filteredTransactions.filter((t) => t.memberName !== "النظام").map((t) => t.memberName)).size;
  const averageContribution = filteredTransactions.filter((t) => t.type === "contribution").length > 0
    ? filteredContributionsTotal / filteredTransactions.filter((t) => t.type === "contribution").length : 0;
  const topContributor = filteredMemberStats.filter((m) => m.filteredContributionsTotal > 0).sort((a, b) => b.filteredContributionsTotal - a.filteredContributionsTotal)[0];
  const highestBorrower = filteredMemberStats.filter((m) => m.filteredLoansTotal > 0).sort((a, b) => b.filteredLoansTotal - a.filteredLoansTotal)[0];

  const availableYears = Array.from(new Set([new Date().getFullYear(), ...transactions.map((t) => t.year).filter(Boolean)])).sort((a, b) => b - a);

  /* ── Export ── */
  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      const XLSX = await import("xlsx");
      const periodLabel = filterMonth ? `${monthNames[filterMonth - 1]} ${selectedYear}` : `سنة ${selectedYear}`;
      const wb = XLSX.utils.book_new();
      const summarySheet = XLSX.utils.json_to_sheet([
        { المؤشر: "الفترة", القيمة: periodLabel },
        { المؤشر: "إجمالي المساهمات", القيمة: filteredContributionsTotal },
        { المؤشر: "إجمالي السلف", القيمة: filteredLoansTotal },
        { المؤشر: "إجمالي المصروفات", القيمة: filteredExpensesTotal },
        { المؤشر: "صافي التدفق", القيمة: filteredNetFlow },
        { المؤشر: "المسدد من السلف", القيمة: allRepaymentsTotals },
        { المؤشر: "الأعضاء النشطون", القيمة: activeMembersCount },
        { المؤشر: "عدد الحركات", القيمة: filteredTransactions.length },
        { المؤشر: "متوسط المساهمة", القيمة: Math.round(averageContribution) },
        { المؤشر: "أعلى مساهم", القيمة: topContributor ? `${topContributor.name} - ${formatCurrency(topContributor.filteredContributionsTotal)}` : "لا يوجد" },
      ]);
      const txSheet = XLSX.utils.json_to_sheet(filteredTransactions.map((t) => ({
        التاريخ: t.date, النوع: getTransactionTypeLabel(t.type), العنوان: t.title,
        المبلغ: t.amount, العضو: t.memberName, الحالة: t.status,
        السنة: t.year, الشهر: t.month ? monthNames[t.month - 1] : "",
      })));
      const membersSheet = XLSX.utils.json_to_sheet(filteredMemberStats.map((m, i) => ({
        الترتيب: i + 1, الاسم: m.name, الصفة: m.role === "guardian" ? "الوصي" : "عضو",
        إجمالي_المساهمات: m.totalPaid, إجمالي_السلف_القائمة: m.totalBorrowed,
        مساهمات_الفترة: m.filteredContributionsTotal, سلف_الفترة: m.filteredLoansTotal,
        عدد_المساهمات: m.contributionCount, عدد_السلف: m.loanCount, صافي_المركز: m.netPosition,
      })));
      summarySheet["!cols"] = [{ wch: 28 }, { wch: 28 }];
      txSheet["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 20 }, { wch: 14 }];
      membersSheet["!cols"] = [{ wch: 8 }, { wch: 22 }, { wch: 12 }, ...Array(7).fill({ wch: 16 })];
      XLSX.utils.book_append_sheet(wb, summarySheet, "الملخص");
      XLSX.utils.book_append_sheet(wb, txSheet, "الحركات");
      XLSX.utils.book_append_sheet(wb, membersSheet, "الأعضاء");
      XLSX.writeFile(wb, `تقرير-الصندوق-${selectedYear}${filterMonth ? `-${filterMonth}` : ""}.xlsx`);
    } finally {
      setIsExporting(false);
    }
  };

  const insightCards = [
    { title: "مؤشر السيولة", desc: `${liquidityRatio}% من إجمالي المساهمات في صافي الأصول.`, icon: Gauge, tone: "bg-emerald-50 text-emerald-700 border-emerald-100" },
    { title: "ملخص مالي سريع", desc: "راقب التدفقات والمساهمات وجودة السداد بزاوية تحليلية.", icon: Brain, tone: "bg-violet-50 text-violet-700 border-violet-100" },
    { title: "تصدير جاهز", desc: "نزّل تقرير Excel مفصلاً يشمل الملخص والحركات وكشف الأعضاء.", icon: FileSearch, tone: "bg-blue-50 text-blue-700 border-blue-100" },
  ];

  /* ── Render ── */
  const visibleTransactions = showAllTransactions ? filteredTransactions : filteredTransactions.slice(0, 6);

  return (
    <MobileLayout title="التقارير والتحليلات">
      <div className="space-y-7 pt-2 pb-14">

        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-primary/90 to-emerald-600 p-6 shadow-xl"
        >
          <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-emerald-400/15 blur-2xl" />
          <div className="pointer-events-none absolute right-12 top-6 h-20 w-20 rounded-full bg-white/5 blur-xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-[11px] font-bold text-white/90 backdrop-blur-sm ring-1 ring-white/10">
                <Sparkles className="h-3.5 w-3.5" />
                تقارير وتحليلات مالية متكاملة
              </div>
              <h2 className="font-heading text-xl font-bold text-white leading-relaxed">لوحة القرار المالي الشاملة</h2>
              <p className="text-[13px] leading-7 text-white/65">
                مؤشرات، رسوم، كشف أعضاء، وسجل كامل للحركات مع تصدير Excel.
              </p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 shadow-lg ring-1 ring-white/10 backdrop-blur-sm">
              <BarChart3 className="h-7 w-7 text-white" />
            </div>
          </div>
        </motion.div>

        {/* ── Insight pills ── */}
        <div className="grid grid-cols-1 gap-3">
          {insightCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + idx * 0.08, duration: 0.4 }}
                className={cn("flex items-start gap-3 rounded-[1.5rem] border p-4", card.tone)}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/60">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold mb-1">{card.title}</p>
                  <p className="text-[11px] leading-5 opacity-80">{card.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ── Year + Period selector ── */}
        <div className="rounded-[1.75rem] border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold text-base text-primary font-heading flex items-center gap-2">
                <Calendar className="w-4 h-4" /> نظرة تحليلية عامة
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">غيّر السنة والفترة لمقارنة المؤشرات.</p>
            </div>
            <div className="flex gap-1.5 rounded-2xl bg-muted/60 p-1">
              {availableYears.slice(0, 3).map(year => (
                <button key={year} onClick={() => setSelectedYear(year)}
                  className={cn("px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200",
                    selectedYear === year
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/60")}>
                  {year}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 4 KPI Cards ── */}
        <div className="grid grid-cols-2 gap-3">
          <KPICard title="إجمالي الأصول" value={`${netCapital.toLocaleString()} ر.ع`} change={growthRate} trend="up"
            subtitle="صافي رأس المال الحالي"
            icon={<Wallet className="w-5 h-5 text-white" />}
            gradient="bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700" iconBg="bg-white/20" delay={0} />
          <KPICard title="المساهمات" value={`${totalContributionsKPI.toLocaleString()} ر.ع`} change={8.2} trend="up"
            subtitle="إجمالي الإيداعات المعتمدة"
            icon={<TrendingUp className="w-5 h-5 text-white" />}
            gradient="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700" iconBg="bg-white/20" delay={1} />
          <KPICard title="الأعضاء النشطين" value={`${attendanceRate}%`} change={5.1} trend="up"
            subtitle={`من أصل ${membersPerformance?.members.length || 0} عضو`}
            icon={<Users className="w-5 h-5 text-white" />}
            gradient="bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700" iconBg="bg-white/20" delay={2} />
          <KPICard title="نسبة السداد" value={`${loansAnalysis?.summary.repaymentRate || 0}%`}
            change={loansAnalysis?.summary.repaymentRate ? loansAnalysis.summary.repaymentRate - 80 : 0}
            trend={loansAnalysis?.summary.repaymentRate && loansAnalysis.summary.repaymentRate > 80 ? "up" : "down"}
            subtitle="جودة الالتزام بالسداد"
            icon={<Target className="w-5 h-5 text-white" />}
            gradient="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500" iconBg="bg-white/20" delay={3} />
        </div>

        {/* ── Highlight cards (top contributor / borrower / avg) ── */}
        <div className="space-y-3">
          {[
            {
              label: "أقوى مساهم", name: topContributor?.name || "لا يوجد",
              value: topContributor ? formatCurrency(topContributor.filteredContributionsTotal) : "—",
              Icon: ArrowUpLeft,
              border: "border-emerald-200/80", bg: "bg-gradient-to-br from-emerald-50 via-white to-emerald-50/30",
              iconBg: "bg-emerald-500 text-white", labelColor: "text-emerald-600", nameColor: "text-emerald-900", valueColor: "text-emerald-700",
            },
            {
              label: "أعلى سلفة", name: highestBorrower?.name || "لا يوجد",
              value: highestBorrower ? formatCurrency(highestBorrower.filteredLoansTotal) : "—",
              Icon: ArrowDownLeft,
              border: "border-blue-200/80", bg: "bg-gradient-to-br from-blue-50 via-white to-blue-50/30",
              iconBg: "bg-blue-500 text-white", labelColor: "text-blue-600", nameColor: "text-blue-900", valueColor: "text-blue-700",
            },
            {
              label: "متوسط المساهمة", name: formatCurrency(averageContribution),
              value: `${filteredTransactions.filter((t) => t.type === "contribution").length} مساهمة`,
              Icon: CircleDollarSign,
              border: "border-amber-200/80", bg: "bg-gradient-to-br from-amber-50 via-white to-amber-50/30",
              iconBg: "bg-amber-500 text-white", labelColor: "text-amber-600", nameColor: "text-amber-900", valueColor: "text-amber-700",
            },
          ].map((card, idx) => (
            <motion.div key={card.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + idx * 0.07, duration: 0.4 }}
              className={cn("relative overflow-hidden rounded-[1.75rem] border p-4", card.border, card.bg)}
            >
              <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-current opacity-[0.03]" />
              <div className="flex items-center gap-3.5">
                <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-md", card.iconBg)}>
                  <card.Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[10px] font-bold uppercase tracking-wider", card.labelColor)}>{card.label}</p>
                  <p className={cn("truncate text-[15px] font-bold leading-snug mt-0.5", card.nameColor)}>{card.name}</p>
                  <p className={cn("text-[11px] font-medium mt-0.5", card.valueColor)}>{card.value}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Charts ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-primary flex items-center gap-2 font-heading">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                <PieChart className="w-4 h-4" />
              </div>
              الرسوم البيانية
            </h3>
            <div className="flex gap-1 rounded-2xl bg-muted/60 p-1">
              {[{ label: "3 أشهر", value: "3months" }, { label: "6 أشهر", value: "6months" }, { label: "سنة", value: "12months" }].map((p) => (
                <button key={p.value} onClick={() => setSelectedPeriod(p.value as typeof selectedPeriod)}
                  className={cn("rounded-xl px-3 py-1.5 text-[10px] font-bold transition-all duration-200",
                    selectedPeriod === p.value ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground")}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <CapitalDistributionChart data={capitalDistributionData} loading={summaryLoading || capitalChartLoading} delay={0} />
            <ContributionsTrendChart data={contributionsChartData?.data || []} loading={contributionsChartLoading} delay={1} />
          </div>
          <MemberComparisonChart data={membersChartData?.data || []} loading={membersChartLoading} delay={2} limit={5} />
        </div>

        {/* ── Yearly report ── */}
        {yearlyReport && (
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-primary flex items-center gap-2 font-heading">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                <Calendar className="w-4 h-4" />
              </div>
              التحليل السنوي {selectedYear}
            </h3>
            <div className="overflow-hidden rounded-[2rem] border border-border/50 bg-card shadow-md">
              {/* Summary row */}
              <div className="grid grid-cols-3">
                {[
                  { label: "المساهمات", value: yearlyReport.summary.totalContributions, gradient: "from-emerald-500 to-teal-600", icon: TrendingUp },
                  { label: "السلف", value: yearlyReport.summary.totalLoans, gradient: "from-blue-500 to-indigo-600", icon: CreditCard },
                  { label: "المصروفات", value: yearlyReport.summary.totalExpenses, gradient: "from-amber-500 to-orange-600", icon: Wallet },
                ].map((item, idx) => (
                  <div key={item.label} className={cn("flex flex-col items-center gap-1.5 p-5 relative", idx < 2 && "border-l border-border/30")}>
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md", item.gradient)}>
                      <item.icon className="w-4.5 h-4.5" />
                    </div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                    <p className="text-base font-extrabold font-mono text-foreground">{item.value.toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground/70">ر.ع</p>
                  </div>
                ))}
              </div>
              {/* Monthly bars */}
              <div className="border-t border-border/30 bg-gradient-to-b from-muted/20 to-transparent p-5">
                <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">التطور الشهري للمساهمات</p>
                <div className="flex items-end gap-1.5 h-24">
                  {yearlyReport.monthlyData.map((month, idx) => {
                    const maxVal = Math.max(...yearlyReport.monthlyData.map((m) => m.contributions));
                    const height = maxVal > 0 ? (month.contributions / maxVal) * 100 : 0;
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group cursor-default">
                        <span className="text-[8px] font-bold font-mono text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                          {month.contributions > 0 ? month.contributions.toLocaleString() : ""}
                        </span>
                        <div className="w-full rounded-lg bg-gradient-to-t from-emerald-500 to-emerald-400 shadow-sm transition-all duration-300 group-hover:from-emerald-600 group-hover:to-emerald-500 group-hover:shadow-emerald-200"
                          style={{ height: `${height}%`, minHeight: height > 0 ? "6px" : "0" }} />
                        <span className="text-[7px] font-medium text-muted-foreground/70 group-hover:text-foreground transition-colors">{month.monthName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Loans analysis ── */}
        {loansAnalysis && (
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-primary flex items-center gap-2 font-heading">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                <CircleDollarSign className="w-4 h-4" />
              </div>
              تحليل السلف
            </h3>
            <div className="overflow-hidden rounded-[2rem] border border-border/50 bg-card shadow-md">
              <div className="grid grid-cols-2">
                <div className="flex flex-col items-center gap-2 p-6 border-l border-border/30">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">إجمالي السلف</p>
                  <p className="text-4xl font-extrabold font-mono text-blue-600">{loansAnalysis.summary.totalLoans}</p>
                  <p className="text-[10px] text-muted-foreground/70">سلفة</p>
                </div>
                <div className="flex flex-col items-center gap-2 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">المبلغ الإجمالي</p>
                  <p className="text-2xl font-extrabold font-mono text-emerald-600">{loansAnalysis.summary.totalAmount.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground/70">ر.ع</p>
                </div>
              </div>
              <div className="border-t border-border/30 bg-gradient-to-b from-muted/20 to-transparent p-5 space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">التوزيع حسب النوع</p>
                {Object.entries(loansAnalysis.byType).map(([type, data]) => {
                  const labels: Record<string, string> = { urgent: "عاجلة", standard: "عادية", emergency: "طوارئ" };
                  const gradients: Record<string, string> = { urgent: "from-red-500 to-rose-500", standard: "from-blue-500 to-indigo-500", emergency: "from-amber-500 to-orange-500" };
                  const dotColors: Record<string, string> = { urgent: "bg-red-500", standard: "bg-blue-500", emergency: "bg-amber-500" };
                  const pct = loansAnalysis.summary.totalLoans > 0 ? Math.round((data.count / loansAnalysis.summary.totalLoans) * 100) : 0;
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <div className={cn("w-3 h-3 rounded-full shrink-0 shadow-sm", dotColors[type])} />
                      <span className="text-sm font-bold w-14 shrink-0 text-foreground">{labels[type] || type}</span>
                      <div className="flex-1 bg-muted/60 rounded-full h-2.5 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className={cn("h-full rounded-full bg-gradient-to-r shadow-sm", gradients[type])}
                        />
                      </div>
                      <span className="text-xs font-extrabold w-10 text-right shrink-0 font-mono text-foreground">{data.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Filter + Export ── */}
        <div className="rounded-[2rem] border border-border/50 bg-gradient-to-b from-card via-card to-muted/10 p-5 shadow-md space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-lg text-primary flex items-center gap-2 font-heading">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                  <Filter className="w-4 h-4" />
                </div>
                الفلاتر والتصدير
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground">اختر السنة والشهر ثم نزّل تقرير Excel مفصلاً.</p>
            </div>
            <button onClick={() => setShowFilters(!showFilters)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-muted/40 text-muted-foreground transition-all hover:bg-muted/70">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", showFilters && "rotate-180")} />
            </button>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }} className="overflow-hidden">
                <div className="grid grid-cols-1 gap-4 pt-1 pb-2">
                  <div>
                    <label className="mb-2 block text-[11px] font-bold text-muted-foreground">السنة</label>
                    <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}
                      className="h-11 w-full rounded-2xl border border-border/50 bg-background px-4 text-sm font-medium outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/10">
                      {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-[11px] font-bold text-muted-foreground">الشهر</label>
                    <select value={filterMonth || ""} onChange={(e) => setFilterMonth(e.target.value ? Number(e.target.value) : null)}
                      className="h-11 w-full rounded-2xl border border-border/50 bg-background px-4 text-sm font-medium outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/10">
                      <option value="">كل الأشهر</option>
                      {monthNames.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={exportToExcel} disabled={isExporting}
                      className="h-11 w-full rounded-2xl gap-2 bg-gradient-to-r from-primary to-emerald-600 px-6 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all">
                      <FileSpreadsheet className="h-4 w-4" />
                      {isExporting ? "جاري التجهيز..." : "تنزيل Excel"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "الحركات", value: String(filteredTransactions.length), icon: FileText },
              { label: "المساهمات", value: formatCurrency(filteredContributionsTotal), icon: TrendingUp },
              { label: "المسدد من السلف", value: formatCurrency(allRepaymentsTotals), icon: HandCoins },
              { label: "صافي التدفق", value: formatCurrency(filteredNetFlow), icon: Gauge, colored: true, positive: filteredNetFlow >= 0 },
            ].map((s) => {
              const SIcon = s.icon;
              return (
                <div key={s.label} className="rounded-2xl border border-border/40 bg-background/80 px-3.5 py-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <SIcon className="w-3 h-3 text-muted-foreground/60" />
                    <p className="text-[10px] font-bold text-muted-foreground">{s.label}</p>
                  </div>
                  <p className={cn("text-sm font-extrabold font-mono", s.colored ? (s.positive ? "text-emerald-600" : "text-rose-600") : "text-foreground")}>
                    {s.value}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Member stats ── */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg text-primary flex items-center gap-2 font-heading">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <User className="w-4 h-4" />
            </div>
            كشف الأعضاء
            <span className="mr-auto text-[10px] bg-muted/70 px-2.5 py-1 rounded-full font-bold text-muted-foreground">
              {filteredMemberStats.length} عضو
            </span>
          </h3>
          {filteredMemberStats.length === 0 ? (
            <div className="text-center py-10 bg-muted/10 rounded-[2rem] border border-dashed border-border/50">
              <Users className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground font-medium">لا يوجد أعضاء</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMemberStats.map((m, idx) => {
                const rankColors = ["from-amber-500 to-yellow-500", "from-slate-400 to-slate-500", "from-orange-400 to-amber-500"];
                const rankBg = idx < 3 ? `bg-gradient-to-br ${rankColors[idx]} text-white` : "bg-primary/10 text-primary";
                return (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                    className="overflow-hidden rounded-[1.75rem] border border-border/40 bg-card shadow-md">
                    <div className="p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className={cn("flex h-11 w-11 items-center justify-center rounded-full font-bold text-sm shadow-md", rankBg)}>
                              {(m as any).avatar || m.name.substring(0, 2)}
                            </div>
                            <span className={cn("absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-extrabold ring-2 ring-card",
                              idx < 3 ? `bg-gradient-to-br ${rankColors[idx]} text-white` : "bg-muted text-muted-foreground")}>
                              {idx + 1}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-bold text-sm">{m.name}</h4>
                            <p className="text-[11px] text-muted-foreground">
                              {m.role === "guardian" ? "الوصي" : "عضو"} • {m.contributionCount} مساهمة • {m.loanCount} سلفة
                            </p>
                          </div>
                        </div>
                        <span className={cn("rounded-xl px-3 py-1.5 text-[10px] font-bold shadow-sm",
                          m.netPosition >= 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100")}>
                          {m.netPosition >= 0 ? "إيجابي" : "مديونية"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        {[
                          { label: "إجمالي الدفع", value: formatCurrency(m.totalPaid), border: "border-emerald-100", bg: "bg-emerald-50/70", color: "text-emerald-700" },
                          { label: "مساهمات الفترة", value: formatCurrency(m.filteredContributionsTotal), border: "border-blue-100", bg: "bg-blue-50/70", color: "text-blue-700" },
                          { label: "السلف القائمة", value: formatCurrency(m.totalBorrowed), border: "border-amber-100", bg: "bg-amber-50/70", color: "text-amber-700" },
                          { label: "صافي المركز", value: formatCurrency(m.netPosition), border: "border-violet-100", bg: "bg-violet-50/70", color: "text-violet-700" },
                        ].map((s) => (
                          <div key={s.label} className={cn("rounded-xl border p-2.5", s.border, s.bg)}>
                            <p className={cn("text-[9px] font-bold uppercase tracking-wider", s.color)}>{s.label}</p>
                            <div className={cn("mt-1 text-[13px] font-extrabold font-mono", s.color)}>{s.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Transaction log ── */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg text-primary flex items-center gap-2 font-heading">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <FileText className="w-4 h-4" />
            </div>
            السجل العام للمعاملات
            <span className="mr-auto text-[10px] bg-primary/10 px-2.5 py-1 rounded-full font-bold text-primary">
              {filteredTransactions.length} حركة
            </span>
          </h3>
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-10 bg-muted/10 rounded-[2rem] border border-dashed border-border/50">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground font-medium">لا توجد معاملات في الفترة المحددة</p>
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {visibleTransactions.map((t, idx) => {
                  const typeConfig = {
                    contribution: { gradient: "from-emerald-500 to-teal-600", bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-700", badge: "bg-emerald-50 text-emerald-700 border-emerald-100" },
                    loan: { gradient: "from-blue-500 to-indigo-600", bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-700", badge: "bg-blue-50 text-blue-700 border-blue-100" },
                    expense: { gradient: "from-amber-500 to-orange-600", bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-700", badge: "bg-amber-50 text-amber-700 border-amber-100" },
                  }[t.type];
                  return (
                    <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.025 }}
                      className="overflow-hidden rounded-[1.5rem] border border-border/40 bg-card shadow-sm">
                      <div className="p-4">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex gap-3 min-w-0">
                            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md shrink-0", typeConfig.gradient)}>
                              {t.type === "contribution" ? <CreditCard className="w-4 h-4" />
                                : t.type === "loan" ? <HandCoins className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h5 className="text-[13px] font-bold leading-tight">{t.title}</h5>
                                <span className={cn("rounded-lg border px-2 py-0.5 text-[9px] font-bold", typeConfig.badge)}>
                                  {getTransactionTypeLabel(t.type)}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-1">
                                {t.memberName} • {t.date}{t.month ? ` • ${monthNames[t.month - 1]}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={cn("text-[15px] font-extrabold font-mono tracking-tighter", getTransactionColor(t.type))}>
                              {t.type === "contribution" ? "+" : "−"}{t.amount.toLocaleString("en-US")}
                              <span className="text-[9px] font-sans font-bold opacity-70"> ر.ع</span>
                            </div>
                            {t.type === "loan" && (
                              <button onClick={() => loadRepayments(t.id)}
                                className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10">
                                خطة السداد {expandedLoan === t.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <AnimatePresence>
                        {expandedLoan === t.id && repayments[t.id] && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }} className="overflow-hidden">
                            <div className="border-t border-border/30 bg-gradient-to-b from-muted/15 to-transparent px-4 pb-4 pt-3 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
                                  <Calendar className="w-3 h-3" /> جدولة الأقساط ({t.repaymentMonths || 12} شهر)
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {repayments[t.id].slice(0, 4).map((step) => (
                                  <div key={step.id} className="flex items-center justify-between rounded-xl border border-border/30 bg-card p-2.5">
                                    <div>
                                      <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">القسط {step.installmentNumber}</div>
                                      <div className="text-xs font-extrabold font-mono text-foreground">{Number(step.amount).toFixed(3)} ر.ع</div>
                                    </div>
                                    <span className={cn("rounded-lg px-2 py-0.5 text-[8px] font-bold",
                                      step.status === "paid" ? "bg-emerald-500 text-white shadow-sm" : "bg-muted text-muted-foreground")}>
                                      {step.status === "paid" ? "مدفوع" : "مجدول"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {repayments[t.id].length > 4 && (
                                <p className="text-center text-[9px] text-muted-foreground/70">
                                  تم عرض أول 4 أقساط • الإجمالي {repayments[t.id].length} قسطًا
                                </p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
              {filteredTransactions.length > 6 && (
                <button onClick={() => setShowAllTransactions(!showAllTransactions)}
                  className="w-full rounded-2xl border border-primary/20 bg-primary/5 py-3.5 text-sm font-bold text-primary transition-all hover:bg-primary/10 hover:shadow-md">
                  {showAllTransactions ? "عرض أقل ↑" : `عرض جميع المعاملات (${filteredTransactions.length})`}
                </button>
              )}
            </>
          )}
        </div>

      </div>
    </MobileLayout>
  );
}
