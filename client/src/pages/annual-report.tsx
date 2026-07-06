import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { getYearlyReport, getMembersPerformance, getDashboardSummary, getSettings, getCommitmentScores } from "@/lib/api";
import { Printer, ArrowRight, TrendingUp, HandCoins, Wallet, Users } from "lucide-react";
import logo from "@assets/generated_images/minimalist_family_fund_logo_symbol.png";

// التقرير السنوي للعائلة — صفحة مهيأة للطباعة/حفظ PDF لعرضها في الاجتماع السنوي
export default function AnnualReport() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: yearly } = useQuery({ queryKey: ["yearly-report", year], queryFn: () => getYearlyReport(year) });
  const { data: performance } = useQuery({ queryKey: ["members-performance", year], queryFn: () => getMembersPerformance(year) });
  const { data: summary } = useQuery({ queryKey: ["dashboard-summary"], queryFn: getDashboardSummary });
  const { data: scores = [] } = useQuery({ queryKey: ["commitment-scores"], queryFn: getCommitmentScores });

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
  const netFlow = (yearly?.summary.totalContributions ?? 0) - (yearly?.summary.totalLoans ?? 0) - (yearly?.summary.totalExpenses ?? 0);
  const topMembers = [...(performance?.members ?? [])].sort((a, b) => b.totalContributions - a.totalContributions).slice(0, 3);

  return (
    <div dir="rtl" className="min-h-screen bg-white text-gray-900 print:bg-white">
      {/* شريط الأدوات — لا يُطبع */}
      <div className="print:hidden sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Link href="/analytics" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          <ArrowRight className="w-4 h-4" /> رجوع
        </Link>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
          data-testid="select-report-year"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button
          onClick={() => window.print()}
          className="mr-auto bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-700"
          data-testid="button-print-report"
        >
          <Printer className="w-4 h-4" /> طباعة / حفظ PDF
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-8 py-10 space-y-10">
        {/* الترويسة */}
        <header className="text-center space-y-3 border-b-2 border-emerald-600 pb-8">
          <img src={logo} alt="" className="w-16 h-16 mx-auto opacity-90" />
          <h1 className="text-3xl font-bold">{settings?.familyName ?? "صندوق العائلة"}</h1>
          <p className="text-lg text-gray-600">التقرير السنوي — {year}</p>
          <p className="text-xs text-gray-400">أُعد آلياً من سجلات النظام في {new Date().toLocaleDateString("ar-OM")}</p>
        </header>

        {/* أرقام السنة */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-600" /> ملخص السنة المالية</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-2xl p-5 text-center">
              <p className="text-xs text-gray-500 font-bold">إجمالي المساهمات</p>
              <p className="text-2xl font-mono font-bold text-emerald-600 mt-1">{fmt(yearly?.summary.totalContributions ?? 0)} <span className="text-xs">ر.ع</span></p>
              <p className="text-[11px] text-gray-400 mt-1">{yearly?.summary.contributionCount ?? 0} مساهمة</p>
            </div>
            <div className="border border-gray-200 rounded-2xl p-5 text-center">
              <p className="text-xs text-gray-500 font-bold">السلف الممنوحة</p>
              <p className="text-2xl font-mono font-bold text-blue-600 mt-1">{fmt(yearly?.summary.totalLoans ?? 0)} <span className="text-xs">ر.ع</span></p>
              <p className="text-[11px] text-gray-400 mt-1">{yearly?.summary.loanCount ?? 0} سلفة</p>
            </div>
            <div className="border border-gray-200 rounded-2xl p-5 text-center">
              <p className="text-xs text-gray-500 font-bold">المصروفات</p>
              <p className="text-2xl font-mono font-bold text-amber-600 mt-1">{fmt(yearly?.summary.totalExpenses ?? 0)} <span className="text-xs">ر.ع</span></p>
              <p className="text-[11px] text-gray-400 mt-1">{yearly?.summary.expenseCount ?? 0} عملية</p>
            </div>
            <div className="border border-gray-200 rounded-2xl p-5 text-center">
              <p className="text-xs text-gray-500 font-bold">صافي رأس مال الصندوق الآن</p>
              <p className="text-2xl font-mono font-bold text-gray-900 mt-1">{fmt(summary?.netCapital ?? 0)} <span className="text-xs">ر.ع</span></p>
              <p className={`text-[11px] mt-1 font-bold ${netFlow >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                صافي تدفق السنة: {fmt(netFlow)} ر.ع
              </p>
            </div>
          </div>
        </section>

        {/* أوسمة السنة */}
        {topMembers.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-emerald-600" /> أبرز المساهمين</h2>
            <div className="grid grid-cols-3 gap-3">
              {topMembers.map((m, i) => (
                <div key={m.memberId} className="border border-gray-200 rounded-2xl p-4 text-center">
                  <p className="text-2xl">{["🥇", "🥈", "🥉"][i]}</p>
                  <p className="font-bold mt-1">{m.name}</p>
                  <p className="text-sm font-mono text-emerald-600">{fmt(m.totalContributions)} ر.ع</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* كشف الأعضاء */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Wallet className="w-5 h-5 text-emerald-600" /> كشف الأعضاء التفصيلي</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300 text-gray-500 text-xs">
                <th className="py-2 text-right">العضو</th>
                <th className="py-2 text-center">مساهمات السنة</th>
                <th className="py-2 text-center">أشهر الالتزام</th>
                <th className="py-2 text-center">سلف قائمة</th>
                <th className="py-2 text-center">درجة الالتزام</th>
              </tr>
            </thead>
            <tbody>
              {(performance?.members ?? []).map((m) => {
                const score = scores.find((s) => s.memberId === m.memberId)?.score;
                return (
                  <tr key={m.memberId} className="border-b border-gray-100">
                    <td className="py-2.5 font-bold">{m.name}{m.role === "guardian" ? " (الوصي)" : m.role === "custodian" ? " (الأمين)" : ""}</td>
                    <td className="py-2.5 text-center font-mono">{fmt(m.totalContributions)}</td>
                    <td className="py-2.5 text-center">{m.contributionMonths}/12</td>
                    <td className="py-2.5 text-center font-mono">{fmt(m.totalLoans)}</td>
                    <td className="py-2.5 text-center">
                      {score !== undefined ? (
                        <span className={`font-mono font-bold ${score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-500"}`}>{score}</span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* الحركة الشهرية */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><HandCoins className="w-5 h-5 text-emerald-600" /> الحركة الشهرية</h2>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300 text-gray-500">
                <th className="py-2 text-right">الشهر</th>
                <th className="py-2 text-center">مساهمات</th>
                <th className="py-2 text-center">سلف</th>
                <th className="py-2 text-center">مصروفات</th>
              </tr>
            </thead>
            <tbody>
              {(yearly?.monthlyData ?? []).map((m) => (
                <tr key={m.month} className="border-b border-gray-100">
                  <td className="py-2 font-bold">{m.monthName}</td>
                  <td className="py-2 text-center font-mono text-emerald-600">{m.contributions > 0 ? fmt(m.contributions) : "—"}</td>
                  <td className="py-2 text-center font-mono text-blue-600">{m.loans > 0 ? fmt(m.loans) : "—"}</td>
                  <td className="py-2 text-center font-mono text-amber-600">{m.expenses > 0 ? fmt(m.expenses) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="text-center text-[11px] text-gray-400 border-t border-gray-200 pt-6 pb-10">
          كل الأرقام مستخرجة من سجل النظام الموثق — سجل التدقيق يحفظ تاريخ كل عملية ولا يمكن تعديله.
        </footer>
      </div>
    </div>
  );
}
