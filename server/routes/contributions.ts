import type { Express } from "express";
import { storage } from "../storage";
import { insertContributionSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { blockMembersDuringEmergency } from "../emergency";
import { rebalanceYear } from "../capital-engine";
import { zodErrorResponse, RequestError } from "../validation";
import { withTransaction } from "../db";

export function registerContributionRoutes(app: Express) {
  app.get("/api/contributions", isAuthenticated, async (req, res) => {
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

      if (req.user?.role !== 'admin') {
        const ownMemberId = req.user?.memberId;
        contributions = ownMemberId
          ? contributions.filter((c: any) => c.memberId === ownMemberId)
          : [];
      }

      res.json(contributions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contributions" });
    }
  });

  app.post("/api/contributions", isAuthenticated, blockMembersDuringEmergency, async (req, res) => {
    try {
      const isAdminUser = req.user?.role === "admin";
      const data = insertContributionSchema.parse({
        ...req.body,
        // الاعتماد المباشر عند الإنشاء حصري للمدير — غير المدير تُسجل مساهمته معلقة دائماً
        status: isAdminUser ? req.body?.status : "pending_approval",
      });

      if (!isAdminUser && data.memberId !== req.user?.memberId) {
        return res.status(403).json({ message: "لا يمكنك تسجيل مساهمة لعضو آخر" });
      }

      const existingContribution = await storage.getContributionByMemberYearMonth(data.memberId, data.year, data.month);
      if (existingContribution) {
        return res.status(409).json({
          message: "توجد مساهمة مسجلة لهذا العضو في نفس الشهر والسنة",
        });
      }

      const contribution = await withTransaction(async () => {
        const created = await storage.createContribution(data);
        if (created.status === "approved") {
          await rebalanceYear(created.year);
        }

        // المساهمة التي ينشئها الوصي معتمدةً تدخل الصندوق فوراً بلا خطوة اعتماد
        // تُوثَّق — فالتوثيق هنا لا عند الاعتماد وحده
        const member = await storage.getMember(created.memberId);
        await storage.createAuditLog({
          action: "contribution_created",
          entityType: "contribution",
          entityId: created.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? req.user?.firstName ?? "عضو",
          description:
            `تسجيل مساهمة ${member?.name ?? "عضو غير معروف"} لشهر ${created.month}/${created.year} ` +
            `بمبلغ ${Number(created.amount).toLocaleString()} ر.ع (${created.status === "approved" ? "معتمدة مباشرة" : "بانتظار الاعتماد"})`,
          metadata: {
            memberId: created.memberId,
            amount: created.amount,
            year: created.year,
            month: created.month,
            status: created.status,
          },
        });

        return created;
      });

      res.status(201).json(contribution);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json(zodErrorResponse(error));
      } else {
        res.status(500).json({ message: "تعذر إنشاء المساهمة حاليًا، حاول مرة أخرى" });
      }
    }
  });

  app.patch("/api/contributions/:id/approve", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contribId = req.params.id as string;

      // الاعتماد وسجل التدقيق وإعادة التوازن وحدة واحدة
      const contribution = await withTransaction(async () => {
        const approved = await storage.approveContribution(contribId);
        if (!approved) {
          throw new RequestError(404, "المساهمة غير موجودة");
        }

        const member = await storage.getMember(approved.memberId);
        const memberName = member?.name ?? "عضو غير معروف";

        await storage.createAuditLog({
          action: "contribution_approved",
          entityType: "contribution",
          entityId: approved.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
          description: `تم اعتماد مساهمة ${memberName} للشهر ${approved.month}/${approved.year}`,
          metadata: {
            memberId: approved.memberId,
            memberName,
            amount: approved.amount,
            year: approved.year,
            month: approved.month,
          },
        });

        await rebalanceYear(approved.year);
        return approved;
      });

      res.json(contribution);
    } catch (error) {
      if (error instanceof RequestError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("Approve contribution error:", error);
      res.status(500).json({ message: "تعذر اعتماد المساهمة حاليًا" });
    }
  });

  app.delete("/api/contributions/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contribId = req.params.id as string;

      // الحذف وسجل التدقيق وإعادة التوازن وحدة واحدة — لا تُحذف مساهمة بلا أثر في السجل
      await withTransaction(async () => {
        const deletedContribution = await storage.deleteContribution(contribId);
        if (!deletedContribution) {
          throw new RequestError(404, "المساهمة غير موجودة");
        }

        const deletedMember = await storage.getMember(deletedContribution.memberId);
        const deletedMemberName = deletedMember?.name ?? "عضو غير معروف";

        await storage.createAuditLog({
          action: "contribution_deleted",
          entityType: "contribution",
          entityId: deletedContribution.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
          description: `تم حذف مساهمة ${deletedMemberName} للشهر ${deletedContribution.month}/${deletedContribution.year}`,
          metadata: {
            memberId: deletedContribution.memberId,
            memberName: deletedMemberName,
            amount: deletedContribution.amount,
            year: deletedContribution.year,
            month: deletedContribution.month,
          },
        });

        await rebalanceYear(deletedContribution.year);
      });

      res.status(204).send();
    } catch (error) {
      if (error instanceof RequestError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("Delete contribution error:", error);
      res.status(500).json({ message: "تعذر حذف المساهمة حاليًا" });
    }
  });
}
