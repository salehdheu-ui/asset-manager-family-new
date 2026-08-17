import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { findAmount, reconcileFund } from "../services/reconcile";

export function registerReconcileRoutes(app: Express) {
  /** تقرير التدقيق الكامل — للوصي وحده، فهو يكشف كل أرقام الصندوق */
  app.get("/api/audit/reconcile", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      res.json(await reconcileFund());
    } catch (error) {
      console.error("Reconcile error:", error);
      res.status(500).json({ error: "تعذّر إجراء التدقيق" });
    }
  });

  /** البحث عن مبلغ في كل جداول المال — لتعقّب فرق بعينه */
  app.get("/api/audit/find-amount", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const value = z.coerce.number().finite().parse(req.query.value);
      res.json(await findAmount(value));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "أدخل مبلغاً صحيحاً" });
      }
      console.error("Find amount error:", error);
      res.status(500).json({ error: "تعذّر البحث" });
    }
  });
}
