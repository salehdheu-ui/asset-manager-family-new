import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { storage } from "../storage";
import { lockYearAllocation, getAllocationForYear } from "../capital-engine";
import { previewExpense, previewInvestment, previewLoan } from "../services/layer-guard";
import { zodErrorResponse } from "../validation";

// كان هذا الملف وحده بلا تحقق من المدخلات: `Number(req.params.year)` تمرر NaN
// إلى محرك رأس المال فيرتد خطأ 500 غامضاً بدل رسالة تقول ما الخطأ.
const yearSchema = z.coerce.number().int().min(2020).max(2100);
const amountSchema = z.coerce.number().finite().positive("المبلغ يجب أن يكون أكبر من صفر");
const expenseCheckSchema = z.object({
  amount: amountSchema,
  category: z.enum(["zakat", "charity", "general", "emergency"]),
});

function badRequest(res: any, error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json(zodErrorResponse(error));
  }
  return res.status(500).json({ error: fallback });
}

export function registerAllocationRoutes(app: Express) {
  app.get("/api/allocation/:year", isAuthenticated, async (req, res) => {
    try {
      const year = yearSchema.parse(req.params.year);
      const allocation = await getAllocationForYear(year);
      res.json(allocation);
    } catch (error) {
      badRequest(res, error, "Failed to fetch allocation");
    }
  });

  app.post("/api/allocation/:year/lock", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const year = yearSchema.parse(req.params.year);
      const allocation = await lockYearAllocation(year);

      // القفل يثبّت صافي الأصول الذي تُبنى عليه الطبقات كل السنة — قرار يُوثَّق
      await storage.createAuditLog({
        action: "allocation_locked",
        entityType: "capital_allocation",
        entityId: String(year),
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
        description: `قُفل تخصيص رأس المال لسنة ${year} على صافي أصول ${allocation.netAssets.toLocaleString()} ر.ع`,
        metadata: {
          year,
          netAssets: allocation.netAssets,
          protected: allocation.protected.amount,
          emergency: allocation.emergency.amount,
          flexible: allocation.flexible.amount,
          growth: allocation.growth.amount,
        },
      });

      res.json(allocation);
    } catch (error) {
      badRequest(res, error, "Failed to lock allocation");
    }
  });

  // الفحص المسبق: تسأله الواجهة قبل التنفيذ لتعرض نافذة التأكيد. يمرّ على
  // الحساب نفسه الذي يكتب التجاوز في السجل، فلا تقول النافذة شيئاً ويقول
  // السجل غيره.
  app.post("/api/allocation/check-loan", isAuthenticated, async (req, res) => {
    try {
      const amount = amountSchema.parse(req.body?.amount);
      const overdraft = await previewLoan(amount, new Date().getFullYear());
      res.json({ allowed: overdraft === null, overdraft });
    } catch (error) {
      badRequest(res, error, "Failed to check loan");
    }
  });

  app.post("/api/allocation/check-expense", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { amount, category } = expenseCheckSchema.parse(req.body);
      const overdraft = await previewExpense(amount, category, new Date().getFullYear());
      res.json({ allowed: overdraft === null, overdraft });
    } catch (error) {
      badRequest(res, error, "Failed to check expense");
    }
  });

  app.post("/api/allocation/check-investment", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const amount = amountSchema.parse(req.body?.amount);
      const overdraft = await previewInvestment(amount, new Date().getFullYear());
      res.json({ allowed: overdraft === null, overdraft });
    } catch (error) {
      badRequest(res, error, "Failed to check investment");
    }
  });
}
