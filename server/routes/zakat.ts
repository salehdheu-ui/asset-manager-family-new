import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated, isAdmin } from "../auth";
import { computeDashboardSummary } from "../services/dashboard";
import { computeZakat, isHawlComplete, daysUntilHawl, HAWL_DAYS } from "@shared/finance";
import { zodErrorResponse } from "../validation";
import { rebalanceYear } from "../capital-engine";
import { withTransaction } from "../db";

const startCycleSchema = z.object({
  cycleStart: z.coerce.date().optional(),
  note: z.string().max(500).nullable().optional(),
});

const paySchema = z.object({
  amount: z.string().refine((v) => Number(v) > 0, "المبلغ يجب أن يكون أكبر من صفر").optional(),
  title: z.string().min(1).max(200).optional(),
  note: z.string().max(500).nullable().optional(),
});

export function registerZakatRoutes(app: Express) {
  // حالة الزكاة: الدورة الجارية، اكتمال الحول، والمبلغ الواجب على صافي الأصول الحالي
  app.get("/api/zakat", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const [cycles, open, settings, summary] = await Promise.all([
        storage.getZakatCycles(),
        storage.getOpenZakatCycle(),
        storage.getFamilySettings(),
        computeDashboardSummary(),
      ]);

      const nisab = Number(settings?.zakatNisab ?? 0);
      const calc = computeZakat(summary.netCapital, nisab);
      const hawlComplete = open ? isHawlComplete(open.cycleStart) : false;

      res.json({
        nisab,
        hawlDays: HAWL_DAYS,
        netAssets: summary.netCapital,
        currentCycle: open
          ? {
              ...open,
              hawlComplete,
              daysRemaining: daysUntilHawl(open.cycleStart),
            }
          : null,
        // ما سيجب إخراجه لو اكتمل الحول اليوم
        estimate: calc,
        history: cycles,
      });
    } catch (error) {
      console.error("Zakat status error:", error);
      res.status(500).json({ error: "تعذر حساب حالة الزكاة" });
    }
  });

  // بدء دورة حول جديدة
  app.post("/api/zakat/cycles", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const data = startCycleSchema.parse(req.body ?? {});
      const open = await storage.getOpenZakatCycle();
      if (open) {
        return res.status(400).json({ error: "توجد دورة زكاة جارية — أخرِج زكاتها أولاً قبل بدء دورة جديدة" });
      }

      const cycle = await storage.createZakatCycle({
        cycleStart: data.cycleStart ?? new Date(),
        note: data.note ?? null,
      });

      await storage.createAuditLog({
        action: "zakat_cycle_started",
        entityType: "zakat",
        entityId: cycle.id,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? "مشرف",
        description: `بدأت دورة حول الزكاة من ${new Date(cycle.cycleStart).toLocaleDateString("ar-OM")}`,
        metadata: { cycleStart: cycle.cycleStart },
      });

      res.status(201).json(cycle);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json(zodErrorResponse(error));
      console.error("Start zakat cycle error:", error);
      res.status(500).json({ error: "تعذر بدء دورة الزكاة" });
    }
  });

  // إخراج الزكاة: يُثبّت المبلغ على الدورة ويُنشئ مصروفاً بتصنيف zakat
  app.post("/api/zakat/cycles/:id/pay", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const data = paySchema.parse(req.body ?? {});
      const cycle = await storage.getZakatCycle(req.params.id as string);
      if (!cycle) return res.status(404).json({ error: "دورة الزكاة غير موجودة" });
      if (cycle.status === "paid") return res.status(400).json({ error: "زكاة هذه الدورة أُخرجت من قبل" });

      const [settings, summary] = await Promise.all([
        storage.getFamilySettings(),
        computeDashboardSummary(),
      ]);
      const nisab = Number(settings?.zakatNisab ?? 0);
      const calc = computeZakat(summary.netCapital, nisab);

      // الوصي قد يخرج مبلغاً مختلفاً (تقريب أو زيادة تطوعاً) — المحسوب هو الافتراضي
      const amount = data.amount ? Number(data.amount) : calc.amount;
      if (amount <= 0) {
        return res.status(400).json({ error: "لا مبلغ زكاة لإخراجه — تحقق من النصاب وصافي الأصول" });
      }

      // المصروف وإقفال الدورة وإعادة التوازن وسجل التدقيق وحدة واحدة —
      // دورة معلَّمة "مدفوعة" بلا مصروف مقابل تعني زكاة تظهر مُخرَجة ولم تُخرَج
      const { updated, expense } = await withTransaction(async () => {
        const createdExpense = await storage.createExpense({
          title: data.title?.trim() || "زكاة مال الصندوق",
          amount: amount.toFixed(3),
          category: "zakat",
          description: data.note ?? `عن دورة حول بدأت ${new Date(cycle.cycleStart).toLocaleDateString("ar-OM")}`,
        });

        const updatedCycle = await storage.updateZakatCycle(cycle.id, {
          status: "paid",
          dueAt: cycle.dueAt ?? new Date(),
          netAssetsAtDue: calc.netAssets.toFixed(3),
          nisabUsed: calc.nisab.toFixed(3),
          amountDue: amount.toFixed(3),
          expenseId: createdExpense.id,
          paidAt: new Date(),
          paidBy: req.user?.id ?? null,
        });

        await rebalanceYear(new Date().getFullYear());

        await storage.createAuditLog({
          action: "zakat_paid",
          entityType: "zakat",
          entityId: cycle.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? "مشرف",
          description: `أُخرجت زكاة الصندوق بمبلغ ${amount.toLocaleString()} ر.ع`,
          metadata: { amount, netAssets: calc.netAssets, nisab: calc.nisab, expenseId: createdExpense.id },
        });

        return { updated: updatedCycle, expense: createdExpense };
      });

      res.json({ cycle: updated, expense });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json(zodErrorResponse(error));
      console.error("Pay zakat error:", error);
      res.status(500).json({ error: "تعذر تسجيل إخراج الزكاة" });
    }
  });
}
