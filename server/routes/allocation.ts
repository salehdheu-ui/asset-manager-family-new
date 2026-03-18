import type { Express } from "express";
import { isAuthenticated, isAdmin } from "../auth";
import { rebalanceYear, lockYearAllocation, checkLoanTransaction, checkExpenseTransaction, resetYearAllocation, getAllocationForYear } from "../capital-engine";

export function registerAllocationRoutes(app: Express) {
  app.get("/api/allocation/:year", isAuthenticated, async (req, res) => {
    try {
      const year = Number(req.params.year);
      const allocation = await getAllocationForYear(year);
      res.json(allocation);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch allocation" });
    }
  });

  app.post("/api/allocation/:year/lock", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const year = Number(req.params.year);
      const allocation = await lockYearAllocation(year);
      res.json(allocation);
    } catch (error) {
      res.status(500).json({ error: "Failed to lock allocation" });
    }
  });

  app.post("/api/allocation/:year/reset", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const year = Number(req.params.year);
      const allocation = await resetYearAllocation(year, req.user.id);
      res.json(allocation);
    } catch (error) {
      res.status(500).json({ error: "Failed to reset allocation" });
    }
  });

  app.post("/api/allocation/check-loan", isAuthenticated, async (req, res) => {
    try {
      const { amount } = req.body;
      const currentYear = new Date().getFullYear();
      const check = await checkLoanTransaction(Number(amount), currentYear);
      res.json(check);
    } catch (error) {
      res.status(500).json({ error: "Failed to check loan" });
    }
  });

  app.post("/api/allocation/check-expense", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { amount, category } = req.body;
      const currentYear = new Date().getFullYear();
      const check = await checkExpenseTransaction(Number(amount), category, currentYear);
      res.json(check);
    } catch (error) {
      res.status(500).json({ error: "Failed to check expense" });
    }
  });
}
