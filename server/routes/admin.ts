import type { Express, Request, Response } from "express";
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
  app.get("/api/user/profile", isAuthenticated, async (req: Request, res: Response) => {
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
      
      res.json({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        memberId: user.memberId,
        profileImageUrl: user.profileImageUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        member: memberData,
      });
    } catch (error) {
      res.status(500).json({ message: "تعذر جلب الملف الشخصي" });
    }
  });

  app.patch("/api/user/profile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const { firstName, lastName } = req.body;
      const [updated] = await db
        .update(users)
        .set({ firstName, lastName, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      res.json({
        id: updated.id,
        username: updated.username,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        role: updated.role,
        memberId: updated.memberId,
        profileImageUrl: updated.profileImageUrl,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
    } catch (error) {
      res.status(500).json({ message: "تعذر تحديث الملف الشخصي" });
    }
  });

  // ============= Dashboard Summary =============
  app.get("/api/dashboard/summary", isAuthenticated, async (_req: Request, res: Response) => {
    try {
      const summary = await computeDashboardSummary();
      res.json(summary);
    } catch (error) {
      console.error("Dashboard summary error:", error);
      res.status(500).json({ message: "تعذر تحميل ملخص لوحة التحكم" });
    }
  });

  app.get("/api/admin/audit-logs", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const result = await storage.getAuditLogs(page, limit);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "تعذر تحميل سجل التدقيق" });
    }
  });

  // ============= Fund Adjustments (Admin) =============
  app.get("/api/fund-adjustments", isAuthenticated, isAdmin, async (_req: Request, res: Response) => {
    try {
      const adjustments = await storage.getFundAdjustments();
      res.json(adjustments);
    } catch (error) {
      res.status(500).json({ message: "تعذر تحميل العمليات المباشرة" });
    }
  });

  app.post("/api/fund-adjustments", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
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
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        const zodError = error as z.ZodError;
        res.status(400).json({ message: "بيانات العملية غير صحيحة", error: zodError.errors });
      } else {
        res.status(500).json({ message: "تعذر تنفيذ العملية المباشرة" });
      }
    }
  });

  app.delete("/api/fund-adjustments/:id", isAuthenticated, isAdmin, async (_req: Request, res: Response) => {
    return res.status(403).json({ message: "تم تعطيل الحذف النهائي حفاظاً على البيانات" });
  });

  // ============= System Reset (Admin Only) =============
  app.post("/api/system/reset", isAuthenticated, isAdmin, async (_req: Request, res: Response) => {
    return res.status(403).json({ message: "تم تعطيل إعادة تصفير النظام حفاظاً على البيانات" });
  });
}
