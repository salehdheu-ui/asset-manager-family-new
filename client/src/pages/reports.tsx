import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import {
  getMembers,
  getContributions,
  getLoans,
  getExpenses,
  getLoanRepayments,
  getChartData,
  getDashboardSummary,
  type DashboardSummary,
} from "@/lib/api";
import {
  FileText,
  TrendingUp,
  TrendingDown,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
  CreditCard,
  HandCoins,
  Wallet,
  BarChart3,
  Filter,
  FileSpreadsheet,
  Sparkles,
  ArrowUpLeft,
  ArrowDownLeft,
  Scale,
  CircleDollarSign,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { CapitalDistributionChart, ContributionsTrendChart, MemberComparisonChart } from "@/components/charts";
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

const monthNames = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const formatCurrency = (value: number) => `${Math.round(value).toLocaleString("en-US")} ر.ع`;

const getTransactionTypeLabel = (type: TransactionType) => {
  if (type === "contribution") return "مساهمة";
  if (type === "loan") return "سلفة";
  return "مصروف";
};

const getTransactionColor = (type: TransactionType) => {
  if (type === "contribution") return "text-emerald-600";
  if (type === "loan") return "text-blue-600";
  return "text-amber-600";
};

export default function Reports() {
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [repayments, setRepayments] = useState<Record<string, any[]>>({});
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ["members"],
    queryFn: getMembers,
  });

  const { data: contributions = [] } = useQuery({
    queryKey: ["contributions"],
    queryFn: () => getContributions(),
  });

  const { data: loans = [] } = useQuery({
    queryKey: ["loans"],
    queryFn: getLoans,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: getExpenses,
  });

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
    queryKey: ["chart-data", "contributions-trend", "6months"],
    queryFn: () => getChartData("contributions-trend", "6months"),
  });

  const { data: membersChartData, isLoading: membersChartLoading } = useQuery({
    queryKey: ["chart-data", "members-comparison"],
    queryFn: () => getChartData("members-comparison"),
    enabled: members.length > 0,
  });

  const loadRepayments = async (loanId: string) => {
    if (!repayments[loanId]) {
      const data = await getLoanRepayments(loanId);
      setRepayments((prev) => ({ ...prev, [loanId]: data }));
    }
    setExpandedLoan(expandedLoan === loanId ? null : loanId);
  };

  const getMemberName = (memberId: string) => members.find((m) => m.id === memberId)?.name || "غير معروف";

  const [allRepaymentsTotals, setAllRepaymentsTotals] = useState(0);
  const [memberRepayments, setMemberRepayments] = useState<Record<string, number>>({});

  useEffect(() => {
    const approvedLoans = loans.filter((l) => l.status === "approved");
    if (approvedLoans.length === 0) {
      setAllRepaymentsTotals(0);
      setMemberRepayments({});
      return;
    }
    let cancelled = false;
    (async () => {
      let total = 0;
      const perMember: Record<string, number> = {};
      for (const loan of approvedLoans) {
        const reps = await getLoanRepayments(loan.id);
        const paidSum = reps.filter((r) => r.status === "paid").reduce((sum, r) => sum + Number(r.amount), 0);
        total += paidSum;
        perMember[loan.memberId] = (perMember[loan.memberId] || 0) + paidSum;
      }
      if (!cancelled) {
        setAllRepaymentsTotals(total);
        setMemberRepayments(perMember);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loans]);

  const totalContributions = contributions.filter((c) => c.status === "approved").reduce((sum, c) => sum + Number(c.amount), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalLoans = loans.filter((l) => l.status === "approved").reduce((sum, l) => sum + Number(l.amount), 0);

  const transactions = useMemo<TransactionItem[]>(
    () =>
      [
        ...contributions
          .filter((c) => c.status === "approved")
          .map<TransactionItem>((c) => ({
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
        ...loans
          .filter((l) => l.status === "approved")
          .map<TransactionItem>((l) => {
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
    [contributions, expenses, loans, members]
  );

  const filteredTransactions = transactions.filter((t) => {
    if (!t.rawDate) return true;
    const yearMatch = t.year === filterYear;
    const monthMatch = filterMonth ? t.month === filterMonth : true;
    return yearMatch && monthMatch;
  });

  const memberStats = members.map((m) => {
    const memberContributions = contributions.filter((c) => c.memberId === m.id && c.status === "approved");
    const memberLoans = loans.filter((l) => l.memberId === m.id && l.status === "approved");
    const totalPaidMember = memberContributions.reduce((sum, c) => sum + Number(c.amount), 0);
    const totalBorrowedMember = memberLoans.reduce((sum, l) => sum + Number(l.amount), 0) - (memberRepayments[m.id] || 0);
    return {
      ...m,
      totalPaid: totalPaidMember,
      totalBorrowed: totalBorrowedMember,
      loanCount: memberLoans.length,
      contributionCount: memberContributions.length,
      netPosition: totalPaidMember - totalBorrowedMember,
    };
  });

  const filteredMemberStats = memberStats
    .map((m) => {
      const memberTransactions = filteredTransactions.filter((t) => t.memberName === m.name);
      return {
        ...m,
        filteredContributionsTotal: memberTransactions
          .filter((t) => t.type === "contribution")
          .reduce((sum, t) => sum + t.amount, 0),
        filteredLoansTotal: memberTransactions
          .filter((t) => t.type === "loan")
          .reduce((sum, t) => sum + t.amount, 0),
      };
    })
    .sort((a, b) => b.netPosition - a.netPosition);

  const filteredContributionsTotal = filteredTransactions
    .filter((t) => t.type === "contribution")
    .reduce((sum, t) => sum + t.amount, 0);
  const filteredExpensesTotal = filteredTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  const filteredLoansTotal = filteredTransactions.filter((t) => t.type === "loan").reduce((sum, t) => sum + t.amount, 0);
  const filteredOutflow = filteredExpensesTotal + filteredLoansTotal;
  const filteredNetFlow = filteredContributionsTotal - filteredOutflow;
  const approvedLoansCount = filteredTransactions.filter((t) => t.type === "loan").length;
  const activeMembersCount = new Set(filteredTransactions.filter((t) => t.memberName !== "النظام").map((t) => t.memberName)).size;
  const averageContribution =
    filteredTransactions.filter((t) => t.type === "contribution").length > 0
      ? filteredContributionsTotal / filteredTransactions.filter((t) => t.type === "contribution").length
      : 0;

  const topContributor = filteredMemberStats
    .filter((m) => m.filteredContributionsTotal > 0)
    .sort((a, b) => b.filteredContributionsTotal - a.filteredContributionsTotal)[0];
  const highestBorrower = filteredMemberStats
    .filter((m) => m.filteredLoansTotal > 0)
    .sort((a, b) => b.filteredLoansTotal - a.filteredLoansTotal)[0];

  const capitalDistributionData =
    (capitalChartData?.data || dashboardSummary?.layers || []).map((layer: any) => ({
      name: layer.arabicName || layer.name,
      value: Number(layer.value ?? layer.amount ?? 0),
      percentage: Number(layer.percentage ?? 0),
      color:
        layer.id === "protected"
          ? "#3b82f6"
          : layer.id === "emergency"
            ? "#f59e0b"
            : layer.id === "flexible"
              ? "#10b981"
              : layer.id === "growth"
                ? "#6366f1"
                : "#6b7280",
    })) || [];

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const periodLabel = filterMonth ? `${monthNames[filterMonth - 1]} ${filterYear}` : `سنة ${filterYear}`;

      const summarySheet = XLSX.utils.json_to_sheet([
        { المؤشر: "الفترة", القيمة: periodLabel },
        { المؤشر: "إجمالي المساهمات", القيمة: filteredContributionsTotal },
        { المؤشر: "إجمالي السلف", القيمة: filteredLoansTotal },
        { المؤشر: "إجمالي المصروفات", القيمة: filteredExpensesTotal },
        { المؤشر: "صافي التدفق", القيمة: filteredNetFlow },
        { المؤشر: "إجمالي المسدد من السلف", القيمة: allRepaymentsTotals },
        { المؤشر: "الأعضاء النشطون", القيمة: activeMembersCount },
        { المؤشر: "عدد الحركات", القيمة: filteredTransactions.length },
        { المؤشر: "متوسط المساهمة", القيمة: Math.round(averageContribution) },
        {
          المؤشر: "أعلى مساهم",
          القيمة: topContributor ? `${topContributor.name} - ${formatCurrency(topContributor.filteredContributionsTotal)}` : "لا يوجد",
        },
        {
          المؤشر: "أعلى مستفيد من السلف",
          القيمة: highestBorrower ? `${highestBorrower.name} - ${formatCurrency(highestBorrower.filteredLoansTotal)}` : "لا يوجد",
        },
      ]);

      const transactionsSheet = XLSX.utils.json_to_sheet(
        filteredTransactions.map((t) => ({
          التاريخ: t.date,
          النوع: getTransactionTypeLabel(t.type),
          العنوان: t.title,
          المبلغ: t.amount,
          العضو: t.memberName,
          الحالة: t.status,
          السنة: t.year,
          الشهر: t.month ? monthNames[t.month - 1] : "",
        }))
      );

      const membersSheet = XLSX.utils.json_to_sheet(
        filteredMemberStats.map((m, index) => ({
          الترتيب: index + 1,
          الاسم: m.name,
          الصفة: m.role === "guardian" ? "الوصي" : "عضو",
          إجمالي_المساهمات: m.totalPaid,
          إجمالي_السلف_القائمة: m.totalBorrowed,
          مساهمات_الفترة: m.filteredContributionsTotal,
          سلف_الفترة: m.filteredLoansTotal,
          عدد_المساهمات: m.contributionCount,
          عدد_السلف: m.loanCount,
          صافي_المركز: m.netPosition,
        }))
      );

      const capitalSheet = XLSX.utils.json_to_sheet(
        capitalDistributionData.map((item: { name: string; value: number; percentage: number }) => ({
          البند: item.name,
          القيمة: item.value,
          النسبة: item.percentage,
        }))
      );

      summarySheet["!cols"] = [{ wch: 28 }, { wch: 28 }];
      transactionsSheet["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
      membersSheet["!cols"] = [{ wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }];
      capitalSheet["!cols"] = [{ wch: 24 }, { wch: 16 }, { wch: 12 }];

      XLSX.utils.book_append_sheet(workbook, summarySheet, "الملخص");
      XLSX.utils.book_append_sheet(workbook, transactionsSheet, "الحركات");
      XLSX.utils.book_append_sheet(workbook, membersSheet, "الأعضاء");
      XLSX.utils.book_append_sheet(workbook, capitalSheet, "رأس_المال");

      XLSX.writeFile(workbook, `تقرير-الصندوق-${filterYear}${filterMonth ? `-${filterMonth}` : ""}.xlsx`);
    } finally {
      setIsExporting(false);
    }
  };

  const summaryCards = [
    { title: "إجمالي الإيداعات", value: filteredContributionsTotal, subtitle: "المساهمات المعتمدة خلال الفترة", icon: TrendingUp, tone: "emerald" },
    { title: "إجمالي المنصرف", value: filteredOutflow, subtitle: "السلف والمصروفات خلال الفترة", icon: TrendingDown, tone: "amber" },
    { title: "صافي التدفق", value: filteredNetFlow, subtitle: filteredNetFlow >= 0 ? "الفترة في وضع مالي موجب" : "الفترة تحتاج ضبط السيولة", icon: Scale, tone: filteredNetFlow >= 0 ? "blue" : "rose" },
    { title: "الأعضاء النشطون", value: activeMembersCount, subtitle: `من أصل ${members.length} عضو`, icon: User, tone: "violet" },
  ];

  const availableYears = Array.from(new Set([new Date().getFullYear(), ...transactions.map((t) => t.year).filter(Boolean)])).sort(
    (a, b) => b - a
  );

  return (
    <MobileLayout title="الكشوفات والتقارير">
      <div className="space-y-6 pt-2 pb-12">
        <div className="rounded-[2rem] border border-primary/10 bg-gradient-to-br from-primary/5 via-background to-emerald-500/5 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-background/90 px-3 py-1 text-[11px] font-bold text-primary shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
                لوحة تحليل مالية محسّنة
              </div>
              <h2 className="text-xl font-bold text-primary font-heading">تقارير أوضح وتنزيل Excel جاهز</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                اعرض المؤشرات الأساسية، راقب حركة الصندوق، ونزّل تقريرًا مفصلًا بصيغة Excel يتضمن الملخص والحركات والأعضاء وتوزيع رأس المال.
              </p>
            </div>
            <div className="rounded-3xl bg-primary/10 p-3 text-primary">
              <BarChart3 className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="rounded-[1.75rem] border border-border/60 bg-card p-4 shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-2xl",
                      card.tone === "emerald" && "bg-emerald-500/10 text-emerald-600",
                      card.tone === "amber" && "bg-amber-500/10 text-amber-600",
                      card.tone === "blue" && "bg-blue-500/10 text-blue-600",
                      card.tone === "rose" && "bg-rose-500/10 text-rose-600",
                      card.tone === "violet" && "bg-violet-500/10 text-violet-600"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mb-1 text-[11px] font-bold text-muted-foreground">{card.title}</p>
                <h3 className="text-lg font-bold font-mono text-primary">
                  {typeof card.value === "number" && card.title !== "الأعضاء النشطون" ? formatCurrency(card.value) : card.value}
                </h3>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{card.subtitle}</p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/70 p-4">
            <div className="mb-2 flex items-center gap-2 text-emerald-700">
              <ArrowUpLeft className="h-4 w-4" />
              <span className="text-xs font-bold">أقوى مساهم</span>
            </div>
            <p className="text-sm font-bold text-emerald-900">{topContributor?.name || "لا يوجد"}</p>
            <p className="text-xs text-emerald-700">{topContributor ? formatCurrency(topContributor.filteredContributionsTotal) : "لا توجد مساهمات"}</p>
          </div>
          <div className="rounded-[1.75rem] border border-blue-100 bg-blue-50/70 p-4">
            <div className="mb-2 flex items-center gap-2 text-blue-700">
              <ArrowDownLeft className="h-4 w-4" />
              <span className="text-xs font-bold">أعلى سلفة</span>
            </div>
            <p className="text-sm font-bold text-blue-900">{highestBorrower?.name || "لا يوجد"}</p>
            <p className="text-xs text-blue-700">{highestBorrower ? formatCurrency(highestBorrower.filteredLoansTotal) : "لا توجد سلف"}</p>
          </div>
          <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50/70 p-4">
            <div className="mb-2 flex items-center gap-2 text-amber-700">
              <CircleDollarSign className="h-4 w-4" />
              <span className="text-xs font-bold">متوسط المساهمة</span>
            </div>
            <p className="text-sm font-bold text-amber-900">{formatCurrency(averageContribution)}</p>
            <p className="text-xs text-amber-700">بناءً على {filteredTransactions.filter((t) => t.type === "contribution").length} مساهمة</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-lg text-primary flex items-center gap-2 font-heading">
              <BarChart3 className="w-5 h-5" /> الرسوم البيانية
            </h3>
            <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground">
              {filterMonth ? monthNames[filterMonth - 1] : "كل الأشهر"} {filterYear}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CapitalDistributionChart
              data={capitalDistributionData}
              loading={summaryLoading || capitalChartLoading}
              delay={0}
            />
            <ContributionsTrendChart
              data={contributionsChartData?.data || []}
              loading={contributionsChartLoading}
              delay={1}
            />
          </div>
          <MemberComparisonChart data={membersChartData?.data || []} loading={membersChartLoading} delay={2} limit={5} />
        </div>

        <div className="space-y-4 rounded-[2rem] border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-lg text-primary flex items-center gap-2 font-heading">
                <Filter className="w-5 h-5" /> الفلاتر والتصدير
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                اختر السنة والشهر ثم نزّل تقرير Excel يحتوي على الملخص والحركات وإحصاءات الأعضاء.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="rounded-full border-border/60">
              <ChevronDown className={cn("h-4 w-4 transition-transform", showFilters && "rotate-180")} />
            </Button>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <label className="mb-2 block text-[11px] font-bold text-muted-foreground">السنة</label>
                    <select
                      value={filterYear}
                      onChange={(e) => setFilterYear(Number(e.target.value))}
                      className="h-11 w-full rounded-2xl border border-border/60 bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/40"
                    >
                      {availableYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-[11px] font-bold text-muted-foreground">الشهر</label>
                    <select
                      value={filterMonth || ""}
                      onChange={(e) => setFilterMonth(e.target.value ? Number(e.target.value) : null)}
                      className="h-11 w-full rounded-2xl border border-border/60 bg-background px-4 text-sm font-medium outline-none transition focus:border-primary/40"
                    >
                      <option value="">كل الأشهر</option>
                      {monthNames.map((month, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={exportToExcel}
                      disabled={isExporting}
                      className="h-11 w-full rounded-2xl gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      {isExporting ? "جاري التجهيز..." : "تنزيل Excel"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-border/50 bg-background px-4 py-3">
              <p className="text-[10px] font-bold text-muted-foreground">الحركات المعروضة</p>
              <p className="mt-1 text-sm font-bold text-primary">{filteredTransactions.length}</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background px-4 py-3">
              <p className="text-[10px] font-bold text-muted-foreground">السلف المعتمدة</p>
              <p className="mt-1 text-sm font-bold text-primary">{approvedLoansCount}</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background px-4 py-3">
              <p className="text-[10px] font-bold text-muted-foreground">المسدد من السلف</p>
              <p className="mt-1 text-sm font-bold text-primary">{formatCurrency(allRepaymentsTotals)}</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background px-4 py-3">
              <p className="text-[10px] font-bold text-muted-foreground">الرصيد الصافي</p>
              <p className={cn("mt-1 text-sm font-bold", filteredNetFlow >= 0 ? "text-emerald-600" : "text-rose-600")}>
                {formatCurrency(filteredNetFlow)}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-lg text-primary px-1 flex items-center gap-2 font-heading">
            <User className="w-5 h-5" /> كشف الأعضاء
          </h3>
          {filteredMemberStats.length === 0 ? (
            <div className="text-center py-8 bg-muted/20 rounded-3xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground font-medium">لا يوجد أعضاء</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMemberStats.map((m, idx) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.06 }}
                  className="rounded-[1.75rem] border border-border/60 bg-card p-4 shadow-sm"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/10 bg-primary/10 font-bold text-primary">
                        {m.avatar || m.name.substring(0, 2)}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm">{m.name}</h4>
                        <p className="text-[11px] text-muted-foreground">
                          {m.role === "guardian" ? "الوصي" : "عضو"} • {m.contributionCount} مساهمة • {m.loanCount} سلفة
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-[10px] font-bold",
                        m.netPosition >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      )}
                    >
                      {m.netPosition >= 0 ? "رصيد إيجابي" : "مديونية قائمة"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-emerald-100/70 bg-emerald-50/60 p-3">
                      <p className="text-[10px] font-bold text-emerald-700">إجمالي الدفع</p>
                      <div className="mt-1 text-sm font-bold font-mono text-emerald-600">{formatCurrency(m.totalPaid)}</div>
                    </div>
                    <div className="rounded-2xl border border-blue-100/70 bg-blue-50/60 p-3">
                      <p className="text-[10px] font-bold text-blue-700">مساهمات الفترة</p>
                      <div className="mt-1 text-sm font-bold font-mono text-blue-600">{formatCurrency(m.filteredContributionsTotal)}</div>
                    </div>
                    <div className="rounded-2xl border border-amber-100/70 bg-amber-50/60 p-3">
                      <p className="text-[10px] font-bold text-amber-700">السلف القائمة</p>
                      <div className="mt-1 text-sm font-bold font-mono text-amber-600">{formatCurrency(m.totalBorrowed)}</div>
                    </div>
                    <div className="rounded-2xl border border-violet-100/70 bg-violet-50/60 p-3">
                      <p className="text-[10px] font-bold text-violet-700">صافي المركز</p>
                      <div className="mt-1 text-sm font-bold font-mono text-violet-600">{formatCurrency(m.netPosition)}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-lg text-primary px-1 flex items-center gap-2 font-heading">
            <FileText className="w-5 h-5" /> السجل العام للمحررات
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full font-bold text-muted-foreground ml-auto">
              {filteredTransactions.length} حركة
            </span>
          </h3>
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-8 bg-muted/20 rounded-3xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground font-medium">لا توجد محررات في الفترة المحددة</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransactions.map((t, idx) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="rounded-[1.5rem] border border-border/60 bg-card p-4 shadow-sm"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-2xl shrink-0",
                          t.type === "contribution" && "bg-emerald-100 text-emerald-600",
                          t.type === "loan" && "bg-blue-100 text-blue-600",
                          t.type === "expense" && "bg-amber-100 text-amber-600"
                        )}
                      >
                        {t.type === "contribution" ? <CreditCard className="w-5 h-5" /> : t.type === "loan" ? <HandCoins className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="text-sm font-bold leading-tight">{t.title}</h5>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold",
                              t.type === "contribution" && "bg-emerald-50 text-emerald-700",
                              t.type === "loan" && "bg-blue-50 text-blue-700",
                              t.type === "expense" && "bg-amber-50 text-amber-700"
                            )}
                          >
                            {getTransactionTypeLabel(t.type)}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-medium mt-1">
                          {t.memberName} • {t.date} {t.month ? `• ${monthNames[t.month - 1]}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cn("text-base font-bold font-mono tracking-tighter", getTransactionColor(t.type))}>
                        {t.type === "contribution" ? "+" : "-"}
                        {t.amount.toLocaleString("en-US")} <span className="text-[10px] font-sans">ر.ع</span>
                      </div>
                      {t.type === "loan" && (
                        <button onClick={() => loadRepayments(t.id)} className="text-[10px] font-bold text-primary flex items-center gap-1 mt-1 mr-auto">
                          خطة السداد {expandedLoan === t.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedLoan === t.id && repayments[t.id] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 space-y-3 border-t border-border/50 pt-4">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-bold text-muted-foreground">جدولة الأقساط ({t.repaymentMonths || 12} شهر)</span>
                            <Calendar className="w-3 h-3 text-muted-foreground" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {repayments[t.id].slice(0, 4).map((step) => (
                              <div key={step.id} className="flex items-center justify-between rounded-xl border border-border/30 bg-muted/30 p-2">
                                <div>
                                  <div className="text-[8px] font-bold uppercase text-muted-foreground">القسط {step.installmentNumber}</div>
                                  <div className="text-xs font-bold font-mono">{Number(step.amount).toFixed(3)} ر.ع</div>
                                </div>
                                <span
                                  className={cn(
                                    "rounded-full px-1.5 py-0.5 text-[8px] font-bold",
                                    step.status === "paid" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {step.status === "paid" ? "مدفوع" : "مجدول"}
                                </span>
                              </div>
                            ))}
                          </div>
                          {repayments[t.id].length > 4 && (
                            <p className="text-center text-[9px] text-muted-foreground">
                              تم عرض أول 4 أقساط • الإجمالي {repayments[t.id].length} قسطًا
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
