import { useCallback, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { LayerOverdraft } from "@/lib/api";

/**
 * بوابة التجاوز: تسأل قبل أن يخرج المال.
 *
 * الحدّ إرشاد لا سدّ، فالبوابة **لا تمنع** — تعرض الرقم وتترك القرار للوصي.
 * وإن مضى، وثّقه الخادم في سجل التدقيق. أما إن كان المبلغ داخل الحد فلا نافذة
 * ولا سؤال: لا يُستوقف أحدٌ في طريقه بلا سبب.
 *
 * الاستعمال:
 *   const gate = useOverdraftGate();
 *   if (!(await gate.confirm(() => previewLoanLimit(amount)))) return;
 *   mutation.mutate(...);
 *   // وفي الشجرة: {gate.dialog}
 */
export function useOverdraftGate() {
  const [pending, setPending] = useState<{
    overdraft: LayerOverdraft;
    decide: (proceed: boolean) => void;
  } | null>(null);

  const confirm = useCallback(async (check: () => Promise<LayerOverdraft | null>) => {
    let overdraft: LayerOverdraft | null = null;
    try {
      overdraft = await check();
    } catch {
      // تعذّر الفحص لا يعني منع العملية — الخادم يفحص ويوثّق على كل حال
      return true;
    }

    if (!overdraft) return true;
    return new Promise<boolean>((resolve) => {
      setPending({ overdraft, decide: resolve });
    });
  }, []);

  const close = (proceed: boolean) => {
    pending?.decide(proceed);
    setPending(null);
  };

  const money = (value: number) => `${value.toLocaleString()} ر.ع`;

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent dir="rtl" className="text-right">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-right">
            المبلغ يتجاوز حدّ {pending?.overdraft.layerName}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-right leading-relaxed">
            المطلوب <span className="font-mono font-bold text-foreground">{money(pending?.overdraft.requested ?? 0)}</span>{" "}
            والمتاح <span className="font-mono font-bold text-foreground">{money(pending?.overdraft.available ?? 0)}</span>{" "}
            — بزيادة <span className="font-mono font-bold text-destructive">{money(pending?.overdraft.excess ?? 0)}</span>.
            <br />
            الحدّ إرشادي، فلك أن تمضي. وإن مضيت سُجّل التجاوز في سجل التدقيق باسمك.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={() => close(false)}>مراجعة المبلغ</AlertDialogCancel>
          {/* المتابعة تجاوز لا إجراء عادي — فلا تُقدَّم بلون الطمأنينة */}
          <AlertDialogAction
            onClick={() => close(true)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            متابعة رغم التجاوز
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
