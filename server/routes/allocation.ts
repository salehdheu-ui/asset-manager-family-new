import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { rebalanceYear, lockYearAllocation, checkLoanTransaction, checkExpenseTransaction, resetYearAllocation, getAllocationForYear } from "../capital-engine";
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
      res.json(allocation);
    } catch (error) {
      badRequest(res, error, "Failed to lock allocation");
    }
  });

  app.post("/api/allocation/:year/reset", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const year = yearSchema.parse(req.params.year);
      if (!req.user) {
        return res.status(401).json({ error: "غير مصرح" });
      }
      const allocation = await resetYearAllocation(year, req.user.id);
      res.json(allocation);
    } catch (error) {
      badRequest(res, error, "Failed to reset allocation");
    }
  });

  app.post("/api/allocation/check-loan", isAuthenticated, async (req, res) => {
    try {
      const amount = amountSchema.parse(req.body?.amount);
      const check = await checkLoanTransaction(amount, new Date().getFullYear());
      res.json(check);
    } catch (error) {
      badRequest(res, error, "Failed to check loan");
    }
  });

  app.post("/api/allocation/check-expense", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { amount, category } = expenseCheckSchema.parse(req.body);
      const check = await checkExpenseTransaction(amount, category, new Date().getFullYear());
      res.json(check);
    } catch (error) {
      badRequest(res, error, "Failed to check expense");
    }
  });
}
