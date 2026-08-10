import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyUpdate } from "@/lib/pwa";

/**
 * شريط "تحديث متاح".
 *
 * التحديث لا يُطبَّق تلقائياً: إعادة التحميل في منتصف إدخال سلفة أو مساهمة
 * تفقد ما كُتب. المستخدم يقرر متى.
 */
export default function UpdateBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-x-0 top-0 z-50 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-primary/20 bg-card p-3 shadow-lg">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <RefreshCw className="h-4 w-4 text-primary" />
        </div>
        <p className="min-w-0 flex-1 text-sm text-foreground">
          يوجد تحديث جديد للتطبيق
        </p>
        <Button size="sm" onClick={applyUpdate}>
          تحديث الآن
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          لاحقاً
        </Button>
      </div>
    </div>
  );
}
