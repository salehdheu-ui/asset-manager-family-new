import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  enablePush,
  hasAskedForPush,
  isStandalone,
  notificationPermission,
  pushSupport,
  rememberPushAsked,
} from "@/lib/pwa";

/**
 * دعوة تفعيل الإشعارات بعد تثبيت التطبيق.
 *
 * التوقيت مقصود: التثبيت هو اللحظة التي قرّر فيها المستخدم أن هذا تطبيقه، وهي
 * أفضل لحظة لعرض ما يفيده منه. وقبل ذلك — لأول زائر — لا معنى للسؤال.
 *
 * وثلاثة قيود تحكمها حتى لا تصير إزعاجاً:
 *  • تُعرض مرة واحدة في عمر الجهاز، مهما كان الجواب.
 *  • لا تطلب الإذن من نفسها — الطلب من ضغطة الزر وحدها. الطلب التلقائي عند
 *    الفتح يدفع المتصفحات لحجب الطلب نهائياً فيخسر المستخدم الخيار بلا رجعة.
 *  • لا تظهر لمن لم يدخل بعد: الاشتراك يُحفظ باسم صاحبه، ولا اسم قبل الدخول.
 */
export default function PushInvite() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (hasAskedForPush()) return;
    if (pushSupport() !== "ready" || notificationPermission() !== "default") return;

    // بعد التثبيت مباشرة، أو عند أول فتح للتطبيق المثبَّت.
    // الشرط داخل الدالة لا خارجها فقط: التثبيت قد يتكرر في الجلسة نفسها بعد
    // «لاحقاً»، ولا يعيد ذلك فتح باب سؤال أُجيب عليه.
    const show = () => {
      if (hasAskedForPush()) return;
      setVisible(true);
    };
    if (isStandalone()) {
      const timer = setTimeout(show, 2500);
      return () => clearTimeout(timer);
    }

    window.addEventListener("appinstalled", show);
    return () => window.removeEventListener("appinstalled", show);
  }, [user]);

  function dismiss() {
    rememberPushAsked();
    setVisible(false);
  }

  async function enable() {
    setBusy(true);
    try {
      const result = await enablePush();
      rememberPushAsked();
      setVisible(false);
      toast(
        result.ok
          ? { title: "فُعّلت الإشعارات على هذا الجهاز" }
          : { title: "لم تُفعَّل الإشعارات", description: result.reason, variant: "destructive" },
      );
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:right-auto lg:max-w-sm">
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-4 shadow-xl">
        <button
          onClick={dismiss}
          aria-label="إغلاق"
          className="absolute left-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pl-8">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-base font-bold text-foreground">فعّل تنبيهات الصندوق</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              يصلك تنبيه بقسطك قبل موعده وبمساهمة الشهر والمستجدات — حتى والتطبيق مغلق.
            </p>
            <div className="mt-3 flex gap-2">
              <Button onClick={enable} disabled={busy} size="sm" className="flex-1">
                {busy ? "لحظة…" : "تفعيل الإشعارات"}
              </Button>
              <Button onClick={dismiss} size="sm" variant="ghost">
                لاحقاً
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
