import type { Express } from "express";
import { storage } from "../storage";
import { insertContributionSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { rebalanceYear } from "../capital-engine";

export function registerContributionRoutes(app: Express) {
  app.get("/api/contributions", isAuthenticated, async (req: any, res) => {
    try {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const memberId = req.query.memberId as string | undefined;
      
      let contributions;
      if (year) {
        contributions = await storage.getContributionsByYear(year);
      } else if (memberId) {
        contributions = await storage.getContributionsByMember(memberId);
      } else {
        contributions = await storage.getContributions();
      }

      if (req.user?.role !== 'admin' && req.user?.memberId) {
        contributions = contributions.filter((c: any) => c.memberId === req.user.memberId);
      }

      res.json(contributions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contributions" });
    }
  });

  app.post("/api/contributions", isAuthenticated, async (req, res) => {
    try {
      const data = insertContributionSchema.parse(req.body);

      const existingContribution = await storage.getContributionByMemberYearMonth(data.memberId, data.year, data.month);
      if (existingContribution) {
        return res.status(409).json({
          message: "توجد مساهمة مسجلة لهذا العضو في نفس الشهر والسنة",
        });
      }

      const contribution = await storage.createContribution(data);
      res.status(201).json(contribution);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "بيانات المساهمة غير مكتملة أو غير صحيحة", error: error.errors });
      } else {
        res.status(500).json({ message: "تعذر إنشاء المساهمة حاليًا، حاول مرة أخرى" });
      }
    }
  });

  app.patch("/api/contributions/:id/approve", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const contribId = req.params.id as string;
      const contribution = await storage.approveContribution(contribId);
      if (!contribution) {
        return res.status(404).json({ message: "المساهمة غير موجودة" });
      }

      await storage.createAuditLog({
        action: "contribution_approved",
        entityType: "contribution",
        entityId: contribution.id,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
        description: `تم اعتماد مساهمة الشهر ${contribution.month}/${contribution.year}`,
        metadata: {
          memberId: contribution.memberId,
          amount: contribution.amount,
          year: contribution.year,
          month: contribution.month,
        },
      });

      await rebalanceYear(contribution.year);
      res.json(contribution);
    } catch (error) {
      res.status(500).json({ message: "تعذر اعتماد المساهمة حاليًا" });
    }
  });

  app.delete("/api/contributions/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const contribId = req.params.id as string;
      const deletedContribution = await storage.deleteContribution(contribId);
      if (!deletedContribution) {
        return res.status(404).json({ message: "المساهمة غير موجودة" });
      }

      await storage.createAuditLog({
        action: "contribution_deleted",
        entityType: "contribution",
        entityId: deletedContribution.id,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
        description: `تم حذف مساهمة الشهر ${deletedContribution.month}/${deletedContribution.year}`,
        metadata: {
          memberId: deletedContribution.memberId,
          amount: deletedContribution.amount,
          year: deletedContribution.year,
          month: deletedContribution.month,
        },
      });

      await rebalanceYear(deletedContribution.year);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "تعذر حذف المساهمة حاليًا" });
    }
  });
}
