import type { Express } from "express";
import { storage } from "../storage";
import { insertFundAdjustmentSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { rebalanceYear } from "../capital-engine";
import { computeDashboardSummary } from "../services/dashboard";

export function registerAdminRoutes(app: Express) {
  // ============= User Profile =============
  app.get("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return res.status(404).json({ message: "المستخدم غير موجود" });
      }
      
      // If linked to a member, get member data too
      let memberData = null;
      if (user.memberId) {
        memberData = await storage.getMember(user.memberId);
      }
      
      res.json({ ...user, member: memberData });
    } catch (error) {
      res.status(500).json({ message: "تعذر جلب الملف الشخصي" });
    }
  });

  app.patch("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { firstName, lastName } = req.body;
      const [updated] = await db
        .update(users)
        .set({ firstName, lastName, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "تعذر تحديث الملف الشخصي" });
    }
  });

  // ============= Dashboard Summary =============
  app.get("/api/dashboard/summary", isAuthenticated, async (req, res) => {
    try {
      const summary = await computeDashboardSummary();
      res.json(summary);
    } catch (error) {
      console.error("Dashboard summary error:", error);
      res.status(500).json({ message: "تعذر تحميل ملخص لوحة التحكم" });
    }
  });

  app.get("/api/admin/audit-logs", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const logs = await storage.getAuditLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "تعذر تحميل سجل التدقيق" });
    }
  });

  // ============= Fund Adjustments (Admin) =============
  app.get("/api/fund-adjustments", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const adjustments = await storage.getFundAdjustments();
      res.json(adjustments);
    } catch (error) {
      res.status(500).json({ message: "تعذر تحميل العمليات المباشرة" });
    }
  });

  app.post("/api/fund-adjustments", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const data = insertFundAdjustmentSchema.parse({
        ...req.body,
        createdBy: req.user?.id,
      });
      if (!['deposit', 'withdrawal'].includes(data.type)) {
        return res.status(400).json({ message: "نوع العملية غير صالح" });
      }
      const adjustment = await storage.createFundAdjustment(data);
      const currentYear = new Date().getFullYear();
      await rebalanceYear(currentYear);
      res.status(201).json(adjustment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "بيانات العملية غير صحيحة", error: error.errors });
      } else {
        res.status(500).json({ message: "تعذر تنفيذ العملية المباشرة" });
      }
    }
  });

  app.delete("/api/fund-adjustments/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const adjustmentId = req.params.id as string;
      await storage.deleteFundAdjustment(adjustmentId);
      const currentYear = new Date().getFullYear();
      await rebalanceYear(currentYear);
      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ message: "تعذر حذف العملية المباشرة" });
    }
  });

  // ============= System Reset (Admin Only) =============
  app.post("/api/system/reset", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      await storage.resetSystemData();
      return res.json({ message: "تم تصفير النظام بنجاح" });
    } catch (error) {
      return res.status(500).json({ message: "تعذر تصفير النظام" });
    }
  });
}
