import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import MemberStatement from "@/components/analytics/MemberStatement";
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
import { cn, formatCurrency } from "@/lib/utils";
import { downloadExcel } from "@/lib/excel";
import { buildAnalyticsSheets } from "@/lib/analytics-export";
import {
  CapitalDistributionChart,
  ContributionsTrendChart,
  MemberComparisonChart,
  CashflowForecastChart,
} from "@/components/charts";
import { getCashflowForecast } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
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

const getTransactionTypeLabel = (type: TransactionType) =>
  type === "contribution" ? "مساهمة" : type === "loan" ? "سلفة" : "مصروف";
const getTransactionColor = (type: TransactionType) =>
  type === "contribution" ? "text-fund-in" : type === "loan" ? "text-fund-loan" : "text-fund-out";

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
      className={cn("group relative overflow-hidden rounded-xl p-5 shadow-lg transition-shadow hover:shadow-xl", gradient)}
    >
      <div className="pointer-events-none absolute -left-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-white/8 blur-xl" />
      <div className="pointer-events-none absolute right-4 top-4 h-16 w-16 rounded-full bg-white/5 blur-lg transition-transform group-hover:scale-110" />
      <div className="relative flex items-start justify-between mb-4">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg shadow-lg ring-1 ring-white/20", iconBg)}>
          {icon}
        </div>
        {trend && (
          <span className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold backdrop-blur-sm",
            trend === "up" ? "bg-white/20 text-white" :
            trend === "down" ? "bg-black/15 text-white/90" : "bg-white/15 text-white/80"
          )}>
            {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> :
             trend === "down" ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {change !== undefined ? `${Math.abs(change)}%` : ''}
          </span>
        )}
      </div>
      <p className="relative text-xs font-bold uppercase tracking-widest text-white/70 mb-1">{title}</p>
      <h4 className="relative text-2xl font-extrabold font-mono text-white leading-tight">{value}</h4>
      {subtitle && <p className="relative mt-1.5 text-xs text-white/55">{subtitle}</p>}
    </motion.div>
  );
}

export default function Analytics() {
  const [, setLocation] = useLocation();
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === "admin";
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedPeriod, setSelectedPeriod] = useState<"6months" | "12months" | "3months">("6months");
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [repayments, setRepayments] = useState<Record<string, any[]>>({});
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
  const { data: cashflowForecast, isLoading: forecastLoading } = useQuery({
    queryKey: ["cashflow-forecast"],
    queryFn: getCashflowForecast,
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

  /* ── المسدَّد من السلف ──
     كان هنا طلب شبكة مستقل لكل سلفة معتمدة، متسلسلة واحداً بعد الآخر، لمجرد
     جمع ما سُدِّد. قائمة السلف نفسها تحمل totalPaid لكل سلفة، فالمجموع يُحسب
     من بيانات في اليد بلا طلب واحد. */
  const { allRepaymentsTotals, memberRepayments } = useMemo(() => {
    let total = 0;
    const perMember: Record<string, number> = {};
    for (const loan of loans) {
      if (loan.status !== "approved") continue;
      total += loan.totalPaid;
      perMember[loan.memberId] = (perMember[loan.memberId] || 0) + loan.totalPaid;
    }
    return { allRepaymentsTotals: total, memberRepayments: perMember };
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
    color: layer.id === "protected" ? "var(--chart-loan)" : layer.id === "emergency" ? "var(--chart-out)"
         : layer.id === "flexible" ? "var(--chart-in)" : layer.id === "growth" ? "var(--chart-loan)" : "var(--chart-axis)",
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
    const totalLoaned = ml.reduce((s, l) => s + Number(l.amount), 0);
    const totalRepaid = memberRepayments[m.id] || 0;
    const totalBorrowed = totalLoaned - totalRepaid;
    return { ...m, totalPaid, totalBorrowed, totalLoaned, totalRepaid, loanCount: ml.length, contributionCount: mc.length, netPosition: totalPaid - totalBorrowed };
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
      const periodLabel = filterMonth ? `${monthNames[filterMonth - 1]} ${selectedYear}` : `سنة ${selectedYear}`;
      const sheets = buildAnalyticsSheets({
        periodLabel,
        monthNames,
        formatCurrency,
        getTransactionTypeLabel,
        totals: {
          contributions: filteredContributionsTotal,
          loans: filteredLoansTotal,
          expenses: filteredExpensesTotal,
          netFlow: filteredNetFlow,
          repayments: allRepaymentsTotals,
          activeMembers: activeMembersCount,
          averageContribution,
        },
        topContributor,
        transactions: filteredTransactions,
        memberStats: filteredMemberStats,
      });
      await downloadExcel(`تقرير-الصندوق-${selectedYear}${filterMonth ? `-${filterMonth}` : ""}.xlsx`, sheets);
    } finally {
      setIsExporting(false);
    }
  };

  const insightCards = [
    { title: "مؤشر السيولة", desc: `${liquidityRatio}% من إجمالي المساهمات في صافي الأصول.`, icon: Gauge, tone: "bg-fund-in-bright/20 text-fund-in border-fund-in-bright/40" },
    { title: "ملخص مالي سريع", desc: "راقب التدفقات والمساهمات وجودة السداد بزاوية تحليلية.", icon: Brain, tone: "bg-secondary/10 text-primary border-secondary/22" },
    { title: "تصدير جاهز", desc: "نزّل تقرير Excel مفصلاً يشمل الملخص والحركات وكشف الأعضاء.", icon: FileSearch, tone: "bg-fund-loan-bright/20 text-fund-loan border-fund-loan-bright/40" },
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
          className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary/90 to-fund-in p-6 shadow-xl"
        >
          <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-fund-in-bright/20 blur-2xl" />
          <div className="pointer-events-none absolute right-12 top-6 h-20 w-20 rounded-full bg-white/5 blur-xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-bold text-white/90 backdrop-blur-sm ring-1 ring-white/10">
                <Sparkles className="h-3.5 w-3.5" />
                تقارير وتحليلات مالية متكاملة
              </div>
              <h2 className="font-heading text-xl font-bold text-white leading-relaxed">لوحة القرار المالي الشاملة</h2>
              <p className="text-[13px] leading-7 text-white/65">
                مؤشرات، رسوم، كشف أعضاء، وسجل كامل للحركات مع تصدير Excel.
              </p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white/15 shadow-lg ring-1 ring-white/10 backdrop-blur-sm">
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
                className={cn("flex items-start gap-3 rounded-xl border p-4", card.tone)}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/60">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold mb-1">{card.title}</p>
                  <p className="text-xs leading-5 opacity-80">{card.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ── Year + Period selector ── */}
        <div className="rounded-xl border border-border/80 bg-card/50 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold text-base text-primary font-heading flex items-center gap-2">
                <Calendar className="w-4 h-4" /> نظرة تحليلية عامة
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">غيّر السنة والفترة لمقارنة المؤشرات.</p>
            </div>
            <div className="flex gap-1.5 rounded-lg bg-muted/60 p-1">
              {availableYears.slice(0, 3).map(year => (
                <button key={year} onClick={() => setSelectedYear(year)}
                  className={cn("tap-target", "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200",
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
            gradient="bg-gradient-to-br from-fund-loan via-fund-loan to-fund-loan" iconBg="bg-white/20" delay={0} />
          <KPICard title="المساهمات" value={`${totalContributionsKPI.toLocaleString()} ر.ع`} change={8.2} trend="up"
            subtitle="إجمالي الإيداعات المعتمدة"
            icon={<TrendingUp className="w-5 h-5 text-white" />}
            gradient="bg-gradient-to-br from-fund-in via-fund-in to-fund-in" iconBg="bg-white/20" delay={1} />
          <KPICard title="الأعضاء النشطين" value={`${attendanceRate}%`} change={5.1} trend="up"
            subtitle={`من أصل ${membersPerformance?.members.length || 0} عضو`}
            icon={<Users className="w-5 h-5 text-white" />}
            gradient="bg-gradient-to-br from-secondary via-secondary to-fund-loan" iconBg="bg-white/20" delay={2} />
          <KPICard title="نسبة السداد" value={`${loansAnalysis?.summary.repaymentRate || 0}%`}
            change={loansAnalysis?.summary.repaymentRate ? loansAnalysis.summary.repaymentRate - 80 : 0}
            trend={loansAnalysis?.summary.repaymentRate && loansAnalysis.summary.repaymentRate > 80 ? "up" : "down"}
            subtitle="جودة الالتزام بالسداد"
            icon={<Target className="w-5 h-5 text-white" />}
            gradient="bg-gradient-to-br from-fund-out via-fund-out to-fund-due" iconBg="bg-white/20" delay={3} />
        </div>

        {/* ── Highlight cards (top contributor / borrower / avg) ── */}
        <div className="space-y-3">
          {[
            {
              label: "أقوى مساهم", name: topContributor?.name || "لا يوجد",
              value: topContributor ? formatCurrency(topContributor.filteredContributionsTotal) : "—",
              Icon: ArrowUpLeft,
              border: "border-fund-in-bright/40", bg: "bg-gradient-to-br from-fund-in-bright/5 via-white to-fund-in-bright/5",
              iconBg: "bg-fund-in text-white", labelColor: "text-fund-in", nameColor: "text-fund-in", valueColor: "text-fund-in",
            },
            {
              label: "أعلى سلفة", name: highestBorrower?.name || "لا يوجد",
              value: highestBorrower ? formatCurrency(highestBorrower.filteredLoansTotal) : "—",
              Icon: ArrowDownLeft,
              border: "border-fund-loan-bright/40", bg: "bg-gradient-to-br from-fund-loan-bright/5 via-white to-fund-loan-bright/5",
              iconBg: "bg-fund-loan text-white", labelColor: "text-fund-loan", nameColor: "text-fund-loan", valueColor: "text-fund-loan",
            },
            {
              label: "متوسط المساهمة", name: formatCurrency(averageContribution),
              value: `${filteredTransactions.filter((t) => t.type === "contribution").length} مساهمة`,
              Icon: CircleDollarSign,
              border: "border-fund-out-bright/40", bg: "bg-gradient-to-br from-fund-out-bright/5 via-white to-fund-out-bright/5",
              iconBg: "bg-fund-out text-white", labelColor: "text-fund-out", nameColor: "text-fund-out", valueColor: "text-fund-out",
            },
          ].map((card, idx) => (
            <motion.div key={card.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + idx * 0.07, duration: 0.4 }}
              className={cn("relative overflow-hidden rounded-xl border p-4", card.border, card.bg)}
            >
              <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-current opacity-[0.03]" />
              <div className="flex items-center gap-3.5">
                <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg shadow-md", card.iconBg)}>
                  <card.Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-xs font-bold uppercase tracking-wider", card.labelColor)}>{card.label}</p>
                  <p className={cn("truncate text-[15px] font-bold leading-snug mt-0.5", card.nameColor)}>{card.name}</p>
                  <p className={cn("text-xs font-medium mt-0.5", card.valueColor)}>{card.value}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Charts ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-primary flex items-center gap-2 font-heading">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/14">
                <PieChart className="w-4 h-4" />
              </div>
              الرسوم البيانية
            </h3>
            <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
              {[{ label: "3 أشهر", value: "3months" }, { label: "6 أشهر", value: "6months" }, { label: "سنة", value: "12months" }].map((p) => (
                <button key={p.value} onClick={() => setSelectedPeriod(p.value as typeof selectedPeriod)}
                  className={cn("tap-target", "rounded-xl px-3 py-1.5 text-xs font-bold transition-all duration-200",
                    selectedPeriod === p.value ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground")}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <CapitalDistributionChart data={capitalDistributionData} loading={summaryLoading || capitalChartLoading} delay={0} />
            <ContributionsTrendChart data={contributionsChartData?.data || []} loading={contributionsChartLoading} delay={1} />
            <CashflowForecastChart data={cashflowForecast} loading={forecastLoading} delay={2} />
          </div>
          <MemberComparisonChart data={membersChartData?.data || []} loading={membersChartLoading} delay={3} limit={5} />
        </div>

        {/* ── Yearly report ── */}
        {yearlyReport && (
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-primary flex items-center gap-2 font-heading">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/14">
                <Calendar className="w-4 h-4" />
              </div>
              التحليل السنوي {selectedYear}
            </h3>
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-md">
              {/* Summary row */}
              <div className="grid grid-cols-3">
                {[
                  { label: "المساهمات", value: yearlyReport.summary.totalContributions, gradient: "from-fund-in to-fund-in", icon: TrendingUp },
                  { label: "السلف", value: yearlyReport.summary.totalLoans, gradient: "from-fund-loan to-fund-loan", icon: CreditCard },
                  { label: "المصروفات", value: yearlyReport.summary.totalExpenses, gradient: "from-fund-out to-fund-out", icon: Wallet },
                ].map((item, idx) => (
                  <div key={item.label} className={cn("flex flex-col items-center gap-1.5 p-5 relative", idx < 2 && "border-l border-border/70")}>
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-md", item.gradient)}>
                      <item.icon className="w-4.5 h-4.5" />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                    <p className="text-base font-extrabold font-mono text-foreground">{item.value.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground/70">ر.ع</p>
                  </div>
                ))}
              </div>
              {/* Monthly bars */}
              <div className="border-t border-border/70 bg-gradient-to-b from-muted/20 to-transparent p-5">
                <p className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">التطور الشهري للمساهمات</p>
                <div className="flex items-end gap-1.5 h-24">
                  {yearlyReport.monthlyData.map((month, idx) => {
                    const maxVal = Math.max(...yearlyReport.monthlyData.map((m) => m.contributions));
                    const height = maxVal > 0 ? (month.contributions / maxVal) * 100 : 0;
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group cursor-default">
                        <span className="text-xs font-bold font-mono text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                          {month.contributions > 0 ? month.contributions.toLocaleString() : ""}
                        </span>
                        <div className="w-full rounded-lg bg-gradient-to-t from-fund-in to-fund-in-bright/60 shadow-sm transition-all duration-300 group-hover:from-fund-in group-hover:to-fund-in group-hover:shadow-fund-in/20"
                          style={{ height: `${height}%`, minHeight: height > 0 ? "6px" : "0" }} />
                        <span className="text-xs font-medium text-muted-foreground/70 group-hover:text-foreground transition-colors">{month.monthName}</span>
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
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/14">
                <CircleDollarSign className="w-4 h-4" />
              </div>
              تحليل السلف
            </h3>
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-md">
              <div className="grid grid-cols-2">
                <div className="flex flex-col items-center gap-2 p-6 border-l border-border/70">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-fund-loan to-fund-loan text-white shadow-lg">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">إجمالي السلف</p>
                  <p className="text-4xl font-extrabold font-mono text-fund-loan">{loansAnalysis.summary.totalLoans}</p>
                  <p className="text-xs text-muted-foreground/70">سلفة</p>
                </div>
                <div className="flex flex-col items-center gap-2 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-fund-in to-fund-in text-white shadow-lg">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">المبلغ الإجمالي</p>
                  <p className="text-2xl font-extrabold font-mono text-fund-in">{loansAnalysis.summary.totalAmount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground/70">ر.ع</p>
                </div>
              </div>
              <div className="border-t border-border/70 bg-gradient-to-b from-muted/20 to-transparent p-5 space-y-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">التوزيع حسب النوع</p>
                {Object.entries(loansAnalysis.byType).map(([type, data]) => {
                  const labels: Record<string, string> = { urgent: "عاجلة", standard: "عادية", emergency: "طوارئ" };
                  const gradients: Record<string, string> = { urgent: "from-fund-due to-fund-due", standard: "from-fund-loan to-fund-loan", emergency: "from-fund-out to-fund-out" };
                  const dotColors: Record<string, string> = { urgent: "bg-fund-due", standard: "bg-fund-loan", emergency: "bg-fund-out" };
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
        <div className="rounded-xl border border-border/80 bg-gradient-to-b from-card via-card to-muted/10 p-5 shadow-md space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-lg text-primary flex items-center gap-2 font-heading">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/14">
                  <Filter className="w-4 h-4" />
                </div>
                الفلاتر والتصدير
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">اختر السنة والشهر ثم نزّل تقرير Excel مفصلاً.</p>
            </div>
            <button onClick={() => setShowFilters(!showFilters)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/80 bg-muted/40 text-muted-foreground transition-all hover:bg-muted/70">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", showFilters && "rotate-180")} />
            </button>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }} className="overflow-hidden">
                <div className="grid grid-cols-1 gap-4 pt-1 pb-2">
                  <div>
                    <label className="mb-2 block text-xs font-bold text-muted-foreground">السنة</label>
                    <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}
                      className="h-11 w-full rounded-lg border border-border/80 bg-background px-4 text-sm font-medium outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/10">
                      {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold text-muted-foreground">الشهر</label>
                    <select value={filterMonth || ""} onChange={(e) => setFilterMonth(e.target.value ? Number(e.target.value) : null)}
                      className="h-11 w-full rounded-lg border border-border/80 bg-background px-4 text-sm font-medium outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/10">
                      <option value="">كل الأشهر</option>
                      {monthNames.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <Button onClick={exportToExcel} disabled={isExporting}
                      className="h-11 flex-1 rounded-lg gap-2 bg-gradient-to-r from-primary to-fund-in px-6 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all">
                      <FileSpreadsheet className="h-4 w-4" />
                      {isExporting ? "جاري التجهيز..." : "تنزيل Excel"}
                    </Button>
                    {isAdmin && (
                      <Button
                        onClick={() => setLocation("/annual-report")}
                        variant="outline"
                        className="h-11 rounded-lg gap-2 px-4 text-sm font-bold"
                        data-testid="button-annual-report"
                      >
                        <Calendar className="h-4 w-4" />
                        التقرير السنوي
                      </Button>
                    )}
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
                <div key={s.label} className="rounded-lg border border-border/70 bg-background/80 px-3.5 py-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <SIcon className="w-3 h-3 text-muted-foreground/60" />
                    <p className="text-xs font-bold text-muted-foreground">{s.label}</p>
                  </div>
                  <p className={cn("text-sm font-extrabold font-mono", s.colored ? (s.positive ? "text-fund-in" : "text-fund-due") : "text-foreground")}>
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
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/14">
              <User className="w-4 h-4" />
            </div>
            كشف الأعضاء
            <span className="mr-auto text-xs bg-muted/70 px-2.5 py-1 rounded-full font-bold text-muted-foreground">
              {filteredMemberStats.length} عضو
            </span>
          </h3>
          {filteredMemberStats.length === 0 ? (
            <div className="text-center py-10 bg-muted/10 rounded-xl border border-dashed border-border/80">
              <Users className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground font-medium">لا يوجد أعضاء</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMemberStats.map((m, idx) => {
                const rankColors = ["from-fund-out to-fund-out", "from-slate-400 to-slate-500", "from-fund-out-bright/60 to-fund-out"];
                const rankBg = idx < 3 ? `bg-gradient-to-br ${rankColors[idx]} text-white` : "bg-primary/14 text-primary";
                return (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                    className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-md">
                    <div className="p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className={cn("flex h-11 w-11 items-center justify-center rounded-full font-bold text-sm shadow-md", rankBg)}>
                              {(m as any).avatar || m.name.substring(0, 2)}
                            </div>
                            <span className={cn("absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-extrabold ring-2 ring-card",
                              idx < 3 ? `bg-gradient-to-br ${rankColors[idx]} text-white` : "bg-muted text-muted-foreground")}>
                              {idx + 1}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-bold text-sm">{m.name}</h4>
                            <p className="text-xs text-muted-foreground">
                              {m.role === "guardian" ? "الوصي" : "عضو"} • {m.contributionCount} مساهمة • {m.loanCount} سلفة
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className={cn("rounded-xl px-3 py-1.5 text-xs font-bold shadow-sm",
                            m.netPosition >= 0 ? "bg-fund-in-bright/20 text-fund-in border border-fund-in-bright/40" : "bg-fund-out-bright/20 text-fund-out border border-fund-out-bright/40")}>
                            {m.netPosition >= 0 ? "إيجابي" : "مديونية"}
                          </span>
                          <button
                            onClick={() => setLocation(`/members/${m.id}`)}
                            className="tap-target flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/14 transition-colors">
                            <FileSearch className="w-3 h-3" /> تقرير مفصل
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        {[
                          { label: "إجمالي المساهمات", value: formatCurrency(m.totalPaid), border: "border-fund-in-bright/40", bg: "bg-fund-in-bright/20", color: "text-fund-in" },
                          { label: "إجمالي السلف", value: formatCurrency(m.totalLoaned), border: "border-fund-loan-bright/40", bg: "bg-fund-loan-bright/20", color: "text-fund-loan" },
                          { label: "المسدّد من السلف", value: formatCurrency(m.totalRepaid), border: "border-fund-in-bright/40", bg: "bg-fund-in-bright/20", color: "text-fund-in" },
                          { label: "الرصيد المتبقي", value: formatCurrency(m.totalBorrowed), border: m.totalBorrowed > 0 ? "border-fund-out-bright/40" : "border-gray-100", bg: m.totalBorrowed > 0 ? "bg-fund-out-bright/20" : "bg-gray-50/70", color: m.totalBorrowed > 0 ? "text-fund-out" : "text-gray-500" },
                        ].map((s) => (
                          <div key={s.label} className={cn("rounded-xl border p-2.5", s.border, s.bg)}>
                            <p className={cn("text-xs font-bold uppercase tracking-wider", s.color)}>{s.label}</p>
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

        <MemberStatement members={members} availableYears={availableYears} />

        {/* ── Transaction log ── */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg text-primary flex items-center gap-2 font-heading">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/14">
              <FileText className="w-4 h-4" />
            </div>
            السجل العام للمعاملات
            <span className="mr-auto text-xs bg-primary/14 px-2.5 py-1 rounded-full font-bold text-primary">
              {filteredTransactions.length} حركة
            </span>
          </h3>
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-10 bg-muted/10 rounded-xl border border-dashed border-border/80">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground font-medium">لا توجد معاملات في الفترة المحددة</p>
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {visibleTransactions.map((t, idx) => {
                  const typeConfig = {
                    contribution: { gradient: "from-fund-in to-fund-in", bg: "bg-fund-in-bright/20", border: "border-fund-in-bright/40", text: "text-fund-in", badge: "bg-fund-in-bright/20 text-fund-in border-fund-in-bright/40" },
                    loan: { gradient: "from-fund-loan to-fund-loan", bg: "bg-fund-loan-bright/20", border: "border-fund-loan-bright/40", text: "text-fund-loan", badge: "bg-fund-loan-bright/20 text-fund-loan border-fund-loan-bright/40" },
                    expense: { gradient: "from-fund-out to-fund-out", bg: "bg-fund-out-bright/20", border: "border-fund-out-bright/40", text: "text-fund-out", badge: "bg-fund-out-bright/20 text-fund-out border-fund-out-bright/40" },
                  }[t.type];
                  return (
                    <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.025 }}
                      className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
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
                                <span className={cn("rounded-lg border px-2 py-0.5 text-xs font-bold", typeConfig.badge)}>
                                  {getTransactionTypeLabel(t.type)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {t.memberName} • {t.date}{t.month ? ` • ${monthNames[t.month - 1]}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={cn("text-[15px] font-extrabold font-mono tracking-tighter", getTransactionColor(t.type))}>
                              {t.type === "contribution" ? "+" : "−"}{t.amount.toLocaleString("en-US")}
                              <span className="text-xs font-sans font-bold opacity-70"> ر.ع</span>
                            </div>
                            {t.type === "loan" && (
                              <button onClick={() => loadRepayments(t.id)}
                                className="tap-target mt-1.5 inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary transition-colors hover:bg-primary/14">
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
                            <div className="border-t border-border/70 bg-gradient-to-b from-muted/15 to-transparent px-4 pb-4 pt-3 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                                  <Calendar className="w-3 h-3" /> جدولة الأقساط ({t.repaymentMonths || 12} شهر)
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {repayments[t.id].slice(0, 4).map((step) => (
                                  <div key={step.id} className="flex items-center justify-between rounded-xl border border-border/70 bg-card p-2.5">
                                    <div>
                                      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">القسط {step.installmentNumber}</div>
                                      <div className="text-xs font-extrabold font-mono text-foreground">{Number(step.amount).toFixed(3)} ر.ع</div>
                                    </div>
                                    <span className={cn("rounded-lg px-2 py-0.5 text-xs font-bold",
                                      step.status === "paid" ? "bg-fund-in text-white shadow-sm" : "bg-muted text-muted-foreground")}>
                                      {step.status === "paid" ? "مدفوع" : "مجدول"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {repayments[t.id].length > 4 && (
                                <p className="text-center text-xs text-muted-foreground/70">
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
                  className="w-full rounded-lg border border-primary/30 bg-primary/10 py-3.5 text-sm font-bold text-primary transition-all hover:bg-primary/14 hover:shadow-md">
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
