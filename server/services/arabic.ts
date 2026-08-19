/**
 * صيغ العدد في العربية: الواحد والاثنان لهما لفظهما، وما بعدهما جمع.
 * «1 خللاً» و«6 مساهمة» تُقرأ ركيكةً، والرسالة التي تُقرأ ركيكةً تُصدّق أقل.
 */
export function arabicCount(n: number, one: string, two: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${many}`;
}
