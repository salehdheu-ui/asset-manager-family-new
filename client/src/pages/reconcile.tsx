import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import MobileLayout from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { findAmount, getReconcileReport, type AmountMatch, type ReconcileFinding } from "@/lib/api";

/**
 * تدقيق الحسابات.
 *
 * وُلدت هذه الصفحة من سؤال: «ينقصني ٣٦ ولا أعرف أين ذهبت». الجواب لا يكون
 * برقم واحد معروض، بل ببناء الرصيد من جديد من صفوفه الأولية وعرض كل بند على
 * حدة — ثم تسمية كل خلل بين الجداول باسمه ومقداره.
 */

const money = (value: number) =>
  `${value.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ر.ع`;

/**
 * العدد بالعربية يوافق معدوده: واحد ومثنى وجمع. «1 خللاً» ليست عربية،
 * والصفحة التي تعرض أرقام مال العائلة أولى الصفحات بأن تُقرأ سليمة.
 */
function count(n: number, one: string, two: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${many}`;
}

const SEVERITY = {
  critical: { icon: XCircle, tone: "text-destructive", box: "border-destructive/30 bg-destructive/5", label: "خلل" },
  warning: { icon: AlertTriangle, tone: "text-amber-600", box: "border-amber-500/30 bg-amber-500/5", label: "تنبيه" },
  info: { icon: Info, tone: "text-muted-foreground", box: "border-border bg-muted/40", label: "ملاحظة" },
} as const;

function Finding({ finding }: { finding: ReconcileFinding }) {
  const style = SEVERITY[finding.severity];
  const Icon = style.icon;

  return (
    <div className={`rounded-xl border p-3 ${style.box}`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.tone}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-sm font-bold text-foreground">{finding.title}</h3>
            {finding.amount !== undefined && (
              <span className={`font-mono text-sm font-bold ${style.tone}`}>{money(finding.amount)}</span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{finding.detail}</p>
          {finding.samples && finding.samples.length > 0 && (
            <ul className="mt-2 space-y-1">
              {finding.samples.slice(0, 8).map((sample, index) => (
                <li key={index} className="rounded-lg bg-background/60 px-2 py-1 text-xs text-foreground">
                  {sample}
                </li>
              ))}
              {finding.samples.length > 8 && (
                <li className="text-xs text-muted-foreground">…و{finding.samples.length - 8} غيرها</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, sign }: { label: string; value: number; sign?: "+" | "−" }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">
        {sign && <span className={sign === "+" ? "text-fund-in" : "text-fund-due"}>{sign} </span>}
        {label}
      </span>
      <span className="font-mono text-sm font-medium text-foreground">{money(value)}</span>
    </div>
  );
}

export default function Reconcile() {
  const [term, setTerm] = useState("");
  const [matches, setMatches] = useState<AmountMatch[] | null>(null);
  const [searching, setSearching] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["reconcile"],
    queryFn: getReconcileReport,
  });

  async function search() {
    const value = Number(term);
    if (!Number.isFinite(value)) return;
    setSearching(true);
    try {
      setMatches(await findAmount(value));
    } finally {
      setSearching(false);
    }
  }

  const critical = data?.findings.filter((finding) => finding.severity === "critical") ?? [];

  return (
    <MobileLayout title="تدقيق الحسابات">
      <div className="space-y-4 p-4">
        {isLoading && <p className="text-sm text-muted-foreground">جارٍ التدقيق…</p>}

        {data && (
          <>
            <div
              className={`rounded-2xl border p-4 ${
                critical.length === 0 ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"
              }`}
            >
              <div className="flex items-start gap-3">
                {critical.length === 0 ? (
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                )}
                <div>
                  <h2 className="font-bold text-foreground">
                    {critical.length === 0
                      ? "الحسابات متطابقة"
                      : count(
                          critical.length,
                          "خلل واحد يمسّ الأرقام",
                          "خللان يمسّان الأرقام",
                          "أخلال تمسّ الأرقام",
                        )}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    صافي الأصول المعاد بناؤه من الصفوف:{" "}
                    <span className="font-mono font-bold text-foreground">{money(data.rebuilt.netAssets)}</span>
                  </p>
                </div>
              </div>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">من أين جاء الرقم</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Row label="مساهمات معتمدة" value={data.rebuilt.contributionsApproved} sign="+" />
                <Row label="إيداعات مباشرة" value={data.rebuilt.deposits} sign="+" />
                <Row label="سداد السلف" value={data.rebuilt.repayments} sign="+" />
                <Row label="سحوبات مباشرة" value={data.rebuilt.withdrawals} sign="−" />
                <Row label="سلف معتمدة" value={data.rebuilt.loansApproved} sign="−" />
                <Row label="مصروفات" value={data.rebuilt.expenses} sign="−" />
                <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2">
                  <span className="text-sm font-bold text-foreground">صافي الأصول</span>
                  <span className="font-mono text-base font-bold text-primary">{money(data.rebuilt.netAssets)}</span>
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <p>مساهمات بانتظار الاعتماد (خارج الحساب): {money(data.rebuilt.contributionsPending)}</p>
                  <p>سلف معلّقة (خارج الحساب): {money(data.rebuilt.loansPending)}</p>
                  <p>استثمارات قائمة (محسوبة ضمن الأصول): {money(data.rebuilt.activeInvestments)}</p>
                </div>
              </CardContent>
            </Card>

            {data.findings.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-foreground">ما وجده التدقيق</h2>
                {data.findings.map((finding) => (
                  <Finding key={finding.id} finding={finding} />
                ))}
              </div>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Search className="h-4 w-4 text-primary" />
                  تعقّب مبلغ
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  أدخل المبلغ الذي تبحث عنه ليُعرض كل صف بقيمته في كل جداول المال.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && search()}
                    inputMode="decimal"
                    placeholder="36"
                    className="font-mono"
                  />
                  <Button onClick={search} disabled={searching || term.trim() === ""} size="sm">
                    {searching ? "بحث…" : "ابحث"}
                  </Button>
                </div>

                {matches !== null && (
                  <div className="space-y-1.5">
                    {matches.length === 0 ? (
                      <p className="text-sm text-muted-foreground">لا صف بهذا المبلغ في أي جدول.</p>
                    ) : (
                      matches.map((match) => (
                        <div key={`${match.source}-${match.id}`} className="rounded-lg border border-border p-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-bold text-primary">{match.source}</span>
                            <span className="font-mono text-xs text-foreground">{money(match.amount)}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{match.description}</p>
                          {match.createdAt && (
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(match.createdAt).toLocaleString("ar-OM")}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">تغطية سجل التدقيق</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {data.coverage.map((entry) => {
                  const complete = entry.rows === entry.audited;
                  return (
                    <div
                      key={entry.table}
                      className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0"
                    >
                      <span className="text-sm text-muted-foreground">{entry.label}</span>
                      <span className={`font-mono text-sm ${complete ? "text-primary" : "text-amber-600"}`}>
                        {entry.audited} / {entry.rows}
                      </span>
                    </div>
                  );
                })}
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  الحركات المسجّلة قبل تفعيل التوثيق الكامل تظهر هنا بلا أثر — وهذا وصف
                  للماضي لا خلل قائم. كل حركة جديدة تُوثَّق مع كتابتها في المعاملة نفسها.
                </p>
              </CardContent>
            </Card>

            <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm" className="w-full">
              <RefreshCw className="ml-1.5 h-4 w-4" />
              {isFetching ? "جارٍ التدقيق…" : "أعد التدقيق"}
            </Button>
          </>
        )}
      </div>
    </MobileLayout>
  );
}
