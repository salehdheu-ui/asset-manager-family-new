import type { Express } from "express";
import { storage } from "../storage";
import { insertExpenseSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { rebalanceYear } from "../capital-engine";
import { guardExpense, type LayerOverdraft } from "../services/layer-guard";
import { zodErrorResponse } from "../validation";
import { withTransaction } from "../db";

export function registerExpenseRoutes(app: Express) {
  app.get("/api/expenses", isAuthenticated, async (req, res) => {
    try {
      const expenses = await storage.getExpenses();
      res.json(expenses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expenses" });
    }
  });

  app.post("/api/expenses", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const data = insertExpenseSchema.parse(req.body);
      const currentYear = new Date().getFullYear();

      // المصروف وأثره في السجل وإعادة التوازن وحدة واحدة — لا يخرج من الصندوق
      // ريال بلا سطر في سجل التدقيق يقول متى خرج وبأمر من
      let overdraft: LayerOverdraft | null = null;

      const expense = await withTransaction(async () => {
        const created = await storage.createExpense(data);

        overdraft = await guardExpense(Number(created.amount), created.category, currentYear, {
          entityType: "expense",
          entityId: created.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
          subject: `مصروف «${created.title}»`,
        });

        await storage.createAuditLog({
          action: "expense_created",
          entityType: "expense",
          entityId: created.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
          description: `تم تسجيل مصروف «${created.title}» بمبلغ ${Number(created.amount).toLocaleString()} ر.ع (${created.category})`,
          metadata: {
            amount: created.amount,
            category: created.category,
            title: created.title,
            description: created.description ?? null,
          },
        });

        await rebalanceYear(currentYear);
        return created;
      });

      res.status(201).json({ ...expense, overdraft });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json(zodErrorResponse(error));
      } else {
        res.status(500).json({ error: "Failed to create expense" });
      }
    }
  });

  app.delete("/api/expenses/:id", isAuthenticated, isAdmin, async (_req, res) => {
    return res.status(403).json({ error: "تم تعطيل الحذف النهائي حفاظاً على البيانات" });
  });
}
