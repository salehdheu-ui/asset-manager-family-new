import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated, isAdmin } from "../auth";
import { nextMonthOf, rateForMonth } from "@shared/finance";
import { loadRates } from "../services/rates";
import { zodErrorResponse } from "../validation";

const createSchema = z.object({
  memberId: z.string().nullable().optional(),   // فارغ = السعر العائلي الافتراضي
  amount: z.string().refine((v) => Number(v) >= 0, "المبلغ لا يمكن أن يكون سالباً"),
  // شهر بدء السريان — إن لم يُرسل فالشهر القادم، حتى لا يُعاد حساب ما مضى
  effectiveYear: z.number().int().min(2020).max(2100).optional(),
  effectiveMonth: z.number().int().min(1).max(12).optional(),
  note: z.string().max(300).nullable().optional(),
});

export function registerRateRoutes(app: Express) {
  // سجل الاشتراك الشهري: كل مبلغ ومن أي شهر يسري
  app.get("/api/contribution-rates", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const [rates, members] = await Promise.all([loadRates(), storage.getMembers()]);
      const now = new Date();
      const next = nextMonthOf(now.getFullYear(), now.getMonth() + 1);
      const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.name ?? "عضو" : "الافتراضي العائلي");

      res.json({
        // الشهر الذي سيبدأ منه أي مبلغ جديد افتراضياً
        defaultEffective: next,
        rates: rates.all.map((r) => ({
          ...r,
          scopeName: nameOf(r.memberId),
          amount: Number(r.amount),
        })),
        current: {
          family: rates.currentRate("", now),
          members: members.filter((m) => !m.archivedAt).map((m) => ({
            memberId: m.id,
            name: m.name,
            now: rates.currentRate(m.id, now),
            fromNextMonth: rateForMonth(rates.ratesFor(m.id), next.year, next.month),
          })),
        },
      });
    } catch (error) {
      console.error("List contribution rates error:", error);
      res.status(500).json({ error: "تعذر جلب سجل الاشتراكات" });
    }
  });

  // تسجيل مبلغ جديد — يسري من الشهر القادم افتراضياً ولا يمس أي شهر سابق
  app.post("/api/contribution-rates", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const data = createSchema.parse(req.body);
      const now = new Date();
      const fallback = nextMonthOf(now.getFullYear(), now.getMonth() + 1);
      const effectiveYear = data.effectiveYear ?? fallback.year;
      const effectiveMonth = data.effectiveMonth ?? fallback.month;

      if (data.memberId) {
        const member = await storage.getMember(data.memberId);
        if (!member) return res.status(404).json({ error: "العضو غير موجود" });
      }

      const rate = await storage.createContributionRate({
        memberId: data.memberId ?? null,
        amount: data.amount,
        effectiveYear,
        effectiveMonth,
        note: data.note ?? null,
        createdBy: req.user?.id ?? null,
      });

      // العمود القديم يبقى مرآةً للمبلغ الحالي حتى لا تتغير الشاشات القائمة
      if (data.memberId) {
        await storage.updateMember(data.memberId, { expectedMonthly: data.amount });
      } else {
        await storage.updateFamilySettings({ defaultMonthlyContribution: data.amount });
      }

      const scope = data.memberId
        ? (await storage.getMember(data.memberId))?.name ?? "عضو"
        : "كل الأعضاء";
      await storage.createAuditLog({
        action: "contribution_rate_set",
        entityType: "contribution_rate",
        entityId: rate.id,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? "مشرف",
        description: `حُدّد اشتراك ${scope} بمبلغ ${Number(data.amount).toLocaleString()} ر.ع اعتباراً من ${effectiveMonth}/${effectiveYear}`,
        metadata: { amount: data.amount, effectiveYear, effectiveMonth, memberId: data.memberId ?? null },
      });

      res.status(201).json(rate);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json(zodErrorResponse(error));
      console.error("Create contribution rate error:", error);
      res.status(500).json({ error: "تعذر تسجيل الاشتراك" });
    }
  });

  app.delete("/api/contribution-rates/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const before = await storage.getContributionRates();
      const target = before.find((r) => r.id === id);
      if (!target) return res.status(404).json({ error: "السعر غير موجود" });

      await storage.deleteContributionRate(id);
      await storage.createAuditLog({
        action: "contribution_rate_deleted",
        entityType: "contribution_rate",
        entityId: id,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? "مشرف",
        description: `حُذف اشتراك ${Number(target.amount).toLocaleString()} ر.ع الساري من ${target.effectiveMonth}/${target.effectiveYear}`,
        metadata: { amount: target.amount, effectiveYear: target.effectiveYear, effectiveMonth: target.effectiveMonth },
      });

      res.json({ message: "حُذف السعر" });
    } catch (error) {
      console.error("Delete contribution rate error:", error);
      res.status(500).json({ error: "تعذر حذف السعر" });
    }
  });
}
