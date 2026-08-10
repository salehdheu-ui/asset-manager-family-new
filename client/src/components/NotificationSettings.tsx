import { useEffect, useState } from "react";
import { Bell, BellOff, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  disablePush,
  enablePush,
  isIos,
  isPushEnabled,
  isStandalone,
  notificationPermission,
  pushSupport,
} from "@/lib/pwa";

/**
 * تفعيل الإشعارات لهذا الجهاز.
 *
 * الإذن لا يُطلب إلا بضغطة صريحة على الزر. الطلب التلقائي عند فتح الصفحة
 * يجعل المتصفحات تحجب الطلب نهائياً، فيخسر المستخدم الخيار بلا رجعة.
 */
export default function NotificationSettings() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  const support = pushSupport();
  const permission = notificationPermission();

  useEffect(() => {
    isPushEnabled()
      .then(setEnabled)
      .catch(() => setEnabled(false))
      .finally(() => setChecked(true));
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        toast({ title: "أُوقفت الإشعارات على هذا الجهاز" });
        return;
      }

      const result = await enablePush();
      if (result.ok) {
        setEnabled(true);
        toast({ title: "فُعّلت الإشعارات على هذا الجهاز" });
      } else {
        toast({ title: "تعذر تفعيل الإشعارات", description: result.reason, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {enabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
          إشعارات هذا الجهاز
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {support === "needs-install" ? (
          // iOS لا يوصل إشعاراً لصفحة في المتصفح — لا بد من تثبيت التطبيق أولاً
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              على الآيفون تصل الإشعارات بعد تثبيت التطبيق على الشاشة الرئيسية:
            </p>
            <ol className="space-y-1.5">
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">١</span>
                من سفاري اضغط <Share className="h-4 w-4 shrink-0 text-primary" /> زر المشاركة
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">٢</span>
                اختر <Plus className="h-4 w-4 shrink-0 text-primary" /> «إضافة إلى الشاشة الرئيسية»
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">٣</span>
                افتح التطبيق من أيقونته وعُد إلى هنا
              </li>
            </ol>
          </div>
        ) : support === "unsupported" ? (
          <p className="text-sm text-muted-foreground">
            هذا المتصفح لا يدعم الإشعارات. جرّب كروم على أندرويد أو سفاري على الآيفون بعد تثبيت التطبيق.
          </p>
        ) : permission === "denied" ? (
          // لا سبيل لإعادة الطلب بعد الحظر — الإذن يُعاد من إعدادات المتصفح وحدها
          <p className="text-sm text-muted-foreground">
            الإشعارات محظورة لهذا الموقع في إعدادات المتصفح. اسمح بها من إعدادات الموقع ثم عُد إلى هنا.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {enabled
                ? "يصلك تنبيه بالأقساط المستحقة والمستجدات حتى والتطبيق مغلق."
                : "فعّلها ليصلك تنبيه بالأقساط المستحقة والمستجدات حتى والتطبيق مغلق."}
            </p>
            <Button onClick={toggle} disabled={busy || !checked} variant={enabled ? "outline" : "default"} size="sm">
              {busy ? "لحظة…" : enabled ? "إيقاف الإشعارات" : "تفعيل الإشعارات"}
            </Button>
            {isIos() && isStandalone() && !enabled && (
              <p className="text-xs text-muted-foreground">
                إن لم تظهر نافذة الإذن، تأكد أنك فتحت التطبيق من أيقونته لا من سفاري.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
