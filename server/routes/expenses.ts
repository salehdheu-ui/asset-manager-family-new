import type { Express } from "express";
import { storage } from "../storage";
import { insertExpenseSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { rebalanceYear } from "../capital-engine";
import { guardExpense, type LayerOverdraft } from "../services/layer-guard";
import { zodErrorResponse } from "../validation";
import { withTransaction } from "../db";
import { RequestError } from "../validation";

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

  /**
   * إلغاء مصروف.
   *
   * الحذف كان معطَّلاً حفاظاً على البيانات، فلم يبقَ للوصي سبيل إلى تصحيح
   * مبلغ أخطأ فيه أو مصروف سجّله مرتين — والرقم الخطأ يبقى ينقص الصندوق.
   *
   * والتصحيح هنا كما في الدفاتر: لا يُمحى القيد، يُلغى. الصفّ باقٍ ويُعرض
   * معلَّماً بسببه ومن ألغاه، ولا يُحسب في مال الصندوق ولا في طبقاته.
   */
  app.post("/api/expenses/:id/void", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { reason } = z.object({ reason: z.string().trim().max(300).nullable().optional() }).parse(req.body ?? {});
      const expense = await storage.getExpense(req.params.id as string);
      if (!expense) return res.status(404).json({ error: "المصروف غير موجود" });
      if (expense.voidedAt) return res.status(409).json({ error: "هذا المصروف ملغى بالفعل" });

      const currentYear = new Date().getFullYear();

      const voided = await withTransaction(async () => {
        const row = await storage.voidExpense(expense.id, req.user?.id ?? null, reason ?? null);
        if (!row) throw new RequestError(409, "هذا المصروف ملغى بالفعل");

        await storage.createAuditLog({
          action: "expense_voided",
          entityType: "expense",
          entityId: expense.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
          description:
            `أُلغي مصروف «${expense.title}» بمبلغ ${Number(expense.amount).toLocaleString()} ر.ع ` +
            `وأُعيد المبلغ إلى الصندوق${reason ? ` — ${reason}` : ""}`,
          metadata: { amount: expense.amount, category: expense.category, title: expense.title, reason: reason ?? null },
        });

        await rebalanceYear(currentYear);
        return row;
      });

      res.json(voided);
    } catch (error) {
      if (error instanceof RequestError) return res.status(error.status).json({ error: error.message });
      if (error instanceof z.ZodError) return res.status(400).json(zodErrorResponse(error));
      console.error("Void expense error:", error);
      res.status(500).json({ error: "تعذر إلغاء المصروف" });
    }
  });

  app.delete("/api/expenses/:id", isAuthenticated, isAdmin, async (_req, res) => {
    return res.status(403).json({
      error: "المصروف لا يُمحى — ألغِه بدل حذفه ليبقى أثره في السجل ويعود مبلغه إلى الصندوق",
    });
  });
}
