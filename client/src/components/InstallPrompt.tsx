import { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  hasDismissedInstall,
  isIosSafari,
  isStandalone,
  rememberInstallDismissed,
  type InstallPromptEvent,
} from "@/lib/pwa";

/**
 * بطاقة تثبيت التطبيق — تظهر مرة واحدة لا غير.
 *
 * تُخفى نهائياً متى: كان التطبيق مثبَّتاً أصلاً، أو ثبّته المستخدم، أو أغلق
 * البطاقة. القرار محفوظ محلياً فلا تعاود الظهور عند كل زيارة.
 *
 * المسارُ يختلف بين النظامين: أندرويد يمنح المتصفح حدث تثبيت نستدعيه بزر،
 * أما iOS فلا حدث فيه — لا سبيل للتثبيت إلا بخطوات يدوية نشرحها للمستخدم.
 */
export default function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || hasDismissedInstall()) return;

    // أندرويد وسطح المكتب: المتصفح يخبرنا حين يصبح التطبيق قابلاً للتثبيت
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };

    // بعد التثبيت لا داعي للبطاقة مرة أخرى أبداً
    const onInstalled = () => {
      rememberInstallDismissed();
      setPromptEvent(null);
      setShowIosSteps(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS: لا حدث ننتظره، فنعرض الشرح بعد لحظة من الاستقرار على الصفحة
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIosSafari()) {
      timer = setTimeout(() => setShowIosSteps(true), 3000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  function close() {
    rememberInstallDismissed();
    setDismissed(true);
  }

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // القبول أو الرفض كلاهما جواب نهائي — لا نسأل ثانية
    rememberInstallDismissed();
    setPromptEvent(null);
    if (outcome === "dismissed") setDismissed(true);
  }

  if (dismissed || (!promptEvent && !showIosSteps)) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:right-auto lg:max-w-sm">
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-4 shadow-xl">
        <button
          onClick={close}
          aria-label="إغلاق"
          className="absolute left-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pl-8">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Download className="h-5 w-5 text-primary" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-base font-bold text-foreground">
              ثبّت صندوق العائلة على جهازك
            </h2>

            {promptEvent ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  يفتح مباشرة من الشاشة الرئيسية، ويصلك تنبيه بالأقساط والمستجدات.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button onClick={install} size="sm" className="flex-1">
                    تثبيت التطبيق
                  </Button>
                  <Button onClick={close} size="sm" variant="ghost">
                    لاحقاً
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  على الآيفون يتم التثبيت من سفاري بخطوتين:
                </p>
                <ol className="mt-2 space-y-1.5 text-sm text-foreground">
                  <li className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      ١
                    </span>
                    اضغط
                    <Share className="h-4 w-4 shrink-0 text-primary" />
                    زر المشاركة في شريط سفاري
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      ٢
                    </span>
                    اختر
                    <Plus className="h-4 w-4 shrink-0 text-primary" />
                    «إضافة إلى الشاشة الرئيسية»
                  </li>
                </ol>
                <Button onClick={close} size="sm" variant="ghost" className="mt-3 w-full">
                  فهمت
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
