import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Download, Plus, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  installPrompt,
  isIos,
  isIosSafari,
  isStandalone,
  promptInstall,
  rememberInstallDismissed,
  watchInstallPrompt,
} from "@/lib/pwa";

/**
 * مكان دائم لتثبيت التطبيق في صفحة «حسابي».
 *
 * بطاقة الترحيب تظهر مرة واحدة ثم لا تعود — وهذا مقصود، لكنه يترك من تجاوزها
 * بلا طريق. هنا الطريق: لا يظهر إلا لمن لم يثبّت بعد، ولا يُلحّ على أحد.
 *
 * التمييز بين «تطبيق» و«اختصار» مقصود في النص: أندرويد يبني تطبيقاً حقيقياً
 * (WebAPK) حين يأتي التثبيت من هذا الزر أو من «تثبيت التطبيق» في قائمة كروم،
 * بينما «إضافة إلى الشاشة الرئيسية» من متصفح آخر لا تصنع إلا اختصاراً يفتح في
 * المتصفح.
 */
export default function AppInstallCard() {
  const { toast } = useToast();
  const [available, setAvailable] = useState(() => installPrompt() !== null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unwatch = watchInstallPrompt((event) => setAvailable(event !== null));
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      unwatch();
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        rememberInstallDismissed();
        setInstalled(true);
        toast({ title: "جارٍ تثبيت التطبيق على جهازك" });
      }
    } finally {
      setBusy(false);
    }
  }

  if (installed) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">التطبيق مثبَّت على هذا الجهاز</p>
            <p className="text-xs text-muted-foreground">
              تفتحه من قائمة التطبيقات كأي تطبيق آخر.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4 text-primary" />
          تثبيت التطبيق على هذا الجهاز
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {available ? (
          <>
            <p className="text-sm text-muted-foreground">
              يُضاف تطبيقاً كاملاً في قائمة تطبيقات جهازك — يفتح بلا شريط متصفح،
              وله أيقونته وشاشته الخاصة.
            </p>
            <Button onClick={install} disabled={busy} size="sm">
              <Download className="ml-1.5 h-4 w-4" />
              {busy ? "لحظة…" : "تثبيت التطبيق"}
            </Button>
          </>
        ) : isIosSafari() ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">على الآيفون يتم التثبيت من سفاري:</p>
            <ol className="space-y-1.5">
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  ١
                </span>
                اضغط <Share className="h-4 w-4 shrink-0 text-primary" /> زر المشاركة في شريط سفاري
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  ٢
                </span>
                اختر <Plus className="h-4 w-4 shrink-0 text-primary" /> «إضافة إلى الشاشة الرئيسية»
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  ٣
                </span>
                افتح التطبيق من أيقونته — يعمل بملء الشاشة بلا سفاري
              </li>
            </ol>
          </div>
        ) : isIos() ? (
          <p className="text-sm text-muted-foreground">
            على الآيفون لا يتم التثبيت إلا من متصفح سفاري. افتح الرابط في سفاري ثم عُد إلى هنا.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            افتح قائمة المتصفح (⋮) واختر «تثبيت التطبيق». إن لم تجدها فالمتصفح
            الحالي لا يثبّت تطبيقات — استخدم كروم على أندرويد أو سفاري على
            الآيفون.
          </p>
        )}

        <Link
          href="/install"
          className="inline-block text-xs text-primary underline-offset-4 hover:underline"
        >
          لم ينجح التثبيت؟ افحص جهازك
        </Link>
      </CardContent>
    </Card>
  );
}
