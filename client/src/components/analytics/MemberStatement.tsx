import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertCircle, Award, Calendar, CheckCircle2, Clock, CreditCard, HandCoins, Minus, TrendingUp, Wallet } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { getMemberReport } from "@/lib/api";
import type { Member } from "@shared/schema";

interface MemberStatementProps {
  members: Member[];
  availableYears: number[];
}

/**
 * كشف حساب عضو — قسم قائم بذاته اقتُطع من صفحة التحليلات.
 *
 * يملك اختيار العضو والسنة واستعلامه، فلا تحمل الصفحة الأم حالة لا تخصّها،
 * ولا يُطلب تقرير أي عضو قبل أن يُختار.
 */
export default function MemberStatement({ members, availableYears }: MemberStatementProps) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberReportYear, setMemberReportYear] = useState(new Date().getFullYear());

  const { data: memberReport, isLoading: memberReportLoading } = useQuery({
    queryKey: ["member-report", selectedMemberId, memberReportYear],
    queryFn: () => getMemberReport(selectedMemberId!, memberReportYear),
    enabled: !!selectedMemberId,
    staleTime: 2 * 60 * 1000,
  });

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg text-primary flex items-center gap-2 font-heading">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/14">
          <Award className="w-4 h-4" />
        </div>
        كشف حساب العضو
      </h3>

      {/* Selector card */}
      <div className="rounded-xl border border-border/80 bg-card/50 p-4 space-y-3">
        <div>
          <label className="mb-2 block text-xs font-bold text-muted-foreground">اختر العضو</label>
          <select
            value={selectedMemberId || ""}
            onChange={(e) => setSelectedMemberId(e.target.value || null)}
            className="h-11 w-full rounded-lg border border-border/80 bg-background px-4 text-sm font-medium outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          >
            <option value="">-- اختر عضواً لعرض كشف حسابه --</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        {selectedMemberId && (
          <div>
            <label className="mb-2 block text-xs font-bold text-muted-foreground">السنة</label>
            <div className="flex gap-1.5 rounded-lg bg-muted/60 p-1">
              {availableYears.slice(0, 4).map(yr => (
                <button key={yr} onClick={() => setMemberReportYear(yr)}
                  className={cn("tap-target", "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex-1",
                    memberReportYear === yr
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/60")}>
                  {yr}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Report content */}
      {selectedMemberId && (
        memberReportLoading ? (
          <div className="text-center py-10 bg-muted/10 rounded-xl border border-dashed border-border/80">
            <div className="w-8 h-8 mx-auto mb-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">جاري تحميل التقرير...</p>
          </div>
        ) : memberReport ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

            {/* Performance banner */}
            <div className={cn(
              "relative overflow-hidden rounded-xl p-5 shadow-lg",
              memberReport.performance.rating === 'ممتاز' ? "bg-gradient-to-br from-fund-in via-fund-in to-fund-in" :
              memberReport.performance.rating === 'جيد' ? "bg-gradient-to-br from-fund-loan via-fund-loan to-fund-loan" :
              "bg-gradient-to-br from-fund-out via-fund-out to-fund-due"
            )}>
              <div className="pointer-events-none absolute -left-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-white/8 blur-xl" />
              <div className="relative flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/70 mb-1">كشف حساب</p>
                  <h3 className="text-xl font-extrabold text-white">{memberReport.member.name}</h3>
                  <p className="text-[12px] text-white/70 mt-1">
                    {memberReport.member.role === 'guardian' ? 'الوصي' : 'عضو'} • سنة {memberReport.year}
                  </p>
                </div>
                <div className="text-center shrink-0">
                  <div className="flex h-16 w-16 flex-col items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm ring-1 ring-white/20">
                    <span className="text-xl font-extrabold font-mono text-white leading-none">{memberReport.performance.commitmentRate}%</span>
                    <span className="text-xs font-bold text-white/70 mt-0.5">التزام</span>
                  </div>
                  <span className="mt-2 block text-xs font-bold text-white/90">{memberReport.performance.rating}</span>
                </div>
              </div>
              <div className="relative mt-4">
                <div className="h-2 w-full rounded-full bg-white/20">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${memberReport.performance.commitmentRate}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full rounded-full bg-white/80"
                  />
                </div>
                <p className="mt-1.5 text-xs text-white/60">
                  {memberReport.performance.paidMonths} من {memberReport.performance.expectedMonths} أشهر مدفوعة لسنة {memberReport.year}
                </p>
              </div>
            </div>

            {/* Summary 4-grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "إجمالي المساهمات", value: formatCurrency(memberReport.summary.totalContributions), Icon: TrendingUp, color: "text-fund-in", bg: "bg-fund-in-bright/20 border-fund-in-bright/40" },
                { label: "إجمالي السلف", value: formatCurrency(memberReport.summary.totalLoaned), Icon: CreditCard, color: "text-fund-loan", bg: "bg-fund-loan-bright/20 border-fund-loan-bright/40" },
                { label: "المسدد من السلف", value: formatCurrency(memberReport.summary.totalLoanPaid), Icon: HandCoins, color: "text-primary", bg: "bg-secondary/10 border-secondary/22" },
                { label: "المتبقي عليه", value: formatCurrency(memberReport.summary.totalLoanRemaining), Icon: Wallet, color: "text-fund-out", bg: "bg-fund-out-bright/20 border-fund-out-bright/40" },
              ].map((s) => (
                <div key={s.label} className={cn("rounded-lg border p-3.5", s.bg)}>
                  <s.Icon className={cn("w-4 h-4 mb-2", s.color)} />
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                  <p className={cn("mt-1 text-sm font-extrabold font-mono", s.color)}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Contributions grid */}
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-md">
              <div className="border-b border-border/70 bg-muted/20 px-5 py-3.5 flex items-center justify-between">
                <h4 className="font-bold text-sm text-primary flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> سجل المساهمات {memberReport.year}
                </h4>
                <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-fund-in inline-block" />مدفوع</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-fund-out-bright/20 inline-block" />معلق</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-fund-due-bright/20 inline-block" />غائب</span>
                </div>
              </div>
              <div className="p-5 grid grid-cols-3 gap-2.5">
                {memberReport.contributionsGrid.map((mg) => (
                  <div key={mg.month}
                    className={cn("rounded-xl p-2.5 text-center border transition-all",
                      mg.status === 'approved' ? "bg-fund-in-bright/20 border-fund-in-bright/40" :
                      mg.status === 'pending_approval' ? "bg-fund-out-bright/20 border-fund-out-bright/40" :
                      mg.status === 'missing' ? "bg-fund-due-bright/20 border-fund-due-bright/40" :
                      "bg-muted/20 border-border/60"
                    )}>
                    <p className={cn("text-xs font-bold",
                      mg.status === 'approved' ? "text-fund-in" :
                      mg.status === 'pending_approval' ? "text-fund-out" :
                      mg.status === 'missing' ? "text-fund-due" :
                      "text-muted-foreground/40")}>{mg.monthName}</p>
                    {mg.status === 'approved' && <CheckCircle2 className="w-4 h-4 mx-auto mt-1 text-fund-in" />}
                    {mg.status === 'pending_approval' && <Clock className="w-4 h-4 mx-auto mt-1 text-fund-out" />}
                    {mg.status === 'missing' && <AlertCircle className="w-4 h-4 mx-auto mt-1 text-fund-due" />}
                    {mg.status === 'upcoming' && <Minus className="w-4 h-4 mx-auto mt-1 opacity-20" />}
                    {mg.amount > 0 && (
                      <p className={cn("text-xs font-mono font-bold mt-1",
                        mg.status === 'approved' ? "text-fund-in" : "text-fund-out")}>
                        {mg.amount.toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Loans list */}
            {memberReport.loans.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-md">
                <div className="border-b border-border/70 bg-muted/20 px-5 py-3.5">
                  <h4 className="font-bold text-sm text-primary flex items-center gap-2">
                    <HandCoins className="w-4 h-4" />
                    سجل السلف
                    <span className="mr-auto text-xs bg-muted/70 px-2.5 py-1 rounded-full font-bold text-muted-foreground">
                      {memberReport.loans.length} سلفة
                    </span>
                  </h4>
                </div>
                <div className="p-4 space-y-3">
                  {memberReport.loans.map((loan) => {
                    const loanTypeLabels: Record<string, string> = { urgent: "عاجلة", standard: "عادية", emergency: "طوارئ" };
                    const loanTypeColors: Record<string, string> = { urgent: "bg-fund-due-bright/20 text-fund-due border-fund-due-bright/40", standard: "bg-fund-loan-bright/20 text-fund-loan border-fund-loan-bright/40", emergency: "bg-fund-out-bright/20 text-fund-out border-fund-out-bright/40" };
                    const statusColors: Record<string, string> = { approved: "bg-fund-in-bright/20 text-fund-in border-fund-in-bright/40", pending: "bg-fund-out-bright/20 text-fund-out border-fund-out-bright/40", rejected: "bg-fund-due-bright/20 text-fund-due border-fund-due-bright/40" };
                    const statusLabels: Record<string, string> = { approved: "معتمد", pending: "قيد المراجعة", rejected: "مرفوض" };
                    const repaymentPct = loan.amount > 0 ? Math.min(100, Math.round((loan.totalPaid / loan.amount) * 100)) : 0;
                    return (
                      <div key={loan.id} className="rounded-lg border border-border/70 bg-background/70 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h5 className="font-bold text-sm leading-tight truncate">{loan.title}</h5>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              طلب: {loan.createdAt ? new Date(loan.createdAt).toLocaleDateString('ar-OM') : '—'}
                              {loan.approvedAt ? ` • اعتماد: ${new Date(loan.approvedAt).toLocaleDateString('ar-OM')}` : ''}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={cn("rounded-lg border px-2 py-0.5 text-xs font-bold", loanTypeColors[loan.type] || "bg-muted text-muted-foreground border-border")}>
                              {loanTypeLabels[loan.type] || loan.type}
                            </span>
                            <span className={cn("rounded-lg border px-2 py-0.5 text-xs font-bold", statusColors[loan.status] || "bg-muted text-muted-foreground border-border")}>
                              {statusLabels[loan.status] || loan.status}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl bg-fund-loan-bright/20 border border-fund-loan-bright/40 p-2 text-center">
                            <p className="text-xs font-bold text-fund-loan mb-0.5">المبلغ</p>
                            <p className="text-xs font-extrabold font-mono text-fund-loan">{loan.amount.toLocaleString()}</p>
                            <p className="text-xs text-fund-loan">ر.ع</p>
                          </div>
                          <div className="rounded-xl bg-fund-in-bright/20 border border-fund-in-bright/40 p-2 text-center">
                            <p className="text-xs font-bold text-fund-in mb-0.5">المسدد</p>
                            <p className="text-xs font-extrabold font-mono text-fund-in">{loan.totalPaid.toLocaleString()}</p>
                            <p className="text-xs text-fund-in">ر.ع</p>
                          </div>
                          <div className="rounded-xl bg-fund-out-bright/20 border border-fund-out-bright/40 p-2 text-center">
                            <p className="text-xs font-bold text-fund-out mb-0.5">المتبقي</p>
                            <p className="text-xs font-extrabold font-mono text-fund-out">{loan.remaining.toLocaleString()}</p>
                            <p className="text-xs text-fund-out">ر.ع</p>
                          </div>
                        </div>
                        {loan.status === 'approved' && (
                          <div>
                            <div className="flex justify-between mb-1.5">
                              <span className="text-xs text-muted-foreground">
                                {loan.repaymentType === 'scheduled' ? `مجدول • ${loan.repaymentMonths} شهر` : 'مفتوح'}
                              </span>
                              <span className="text-xs font-bold text-primary">{repaymentPct}% مسدد</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${repaymentPct}%` }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                className="h-full rounded-full bg-gradient-to-r from-fund-in to-fund-in"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </motion.div>
        ) : null
      )}
    </div>

  );
}
