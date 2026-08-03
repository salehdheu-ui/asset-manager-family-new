import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { getMembers, getMemberStatement, getCommitmentScores, getMemberShares } from "@/lib/api";
import { downloadExcel, type ExcelSheetSpec } from "@/lib/excel";
import { cn } from "@/lib/utils";
import {
  Printer, ArrowRight, FileSpreadsheet, Wallet, HandCoins,
  CheckCircle2, TrendingUp, Gauge, FileText, CalendarClock,
  AlertTriangle, PieChart,
} from "lucide-react";

const MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

const SECTIONS = [
  { key: "summary", label: "الملخص المالي", desc: "كم له، كم عليه، كم سدّد" },
  { key: "arrears", label: "متأخرات المساهمات", desc: "المتأخر عليه بالريال لا بالأشهر" },
  { key: "shares", label: "حصته من الصندوق", desc: "نسبته ومقابلها من صافي الأصول" },
  { key: "timeline", label: "السجل الزمني الكامل", desc: "كل حركة بتاريخها ورصيده بعدها" },
  { key: "loans", label: "تفاصيل السلف والسداد", desc: "متى تسلّف ومتى سدّد كل دفعة" },
  { key: "contributions", label: "شبكة المساهمات", desc: "مساهماته شهراً بشهر" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("ar-OM") : "—");

// منشئ التقارير: الوصي يختار العضو والفترة والأقسام — والنظام يجهز كشف الحساب كاملاً
export default function ReportBuilder() {
  const currentYear = new Date().getFullYear();
  const [memberId, setMemberId] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({
    summary: true, arrears: true, shares: true, timeline: true, loans: true, contributions: true,
  });

  const { data: members = [] } = useQuery({ queryKey: ["members"], queryFn: getMembers });
  const { data: scores = [] } = useQuery({ queryKey: ["commitment-scores"], queryFn: getCommitmentScores });
  const { data: sharesReport } = useQuery({ queryKey: ["member-shares"], queryFn: getMemberShares });
  const { data: statement, isFetching } = useQuery({
    queryKey: ["member-statement", memberId, year],
    queryFn: () => getMemberStatement(memberId, year),
    enabled: !!memberId,
  });

  const score = scores.find((s) => s.memberId === memberId)?.score;
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const typeLabel = { contribution: "مساهمة", loan: "سلفة", repayment: "سداد" } as const;

  const exportExcel = async () => {
    if (!statement) return;
    const sheets: ExcelSheetSpec[] = [];
    if (sections.summary) {
      sheets.push({
        name: "الملخص",
        rows: [
          { البيان: "العضو", القيمة: statement.member.name },
          { البيان: "الفترة", القيمة: year ? String(year) : "كل الفترات" },
          { البيان: "إجمالي مساهماته (له)", القيمة: statement.summary.totalContributed },
          { البيان: "إجمالي ما تسلّف", القيمة: statement.summary.totalBorrowed },
          { البيان: "إجمالي ما سدّد", القيمة: statement.summary.totalRepaid },
          { البيان: "المتبقي عليه الآن", القيمة: statement.summary.currentDebt },
          ...(score !== undefined ? [{ البيان: "درجة الالتزام", القيمة: `${score}/100` }] : []),
        ],
        columnWidths: [26, 22],
      });
    }
    if (sections.arrears && statement.arrears.expectedMonthly > 0) {
      sheets.push({
        name: "متأخرات المساهمات",
        rows: [
          { البيان: "الاشتراك الشهري المتوقع", القيمة: statement.arrears.expectedMonthly },
          { البيان: "المتوقع خلال الفترة", القيمة: statement.arrears.expectedTotal },
          { البيان: "المدفوع المعتمد", القيمة: statement.arrears.paidTotal },
          { البيان: "المتأخر عليه بالريال", القيمة: statement.arrears.arrears },
          { البيان: "أشهر لم يدفع فيها", القيمة: statement.arrears.missedMonths },
          { البيان: "أشهر دفع فيها جزئياً", القيمة: statement.arrears.partialMonths },
        ],
        columnWidths: [30, 22],
      });
    }
    if (sections.shares) {
      const share = sharesReport?.shares.find((s) => s.memberId === memberId);
      if (share) {
        sheets.push({
          name: "حصته من الصندوق",
          rows: [
            { البيان: "إجمالي مساهماته", القيمة: share.contributed },
            { البيان: "نسبته من الصندوق ٪", القيمة: share.percent },
            { البيان: "قيمة حصته بالريال", القيمة: share.value },
            { البيان: "صافي أصول الصندوق", القيمة: sharesReport?.netAssets ?? 0 },
            { البيان: "ملاحظة", القيمة: sharesReport?.note ?? "" },
          ],
          columnWidths: [30, 40],
        });
      }
    }
    if (sections.timeline) {
      sheets.push({
        name: "السجل الزمني",
        rows: statement.timeline.map((e) => ({
          التاريخ: fmtDate(e.date),
          الحركة: typeLabel[e.type],
          البيان: e.label,
          المبلغ: e.amount,
          المتبقي_عليه_بعدها: e.debtAfter,
        })),
        columnWidths: [14, 10, 34, 12, 16],
      });
    }
    if (sections.loans) {
      const rows: Record<string, unknown>[] = [];
      for (const l of statement.loans) {
        rows.push({
          السلفة: l.title, الحالة: l.settled ? "مسدّدة ✓" : l.status === "approved" ? "قائمة" : l.status === "pending" ? "معلقة" : "مرفوضة",
          المبلغ: l.amount, تاريخ_التسلف: fmtDate(l.borrowedAt), المسدد: l.totalPaid, المتبقي: l.remaining,
        });
        for (const p of l.payments) {
          rows.push({ السلفة: `   ← دفعة سداد`, الحالة: p.note ?? "", المبلغ: p.amount, تاريخ_التسلف: fmtDate(p.date), المسدد: "", المتبقي: "" });
        }
      }
      sheets.push({ name: "السلف والسداد", rows, columnWidths: [26, 16, 12, 14, 12, 12] });
    }
    if (sections.contributions) {
      sheets.push({
        name: "المساهمات",
        rows: statement.contributionsByYear.flatMap((y) =>
          y.months.map((m) => ({
            السنة: y.year, الشهر: MONTH_NAMES[m.month - 1], المبلغ: m.amount,
            الحالة: m.status === "approved" ? "معتمدة" : "قيد الاعتماد",
          })),
        ),
        columnWidths: [10, 12, 12, 14],
      });
    }
    await downloadExcel(`كشف-حساب-${statement.member.name}${year ? `-${year}` : ""}.xlsx`, sheets);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-white text-gray-900">
      {/* أدوات البناء — لا تُطبع */}
      <div className="print:hidden bg-gray-50 border-b border-gray-200 px-4 py-4 space-y-3">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
              <ArrowRight className="w-4 h-4" /> رجوع
            </Link>
            <h1 className="font-bold text-lg flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-600" /> منشئ التقارير</h1>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white" data-testid="select-member">
              <option value="">اختر العضو...</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select value={year ?? ""} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
              className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white" data-testid="select-year">
              <option value="">كل الفترات</option>
              {years.map((y) => <option key={y} value={y}>سنة {y}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {SECTIONS.map((s) => (
              <button key={s.key}
                onClick={() => setSections((p) => ({ ...p, [s.key]: !p[s.key] }))}
                className={cn("tap-target", 
                  "text-right rounded-xl border px-3 py-2.5 transition-colors",
                  sections[s.key] ? "border-emerald-500 bg-emerald-50" : "border-gray-200 bg-white opacity-60",
                )}
                data-testid={`toggle-${s.key}`}
              >
                <span className="flex items-center gap-2 text-sm font-bold">
                  <span className={cn("w-4 h-4 rounded grid place-items-center border",
                    sections[s.key] ? "bg-emerald-600 border-emerald-600 text-white" : "border-gray-300")}>
                    {sections[s.key] && <CheckCircle2 className="w-3 h-3" />}
                  </span>
                  {s.label}
                </span>
                <span className="block text-xs text-gray-500 mt-0.5 pr-6">{s.desc}</span>
              </button>
            ))}
          </div>

          {statement && (
            <div className="flex gap-2">
              <button onClick={() => window.print()}
                className="tap-target flex-1 bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-700"
                data-testid="button-print-statement">
                <Printer className="w-4 h-4" /> طباعة / PDF
              </button>
              <button onClick={exportExcel}
                className="tap-target flex-1 border border-emerald-600 text-emerald-700 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-50"
                data-testid="button-export-statement">
                <FileSpreadsheet className="w-4 h-4" /> تصدير Excel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* جسم التقرير */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {!memberId ? (
          <div className="text-center py-20 text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-bold">اختر عضواً لإعداد كشف حسابه الكامل</p>
          </div>
        ) : isFetching && !statement ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : statement ? (
          <div className="space-y-8" data-testid="statement-body">
            <header className="text-center border-b-2 border-emerald-600 pb-5">
              <h2 className="text-2xl font-bold">كشف حساب: {statement.member.name}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {year ? `سنة ${year}` : "كل الفترات"} · أُعد في {fmtDate(statement.generatedAt)}
              </p>
            </header>

            {sections.summary && (
              <section>
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><Wallet className="w-5 h-5 text-emerald-600" /> الملخص المالي</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-gray-200 rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-500 font-bold">إجمالي مساهماته (له في الصندوق)</p>
                    <p className="text-xl font-mono font-bold text-emerald-600 mt-1">{fmt(statement.summary.totalContributed)} <span className="text-xs">ر.ع</span></p>
                  </div>
                  <div className="border-2 rounded-2xl p-4 text-center border-red-200 bg-red-50/40">
                    <p className="text-xs text-gray-500 font-bold">المتبقي عليه الآن بالضبط</p>
                    <p className={cn("text-xl font-mono font-bold mt-1", statement.summary.currentDebt > 0 ? "text-red-600" : "text-emerald-600")}>
                      {fmt(statement.summary.currentDebt)} <span className="text-xs">ر.ع</span>
                    </p>
                    {statement.summary.currentDebt === 0 && <p className="text-xs font-bold text-emerald-600">الذمة صفر ✓</p>}
                  </div>
                  <div className="border border-gray-200 rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-500 font-bold">إجمالي ما تسلّف</p>
                    <p className="text-xl font-mono font-bold text-blue-600 mt-1">{fmt(statement.summary.totalBorrowed)} <span className="text-xs">ر.ع</span></p>
                  </div>
                  <div className="border border-gray-200 rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-500 font-bold">إجمالي ما سدّد</p>
                    <p className="text-xl font-mono font-bold text-teal-600 mt-1">{fmt(statement.summary.totalRepaid)} <span className="text-xs">ر.ع</span></p>
                  </div>
                </div>
                {score !== undefined && (
                  <div className="mt-3 flex items-center gap-2 border border-gray-200 rounded-2xl px-4 py-3">
                    <Gauge className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-bold text-gray-500">درجة الالتزام:</span>
                    <span className={cn("font-mono font-bold", score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600")}>{score}/100</span>
                  </div>
                )}
              </section>
            )}

            {sections.arrears && (
              <section>
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-emerald-600" /> متأخرات المساهمات</h3>
                {statement.arrears.expectedMonthly <= 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-2xl">
                    لم يُحدَّد اشتراك شهري لهذا العضو ولا افتراضي للعائلة — حدِّده من صفحة الأعضاء أو الإعدادات
                  </p>
                ) : (
                  <div className="border border-gray-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 font-bold">المتأخر عليه (آخر 12 شهراً مستحقاً)</span>
                      <span className={cn("text-xl font-mono font-bold", statement.arrears.arrears > 0 ? "text-red-600" : "text-emerald-600")}>
                        {fmt(statement.arrears.arrears)} <span className="text-xs">ر.ع</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs border-t border-gray-100 pt-3">
                      <div className="flex justify-between"><span className="text-gray-500">الاشتراك الشهري</span><span className="font-mono font-bold">{fmt(statement.arrears.expectedMonthly)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">المتوقع للفترة</span><span className="font-mono font-bold">{fmt(statement.arrears.expectedTotal)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">المدفوع المعتمد</span><span className="font-mono font-bold text-emerald-600">{fmt(statement.arrears.paidTotal)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">أشهر لم يدفع فيها</span><span className="font-mono font-bold">{statement.arrears.missedMonths}</span></div>
                    </div>
                    {statement.arrears.partialMonths > 0 && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        {statement.arrears.partialMonths} شهراً دفع فيها أقل من المتوقع
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            {sections.shares && (
              <section>
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><PieChart className="w-5 h-5 text-emerald-600" /> حصته من الصندوق</h3>
                {(() => {
                  const share = sharesReport?.shares.find((s) => s.memberId === memberId);
                  if (!share) {
                    return <p className="text-sm text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-2xl">لا مساهمات معتمدة بعد لحساب حصة</p>;
                  }
                  return (
                    <div className="border border-gray-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500 font-bold">نسبته من الصندوق</span>
                        <span className="text-xl font-mono font-bold text-emerald-600">{share.percent}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, share.percent)}%` }} />
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs border-t border-gray-100 pt-3">
                        <div className="flex justify-between"><span className="text-gray-500">مقابلها من صافي الأصول</span><span className="font-mono font-bold">{fmt(share.value)} ر.ع</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">إجمالي مساهماته</span><span className="font-mono font-bold">{fmt(share.contributed)} ر.ع</span></div>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">{sharesReport?.note}</p>
                    </div>
                  );
                })()}
              </section>
            )}

            {sections.timeline && (
              <section>
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><CalendarClock className="w-5 h-5 text-emerald-600" /> السجل الزمني الكامل</h3>
                {statement.timeline.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-2xl">لا حركات في هذه الفترة</p>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-2xl">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-xs">
                          <th className="py-2.5 px-3 text-right">التاريخ</th>
                          <th className="py-2.5 px-3 text-right">الحركة</th>
                          <th className="py-2.5 px-3 text-center">المبلغ</th>
                          <th className="py-2.5 px-3 text-center">المتبقي عليه بعدها</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.timeline.map((e, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="py-2.5 px-3 whitespace-nowrap text-gray-500">{fmtDate(e.date)}</td>
                            <td className="py-2.5 px-3">
                              <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-bold ml-2",
                                e.type === "contribution" ? "bg-emerald-100 text-emerald-700" :
                                e.type === "loan" ? "bg-blue-100 text-blue-700" : "bg-teal-100 text-teal-700")}>
                                {typeLabel[e.type]}
                              </span>
                              <span className="text-[13px]">{e.label}</span>
                            </td>
                            <td className={cn("py-2.5 px-3 text-center font-mono font-bold whitespace-nowrap",
                              e.type === "loan" ? "text-blue-600" : e.type === "repayment" ? "text-teal-600" : "text-emerald-600")}>
                              {e.type === "loan" ? "+" : e.type === "repayment" ? "−" : ""}{fmt(e.amount)}
                            </td>
                            <td className={cn("py-2.5 px-3 text-center font-mono font-bold whitespace-nowrap", e.debtAfter > 0 ? "text-red-600" : "text-emerald-600")}>
                              {fmt(e.debtAfter)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {sections.loans && (
              <section>
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><HandCoins className="w-5 h-5 text-emerald-600" /> تفاصيل السلف والسداد</h3>
                {statement.loans.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-2xl">لا سلف مسجلة</p>
                ) : (
                  <div className="space-y-3">
                    {statement.loans.map((l) => (
                      <div key={l.id} className="border border-gray-200 rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">{l.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">تسلّف بتاريخ: <b className="text-gray-800">{fmtDate(l.borrowedAt)}</b></p>
                          </div>
                          <div className="text-left">
                            <p className="font-mono font-bold text-blue-600">{fmt(l.amount)} ر.ع</p>
                            <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-bold mt-1",
                              l.settled ? "bg-emerald-100 text-emerald-700" :
                              l.status === "approved" ? "bg-amber-100 text-amber-700" :
                              l.status === "pending" ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-600")}>
                              {l.settled ? "مسدّدة بالكامل ✓" : l.status === "approved" ? `متبقٍ ${fmt(l.remaining)}` : l.status === "pending" ? "معلقة" : "مرفوضة"}
                            </span>
                          </div>
                        </div>
                        {l.payments.length > 0 && (
                          <div className="mt-3 border-t border-gray-100 pt-2 space-y-1">
                            {l.payments.map((p, i) => (
                              <div key={i} className="flex justify-between text-xs">
                                <span className="text-gray-500">سدّد بتاريخ {fmtDate(p.date)}{p.note ? ` — ${p.note}` : ""}</span>
                                <span className="font-mono font-bold text-teal-600">{fmt(p.amount)} ر.ع</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {sections.contributions && (
              <section>
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-600" /> شبكة المساهمات</h3>
                {statement.contributionsByYear.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-2xl">لا مساهمات مسجلة</p>
                ) : (
                  statement.contributionsByYear.map((y) => (
                    <div key={y.year} className="mb-4">
                      <p className="font-bold text-sm text-gray-500 mb-2">سنة {y.year}</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {y.months.map((m) => (
                          <div key={m.month} className={cn("rounded-xl border p-2.5 text-center",
                            m.status === "approved" ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50")}>
                            <p className="text-xs font-bold text-gray-500">{MONTH_NAMES[m.month - 1]}</p>
                            <p className="font-mono font-bold text-sm mt-0.5">{fmt(m.amount)}</p>
                            <p className={cn("text-xs font-bold", m.status === "approved" ? "text-emerald-600" : "text-amber-600")}>
                              {m.status === "approved" ? "معتمدة ✓" : "قيد الاعتماد"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </section>
            )}

            <footer className="text-center text-xs text-gray-400 border-t border-gray-200 pt-4">
              أُعد آلياً من سجلات النظام الموثقة — {statement.member.name} · {fmtDate(statement.generatedAt)}
            </footer>
          </div>
        ) : null}
      </div>
    </div>
  );
}
