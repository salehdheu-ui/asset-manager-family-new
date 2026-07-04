import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getMemberReport } from "@/lib/api";
import { downloadExcel } from "@/lib/excel";
import {
  User,
  HandCoins,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Scale,
  Star,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

const fmt = (v: number) => `${v.toFixed(3)} ر.ع`;

export default function MemberDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const memberId = params.id;
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { data: report, isLoading, error } = useQuery({
    queryKey: ["member-report", memberId, selectedYear],
    queryFn: () => getMemberReport(memberId, selectedYear),
    enabled: !!memberId,
  });

  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const handleExport = async () => {
    if (!report) return;
    setIsExporting(true);
    try {
      const summaryData = [
        { البيان: "الاسم", القيمة: report.member.name },
        { البيان: "الصفة", القيمة: report.member.role === "guardian" ? "الوصي" : "عضو" },
        { البيان: "السنة", القيمة: report.year },
        { البيان: "إجمالي المساهمات", القيمة: report.summary.totalContributions },
        { البيان: "إجمالي السلف المأخوذة", القيمة: report.summary.totalLoaned },
        { البيان: "إجمالي المسدد", القيمة: report.summary.totalLoanPaid },
        { البيان: "الرصيد القائم", القيمة: report.summary.totalLoanRemaining },
        { البيان: "عدد المساهمات", القيمة: report.summary.contributionCount },
        { البيان: "عدد السلف", القيمة: report.summary.loanCount },
        { البيان: "معدل الالتزام", القيمة: `${report.performance.commitmentRate}%` },
        { البيان: "التقييم", القيمة: report.performance.rating },
      ];

      const contribData = report.contributionsGrid.map((c) => ({
        الشهر: monthNames[c.month - 1],
        الحالة: c.status === "approved" ? "مدفوع" : c.status === "pending_approval" ? "قيد الاعتماد" : c.status === "missing" ? "غائب" : "قادم",
        المبلغ: c.amount || 0,
        تاريخ_الدفع: c.paidAt ? new Date(c.paidAt).toLocaleDateString("ar-OM") : "",
      }));

      const loansData = report.loans.map((l) => ({
        عنوان_السلفة: l.title,
        النوع: l.type,
        المبلغ: l.amount,
        المسدد: l.totalPaid,
        المتبقي: l.remaining,
        الحالة: l.status,
        نوع_السداد: l.repaymentType === "scheduled" ? "بخطة" : "مفتوح",
        تاريخ_الطلب: l.createdAt ? new Date(l.createdAt).toLocaleDateString("ar-OM") : "",
        تاريخ_الاعتماد: l.approvedAt ? new Date(l.approvedAt).toLocaleDateString("ar-OM") : "",
        ملاحظة: l.description || "",
      }));

      await downloadExcel(`تقرير-${report.member.name}-${report.year}.xlsx`, [
        { name: "ملخص العضو", rows: summaryData, columnWidths: [28, 24] },
        { name: "المساهمات", rows: contribData, columnWidths: [14, 18, 14, 18] },
        { name: "السلف", rows: loansData, columnWidths: [22, 14, 14, 14, 14, 14, 14, 18, 18, 24] },
      ]);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <MobileLayout title="تقرير العضو">
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </MobileLayout>
    );
  }

  if (error || !report) {
    return (
      <MobileLayout title="تقرير العضو">
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
          <p className="font-bold text-destructive">تعذر تحميل بيانات العضو</p>
          <button onClick={() => setLocation("/reports")} className="mt-4 text-sm text-primary underline">عودة للتقارير</button>
        </div>
      </MobileLayout>
    );
  }

  const ratingColor = report.performance.commitmentRate >= 80 ? "text-emerald-600" : report.performance.commitmentRate >= 50 ? "text-amber-600" : "text-red-600";
  const ratingBg = report.performance.commitmentRate >= 80 ? "bg-emerald-50 border-emerald-200" : report.performance.commitmentRate >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";

  return (
    <MobileLayout title={`تقرير: ${report.member.name}`}>
      <div className="space-y-5 pt-2 pb-12">

        {/* Back + Year selector */}
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setLocation("/reports")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
            <ArrowRight className="w-4 h-4" /> عودة
          </button>
          <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-background border border-border rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/50">
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Member header */}
        <div className="bg-primary text-primary-foreground p-5 rounded-[2rem] relative overflow-hidden shadow-lg shadow-primary/20">
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center font-bold text-xl shrink-0">
              {report.member.avatar || report.member.name.substring(0, 2)}
            </div>
            <div>
              <h2 className="text-lg font-bold">{report.member.name}</h2>
              <p className="text-sm opacity-75">{report.member.role === "guardian" ? "الوصي" : "عضو"} • سنة {report.year}</p>
              <div className={cn("mt-1 inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", ratingBg, ratingColor)}>
                <Star className="w-3 h-3" /> {report.performance.rating}
              </div>
            </div>
          </div>
          <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <p className="text-[10px] font-bold text-emerald-700">إجمالي المساهمات</p>
            </div>
            <p className="font-mono font-bold text-emerald-700 text-base">{fmt(report.summary.totalContributions)}</p>
            <p className="text-[10px] text-emerald-600 mt-0.5">{report.summary.contributionCount} مساهمة</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <HandCoins className="w-4 h-4 text-blue-600" />
              <p className="text-[10px] font-bold text-blue-700">إجمالي السلف</p>
            </div>
            <p className="font-mono font-bold text-blue-700 text-base">{fmt(report.summary.totalLoaned)}</p>
            <p className="text-[10px] text-blue-600 mt-0.5">{report.summary.loanCount} سلفة</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <p className="text-[10px] font-bold text-green-700">المسدد من السلف</p>
            </div>
            <p className="font-mono font-bold text-green-700 text-base">{fmt(report.summary.totalLoanPaid)}</p>
          </div>
          <div className={cn("border rounded-2xl p-4", report.summary.totalLoanRemaining > 0 ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200")}>
            <div className="flex items-center gap-1.5 mb-1">
              <Scale className={cn("w-4 h-4", report.summary.totalLoanRemaining > 0 ? "text-amber-600" : "text-gray-500")} />
              <p className={cn("text-[10px] font-bold", report.summary.totalLoanRemaining > 0 ? "text-amber-700" : "text-gray-600")}>الرصيد القائم</p>
            </div>
            <p className={cn("font-mono font-bold text-base", report.summary.totalLoanRemaining > 0 ? "text-amber-700" : "text-gray-500")}>{fmt(report.summary.totalLoanRemaining)}</p>
            <p className={cn("text-[10px] mt-0.5", report.summary.totalLoanRemaining > 0 ? "text-amber-600" : "text-gray-400")}>
              {report.summary.totalLoanRemaining > 0 ? "مديونية قائمة" : "لا توجد ديون"}
            </p>
          </div>
        </div>

        {/* Commitment bar */}
        <div className="bg-card border border-border/60 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold">معدل الالتزام بالمساهمات</p>
            <span className={cn("text-sm font-bold font-mono", ratingColor)}>{report.performance.commitmentRate}%</span>
          </div>
          <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${report.performance.commitmentRate}%` }} transition={{ duration: 0.8, ease: "easeOut" }}
              className={cn("h-full rounded-full", report.performance.commitmentRate >= 80 ? "bg-emerald-500" : report.performance.commitmentRate >= 50 ? "bg-amber-500" : "bg-red-500")} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {report.performance.paidMonths} شهر مدفوع من أصل {report.performance.expectedMonths} شهر متوقع
          </p>
        </div>

        {/* Contributions grid */}
        <div className="space-y-3">
          <h3 className="font-bold text-base text-primary font-heading px-1 flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> شبكة المساهمات الشهرية
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {report.contributionsGrid.map((c) => (
              <div key={c.month} className={cn(
                "rounded-xl p-2 text-center border",
                c.status === "approved" ? "bg-emerald-50 border-emerald-200" :
                c.status === "pending_approval" ? "bg-blue-50 border-blue-200" :
                c.status === "upcoming" ? "bg-gray-50 border-gray-200" :
                "bg-red-50 border-red-200"
              )}>
                <p className="text-[9px] font-bold text-muted-foreground">{monthNames[c.month - 1].substring(0, 3)}</p>
                <div className="mt-1 flex justify-center">
                  {c.status === "approved" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> :
                   c.status === "pending_approval" ? <Clock className="w-4 h-4 text-blue-600" /> :
                   c.status === "upcoming" ? <div className="w-4 h-4 rounded-full border-2 border-gray-300" /> :
                   <AlertCircle className="w-4 h-4 text-red-500" />}
                </div>
                {c.amount > 0 && <p className="text-[8px] font-mono font-bold text-muted-foreground mt-0.5">{c.amount.toFixed(0)}</p>}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-[10px]">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-600" />مدفوع</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-600" />قيد الاعتماد</span>
            <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-500" />غائب</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full border-2 border-gray-300" />قادم</span>
          </div>
        </div>

        {/* Loans section */}
        {report.loans.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold text-base text-primary font-heading px-1 flex items-center gap-2">
              <HandCoins className="w-4 h-4" /> تفاصيل السلف
              <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full font-bold text-muted-foreground mr-auto">{report.loans.length}</span>
            </h3>
            {report.loans.map((loan, idx) => (
              <motion.div key={loan.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                className="bg-card border border-border/60 rounded-2xl overflow-hidden">
                <button className="w-full p-4 flex items-center gap-3 text-right"
                  onClick={() => setExpandedLoan(expandedLoan === loan.id ? null : loan.id)}>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    loan.status === "approved" ? "bg-blue-100 text-blue-600" : loan.status === "rejected" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600")}>
                    <HandCoins className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{loan.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-xs font-bold text-primary">{fmt(loan.amount)}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                        loan.status === "approved" ? "bg-blue-50 text-blue-700" : loan.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>
                        {loan.status === "approved" ? "معتمدة" : loan.status === "rejected" ? "مرفوضة" : "معلقة"}
                      </span>
                    </div>
                  </div>
                  {expandedLoan === loan.id ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                <AnimatePresence>
                  {expandedLoan === loan.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-border/40">
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-muted/30 rounded-xl p-2.5 text-center">
                            <p className="text-[9px] font-bold text-muted-foreground">المبلغ</p>
                            <p className="font-mono font-bold text-xs text-primary mt-0.5">{fmt(loan.amount)}</p>
                          </div>
                          <div className="bg-green-50 rounded-xl p-2.5 text-center">
                            <p className="text-[9px] font-bold text-green-700">المسدد</p>
                            <p className="font-mono font-bold text-xs text-green-700 mt-0.5">{fmt(loan.totalPaid)}</p>
                          </div>
                          <div className={cn("rounded-xl p-2.5 text-center", loan.remaining > 0 ? "bg-amber-50" : "bg-gray-50")}>
                            <p className={cn("text-[9px] font-bold", loan.remaining > 0 ? "text-amber-700" : "text-gray-500")}>المتبقي</p>
                            <p className={cn("font-mono font-bold text-xs mt-0.5", loan.remaining > 0 ? "text-amber-700" : "text-gray-500")}>{fmt(loan.remaining)}</p>
                          </div>
                        </div>

                        {loan.amount > 0 && (
                          <div>
                            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                              <span>نسبة السداد</span>
                              <span className="font-bold">{loan.amount > 0 ? Math.round((loan.totalPaid / loan.amount) * 100) : 0}%</span>
                            </div>
                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full transition-all"
                                style={{ width: `${loan.amount > 0 ? Math.min(100, (loan.totalPaid / loan.amount) * 100) : 0}%` }} />
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div><span className="text-muted-foreground">النوع: </span><span className="font-bold">{loan.type}</span></div>
                          <div><span className="text-muted-foreground">السداد: </span><span className="font-bold">{loan.repaymentType === "scheduled" ? `${loan.repaymentMonths} شهر` : "مفتوح"}</span></div>
                          {loan.createdAt && <div><span className="text-muted-foreground">تاريخ الطلب: </span><span className="font-bold">{new Date(loan.createdAt).toLocaleDateString("ar-OM")}</span></div>}
                          {loan.approvedAt && <div><span className="text-muted-foreground">تاريخ الاعتماد: </span><span className="font-bold">{new Date(loan.approvedAt).toLocaleDateString("ar-OM")}</span></div>}
                        </div>

                        {loan.description && (
                          <p className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-2 leading-5">
                            {loan.description}
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

        {report.loans.length === 0 && (
          <div className="text-center py-8 bg-muted/20 rounded-3xl border border-dashed border-border">
            <HandCoins className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">لا توجد سلف في هذه السنة</p>
          </div>
        )}

        {/* Export button */}
        <button onClick={handleExport} disabled={isExporting}
          className="w-full bg-primary text-primary-foreground py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-primary/20 disabled:opacity-60">
          {isExporting
            ? <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            : <><FileSpreadsheet className="w-5 h-5" /> تصدير تقرير Excel لهذا العضو</>}
        </button>
      </div>
    </MobileLayout>
  );
}
