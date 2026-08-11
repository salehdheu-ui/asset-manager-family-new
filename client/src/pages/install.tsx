import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, ExternalLink, Info, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { diagnoseInstall, diagnosisReport, type CheckState, type InstallDiagnosis } from "@/lib/install-check";
import { canInstall, promptInstall, rememberInstallDismissed, watchInstallPrompt } from "@/lib/pwa";

/**
 * صفحة «لماذا لا يُثبَّت التطبيق؟» — تُفتح بالرابط /install.
 *
 * وجودها لأن أعطال التثبيت تحدث على جهاز لا يراه أحد غير صاحبه: رابط فُتح من
 * واتساب، أو كروم على آيفون، أو اختصار قديم يمنع التثبيت الحقيقي. لا سبيل
 * لتشخيصها من الخادم، فالتشخيص يجري هنا على الجهاز نفسه ويخرج بخطوة واحدة.
 */

const ICONS: Record<CheckState, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
  info: Info,
};

const TONES: Record<CheckState, string> = {
  ok: "text-primary",
  warn: "text-amber-600",
  fail: "text-destructive",
  info: "text-muted-foreground",
};

const BANNERS: Record<CheckState, string> = {
  ok: "border-primary/30 bg-primary/5",
  warn: "border-amber-500/30 bg-amber-500/5",
  fail: "border-destructive/30 bg-destructive/5",
  info: "border-border bg-muted/40",
};

export default function InstallHelp() {
  const { toast } = useToast();
  const [diagnosis, setDiagnosis] = useState<InstallDiagnosis | null>(null);
  const [installable, setInstallable] = useState(() => canInstall());
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      setInstallable(canInstall());
      setDiagnosis(await diagnoseInstall());
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    run();
    // وصول عرض التثبيت متأخراً يغيّر الحكم — نعيد الفحص عنده
    return watchInstallPrompt(() => {
      run();
    });
  }, []);

  async function install() {
    const outcome = await promptInstall();
    if (outcome === "accepted") rememberInstallDismissed();
    run();
  }

  async function copyReport() {
    if (!diagnosis) return;
    try {
      await navigator.clipboard.writeText(diagnosisReport(diagnosis));
      toast({ title: "نُسخ التقرير — أرسله لمن يساعدك" });
    } catch {
      toast({ title: "تعذّر النسخ", variant: "destructive" });
    }
  }

  const Verdict = diagnosis ? ICONS[diagnosis.verdict.state] : Info;

  return (
    <div className="min-h-screen bg-background px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-md space-y-4">
        <header className="text-center">
          <h1 className="font-heading text-xl font-bold text-foreground">تثبيت التطبيق</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            هذه الصفحة تفحص جهازك وتقول لك سبب تعثّر التثبيت بالضبط.
          </p>
        </header>

        {diagnosis && (
          <div className={`rounded-2xl border p-4 ${BANNERS[diagnosis.verdict.state]}`}>
            <div className="flex items-start gap-3">
              <Verdict className={`mt-0.5 h-5 w-5 shrink-0 ${TONES[diagnosis.verdict.state]}`} />
              <div className="min-w-0">
                <h2 className="font-bold text-foreground">{diagnosis.verdict.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{diagnosis.verdict.detail}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {installable && (
                <Button onClick={install} size="sm">
                  <Download className="ml-1.5 h-4 w-4" />
                  تثبيت التطبيق
                </Button>
              )}
              {diagnosis.chromeIntent && (
                <Button asChild size="sm" variant="outline">
                  <a href={diagnosis.chromeIntent}>
                    <ExternalLink className="ml-1.5 h-4 w-4" />
                    افتح في كروم
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">تفصيل الفحص</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {diagnosis?.checks.map((check) => {
              const Icon = ICONS[check.state];
              return (
                <div key={check.id} className="flex items-start gap-3">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONES[check.state]}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{check.label}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
                  </div>
                </div>
              );
            })}

            {!diagnosis && <p className="text-sm text-muted-foreground">جارٍ الفحص…</p>}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button onClick={run} disabled={busy} variant="outline" size="sm" className="flex-1">
            <RefreshCw className="ml-1.5 h-4 w-4" />
            {busy ? "لحظة…" : "أعد الفحص"}
          </Button>
          <Button onClick={copyReport} disabled={!diagnosis} variant="ghost" size="sm" className="flex-1">
            <Copy className="ml-1.5 h-4 w-4" />
            انسخ التقرير
          </Button>
        </div>

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          إن كانت على جهازك أيقونة قديمة وُضعت كاختصار، احذفها قبل التثبيت —
          أندرويد لا يرقّي اختصاراً قائماً إلى تطبيق.
        </p>
      </div>
    </div>
  );
}
