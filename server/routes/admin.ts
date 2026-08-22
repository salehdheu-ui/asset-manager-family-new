import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { insertFundAdjustmentSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { rebalanceYear } from "../capital-engine";
import { withTransaction } from "../db";
import { computeDashboardSummary } from "../services/dashboard";
import { zodErrorResponse } from "../validation";

// كان المسار يأخذ الاسمين من الجسم بلا نوع ولا طول: كائن أو رقم أو نصّ بلا
// نهاية يذهب إلى القاعدة كما هو
const profileSchema = z.object({
  firstName: z.string().trim().max(80).nullable().optional(),
  lastName: z.string().trim().max(80).nullable().optional(),
});

export function registerAdminRoutes(app: Express) {
  // ============= User Profile =============
  app.get("/api/user/profile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "غير مصرح" });
      }
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
      if (!userId) {
        return res.status(401).json({ message: "غير مصرح" });
      }
      const parsed = profileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(zodErrorResponse(parsed.error));
      const { firstName, lastName } = parsed.data;

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

  app.get("/api/audit-logs", isAuthenticated, async (_req, res) => {
    try {
      // الصفحة العامة تتوقع مصفوفة مباشرة — نعيد أحدث 100 سجل
      const result = await storage.getAuditLogs(1, 100);
      res.json(result.data);
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
      const currentYear = new Date().getFullYear();
      // القيد المباشر وأثره في السجل وإعادة التوازن وحدة واحدة. القيد المباشر
      // أخطر ما في النظام: يزيد رصيد الصندوق أو ينقصه بلا مساهمة ولا سلفة،
      // فبقاؤه بلا أثر في السجل يعني مالاً يتحرك ولا أحد يعرف من حرّكه.
      const adjustment = await withTransaction(async () => {
        const created = await storage.createFundAdjustment(data);

        await storage.createAuditLog({
          action: data.type === "deposit" ? "fund_deposit" : "fund_withdrawal",
          entityType: "fund_adjustment",
          entityId: created.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
          description:
            `${data.type === "deposit" ? "إيداع مباشر" : "سحب مباشر"} بمبلغ ` +
            `${Number(created.amount).toLocaleString()} ر.ع — ${created.description ?? "بلا وصف"}`,
          metadata: { type: created.type, amount: created.amount, description: created.description ?? null },
        });

        await rebalanceYear(currentYear);
        return created;
      });
      res.status(201).json(adjustment);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        const zodError = error as z.ZodError;
        res.status(400).json(zodErrorResponse(zodError));
      } else {
        res.status(500).json({ message: "تعذر تنفيذ العملية المباشرة" });
      }
    }
  });

  /**
   * عكس قيد مباشر.
   *
   * الحذف كان معطَّلاً حفاظاً على البيانات — وهو صواب: القيد المباشر يحرّك
   * رصيد الصندوق، ومحوه يمحو أثر حركة وقعت. لكن ذلك ترك الوصي بلا سبيل إلى
   * تصحيح مبلغ أخطأ فيه، والرقم الخطأ يبقى في الرصيد إلى الأبد.
   *
   * فالتصحيح قيدٌ مضاد كما في الدفاتر: يُنشأ قيد معاكس بالمبلغ نفسه يشير إلى
   * أصله، فيعتدل الرصيد ويبقى الاثنان ظاهرين — من أخطأ، ومتى صُحّح.
   */
  app.post("/api/fund-adjustments/:id/reverse", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const original = await storage.getFundAdjustment(req.params.id as string);
      if (!original) return res.status(404).json({ message: "القيد غير موجود" });
      if (original.reversalOfId) {
        return res.status(409).json({ message: "هذا القيد نفسه قيد عكسي — لا يُعكس العكس" });
      }

      const existing = await storage.getReversalOf(original.id);
      if (existing) return res.status(409).json({ message: "هذا القيد مُصحَّح من قبل" });

      const { reason } = z.object({ reason: z.string().trim().max(300).nullable().optional() }).parse(req.body ?? {});
      const opposite = original.type === "deposit" ? "withdrawal" : "deposit";
      const currentYear = new Date().getFullYear();

      const reversal = await withTransaction(async () => {
        const created = await storage.createFundAdjustment({
          type: opposite,
          amount: original.amount,
          description: `عكس ${original.type === "deposit" ? "إيداع" : "سحب"}: ${original.description ?? "بلا وصف"}${reason ? ` — ${reason}` : ""}`,
          memberId: original.memberId,
          createdBy: req.user?.id ?? null,
          reversalOfId: original.id,
        } as any);

        await storage.createAuditLog({
          action: "fund_adjustment_reversed",
          entityType: "fund_adjustment",
          entityId: original.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
          description:
            `عُكس ${original.type === "deposit" ? "إيداع مباشر" : "سحب مباشر"} بمبلغ ` +
            `${Number(original.amount).toLocaleString()} ر.ع${reason ? ` — ${reason}` : ""}`,
          metadata: { originalId: original.id, reversalId: created.id, amount: original.amount, reason: reason ?? null },
        });

        await rebalanceYear(currentYear);
        return created;
      });

      res.status(201).json(reversal);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json(zodErrorResponse(error));
      console.error("Reverse fund adjustment error:", error);
      res.status(500).json({ message: "تعذر عكس القيد" });
    }
  });

  app.delete("/api/fund-adjustments/:id", isAuthenticated, isAdmin, async (_req: Request, res: Response) => {
    return res.status(403).json({
      message: "القيد المباشر لا يُمحى — اعكِسه بقيد مضاد ليعتدل الرصيد ويبقى الأثر",
    });
  });

  // ============= System Reset (Admin Only) =============
  app.post("/api/system/reset", isAuthenticated, isAdmin, async (_req: Request, res: Response) => {
    return res.status(403).json({ message: "تم تعطيل إعادة تصفير النظام حفاظاً على البيانات" });
  });
}
