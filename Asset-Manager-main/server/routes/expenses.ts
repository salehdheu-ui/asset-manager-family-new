import type { Express } from "express";
import { storage } from "../storage";
import { insertExpenseSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { rebalanceYear, checkExpenseTransaction } from "../capital-engine";

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

      const check = await checkExpenseTransaction(Number(data.amount), data.category, currentYear);
      if (!check.allowed) {
        return res.status(403).json({ 
          error: check.reason,
          layer: check.layer,
          available: check.available,
          requested: Number(data.amount)
        });
      }

      const expense = await storage.createExpense(data);
      await rebalanceYear(currentYear);
      res.status(201).json(expense);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create expense" });
      }
    }
  });

  app.delete("/api/expenses/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const expenseId = req.params.id as string;
      const expense = (await storage.getExpenses()).find((item) => item.id === expenseId);
      if (!expense) {
        return res.status(404).json({ error: "Expense not found" });
      }
      await storage.deleteExpense(expenseId);
      const expenseYear = (expense.createdAt || new Date()).getFullYear();
      await rebalanceYear(expenseYear);
      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ error: "Failed to delete expense" });
    }
  });
}
