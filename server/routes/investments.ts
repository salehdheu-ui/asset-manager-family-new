import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated, isAdmin } from "../auth";
import { insertInvestmentSchema, insertInvestmentValuationSchema } from "@shared/schema";
import { computeInvestmentReturn } from "@shared/finance";
import { zodErrorResponse } from "../validation";
import { rebalanceYear } from "../capital-engine";
import { guardInvestment, type LayerOverdraft } from "../services/layer-guard";
import { withTransaction } from "../db";

const exitSchema = z.object({
  exitValue: z.string().refine((v) => Number(v) >= 0, "قيمة الخروج لا يمكن أن تكون سالبة"),
  note: z.string().max(500).nullable().optional(),
});

// آخر تقييم للاستثمار، وإلا مبلغه الأصلي
function latestValue(investment: { amount: string; status: string; exitValue: string | null }, valuations: { value: string }[]) {
  if (investment.status === "exited" && investment.exitValue != null) return Number(investment.exitValue);
  if (valuations.length > 0) return Number(valuations[valuations.length - 1].value);
  return Number(investment.amount);
}

export function registerInvestmentRoutes(app: Express) {
  // سجل الاستثمارات مع عوائدها وسقف طبقة النمو
  app.get("/api/investments", isAuthenticated, async (_req, res) => {
    try {
      const [list, allValuations, allocation] = await Promise.all([
        storage.getInvestments(),
        storage.getInvestmentValuations(),
        rebalanceYear(new Date().getFullYear()),
      ]);

      const rows = list.map((inv) => {
        const valuations = allValuations.filter((v) => v.investmentId === inv.id);
        const currentValue = latestValue(inv, valuations);
        return {
          ...inv,
          currentValue,
          valuations,
          ...computeInvestmentReturn({ amount: Number(inv.amount), currentValue }),
        };
      });

      const active = rows.filter((r) => r.status === "active");
      res.json({
        investments: rows,
        totals: {
          invested: Number(active.reduce((s, r) => s + Number(r.amount), 0).toFixed(3)),
          currentValue: Number(active.reduce((s, r) => s + r.currentValue, 0).toFixed(3)),
          realizedGain: Number(rows.filter((r) => r.status === "exited").reduce((s, r) => s + r.gain, 0).toFixed(3)),
        },
        growthLayer: allocation.growth,
      });
    } catch (error) {
      console.error("List investments error:", error);
      res.status(500).json({ error: "تعذر جلب الاستثمارات" });
    }
  });

  // استثمار جديد — يحذّر عند تجاوز طبقة النمو ويوثّق التجاوز، ولا يمنع
  app.post("/api/investments", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const data = insertInvestmentSchema.parse(req.body);
      const year = new Date().getFullYear();
      let overdraft: LayerOverdraft | null = null;

      // الاستثمار وإعادة التوازن وسجل التدقيق وحدة واحدة
      const investment = await withTransaction(async () => {
        const created = await storage.createInvestment({ ...data, createdBy: req.user?.id ?? null });

        overdraft = await guardInvestment(Number(created.amount), year, {
          entityType: "investment",
          entityId: created.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? "مشرف",
          subject: `استثمار «${created.title}»`,
        });

        await rebalanceYear(year);

        await storage.createAuditLog({
          action: "investment_created",
          entityType: "investment",
          entityId: created.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? "مشرف",
          description: `استثمار جديد: ${created.title} بمبلغ ${Number(created.amount).toLocaleString()} ر.ع`,
          metadata: { amount: created.amount, type: created.type },
        });

        return created;
      });

      res.status(201).json({ ...investment, overdraft });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json(zodErrorResponse(error));
      console.error("Create investment error:", error);
      res.status(500).json({ error: "تعذر تسجيل الاستثمار" });
    }
  });

  // تقييم دوري
  app.post("/api/investments/:id/valuations", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const investment = await storage.getInvestment(req.params.id as string);
      if (!investment) return res.status(404).json({ error: "الاستثمار غير موجود" });

      const data = insertInvestmentValuationSchema.parse({
        ...req.body,
        investmentId: investment.id,
        createdBy: req.user?.id ?? null,
      });
      // التقييم وسجل التدقيق وحدة واحدة
      const valuation = await withTransaction(async () => {
        const created = await storage.createInvestmentValuation(data);

        await storage.createAuditLog({
          action: "investment_valued",
          entityType: "investment",
          entityId: investment.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? "مشرف",
          description: `تقييم جديد لاستثمار ${investment.title}: ${Number(created.value).toLocaleString()} ر.ع`,
          metadata: { value: created.value, valuedAt: created.valuedAt },
        });

        return created;
      });

      res.status(201).json(valuation);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json(zodErrorResponse(error));
      console.error("Create valuation error:", error);
      res.status(500).json({ error: "تعذر تسجيل التقييم" });
    }
  });

  // تصفية الاستثمار — الربح يُسجَّل إيداعاً في الصندوق والخسارة سحباً
  app.post("/api/investments/:id/exit", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const data = exitSchema.parse(req.body);
      const investment = await storage.getInvestment(req.params.id as string);
      if (!investment) return res.status(404).json({ error: "الاستثمار غير موجود" });
      if (investment.status === "exited") return res.status(400).json({ error: "هذا الاستثمار مُصفّى بالفعل" });

      const exitValue = Number(data.exitValue);
      const { gain, returnPercent } = computeInvestmentReturn({ amount: Number(investment.amount), currentValue: exitValue });

      // التصفية وقيد الربح/الخسارة وإعادة التوازن وسجل التدقيق وحدة واحدة —
      // أخطر ما يمكن أن يقع هنا: استثمار يُعلَّم مُصفّى بلا قيد لعائده في الصندوق
      const updated = await withTransaction(async () => {
        const exited = await storage.updateInvestment(investment.id, {
          status: "exited",
          exitedAt: new Date(),
          exitValue: exitValue.toFixed(3),
          note: data.note ?? investment.note,
        });

        if (gain !== 0) {
          await storage.createFundAdjustment({
            type: gain > 0 ? "deposit" : "withdrawal",
            amount: Math.abs(gain).toFixed(3),
            description: `${gain > 0 ? "عائد" : "خسارة"} استثمار: ${investment.title}`,
            createdBy: req.user?.id ?? null,
          });
        }

        await rebalanceYear(new Date().getFullYear());

        await storage.createAuditLog({
          action: "investment_exited",
          entityType: "investment",
          entityId: investment.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? "مشرف",
          description: `تصفية استثمار ${investment.title} بقيمة ${exitValue.toLocaleString()} ر.ع (${gain >= 0 ? "ربح" : "خسارة"} ${Math.abs(gain).toLocaleString()} ر.ع)`,
          metadata: { exitValue, gain, returnPercent },
        });

        return exited;
      });

      res.json({ investment: updated, gain, returnPercent });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json(zodErrorResponse(error));
      console.error("Exit investment error:", error);
      res.status(500).json({ error: "تعذر تصفية الاستثمار" });
    }
  });

  app.delete("/api/investments/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const investment = await storage.getInvestment(req.params.id as string);
      if (!investment) return res.status(404).json({ error: "الاستثمار غير موجود" });

      await withTransaction(async () => {
        await storage.deleteInvestment(investment.id);
        await rebalanceYear(new Date().getFullYear());

        await storage.createAuditLog({
          action: "investment_deleted",
          entityType: "investment",
          entityId: investment.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? "مشرف",
          description: `حُذف استثمار ${investment.title} (${Number(investment.amount).toLocaleString()} ر.ع)`,
          metadata: { amount: investment.amount, type: investment.type },
        });
      });

      res.json({ message: "تم حذف الاستثمار" });
    } catch (error) {
      console.error("Delete investment error:", error);
      res.status(500).json({ error: "تعذر حذف الاستثمار" });
    }
  });
}
