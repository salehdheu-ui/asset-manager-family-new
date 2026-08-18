import type { LayerOverdraft } from "./api";

/**
 * رسالة تحذير التجاوز.
 *
 * تُقال بلغة صاحب القرار لا بلغة النظام: كم طُلب، وكم كان متاحاً، وكم تجاوز —
 * ثم تُذكّره أن العملية تمّت وأن تجاوزها مكتوب في السجل. فلا هي تمنعه، ولا هي
 * تمرّ عليه بلا علم.
 */
export function overdraftToast(overdraft: LayerOverdraft) {
  const money = (value: number) => `${value.toLocaleString()} ر.ع`;
  return {
    title: `تجاوز حدّ ${overdraft.layerName}`,
    description:
      `المطلوب ${money(overdraft.requested)} والمتاح ${money(overdraft.available)} — ` +
      `تجاوز ${money(overdraft.excess)}. نُفِّذت العملية وسُجّل التجاوز في سجل التدقيق.`,
    variant: "destructive" as const,
    duration: 12000,
  };
}
