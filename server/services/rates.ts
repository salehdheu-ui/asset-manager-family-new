import { storage } from "../storage";
import { rateForMonth, type RatePeriod } from "@shared/finance";
import type { ContributionRate } from "@shared/schema";

export interface RateResolver {
  /** أسعار العضو مدمجة مع الأسعار العائلية — الخاص يغلب العام في الشهر نفسه */
  ratesFor(memberId: string): RatePeriod[];
  /** السعر الساري لهذا العضو في هذا الشهر (صفر = لا سعر ⇒ لا محاسبة) */
  rateAt(memberId: string, year: number, month: number): number;
  /** السعر الساري الآن — يُعرض للوصي كمرجع */
  currentRate(memberId: string, now?: Date): number;
  all: ContributionRate[];
}

const toPeriod = (r: ContributionRate): RatePeriod => ({
  amount: Number(r.amount),
  year: r.effectiveYear,
  month: r.effectiveMonth,
});

// يُحمَّل مرة واحدة لكل طلب، فحساب عشرة أعضاء لا يعني عشرة استعلامات
export async function loadRates(): Promise<RateResolver> {
  const all = await storage.getContributionRates();
  const family = all.filter((r) => !r.memberId).map(toPeriod);
  const byMember = new Map<string, RatePeriod[]>();
  for (const r of all) {
    if (!r.memberId) continue;
    const list = byMember.get(r.memberId) ?? [];
    list.push(toPeriod(r));
    byMember.set(r.memberId, list);
  }

  const ratesFor = (memberId: string): RatePeriod[] => {
    const own = byMember.get(memberId) ?? [];
    if (own.length === 0) return family;
    // السعر الخاص يلغي العائلي من شهر سريانه فصاعداً؛ وقبله يسري العائلي
    const ownKeys = new Set(own.map((r) => r.year * 12 + r.month));
    const earliestOwn = Math.min(...own.map((r) => r.year * 12 + r.month));
    const inherited = family.filter((r) => {
      const k = r.year * 12 + r.month;
      return k < earliestOwn && !ownKeys.has(k);
    });
    return [...inherited, ...own];
  };

  return {
    all,
    ratesFor,
    rateAt: (memberId, year, month) => rateForMonth(ratesFor(memberId), year, month),
    currentRate: (memberId, now = new Date()) =>
      rateForMonth(ratesFor(memberId), now.getFullYear(), now.getMonth() + 1),
  };
}
