import type { Express } from "express";
import { storage } from "../storage";
import { insertMemberSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { zodErrorResponse } from "../validation";

export function registerMemberRoutes(app: Express) {
  app.get("/api/members", isAuthenticated, async (req: any, res) => {
    try {
      const members = await storage.getMembers();
      if (req.user?.role !== 'admin') {
        const ownMemberId = req.user?.memberId;
        return res.json(ownMemberId ? members.filter(m => m.id === ownMemberId) : []);
      }
      res.json(members);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  app.post("/api/members", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const data = insertMemberSchema.parse(req.body);
      const member = await storage.createMember(data);
      res.status(201).json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json(zodErrorResponse(error));
      } else {
        res.status(500).json({ error: "Failed to create member" });
      }
    }
  });

  app.post("/api/members/:id/assign-custodian", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const memberId = req.params.id as string;
      const allMembers = await storage.getMembers();
      const target = allMembers.find(m => m.id === memberId);

      if (!target) {
        return res.status(404).json({ message: "العضو غير موجود" });
      }
      if (target.role === "guardian") {
        return res.status(400).json({ message: "لا يمكن تعيين الوصي أميناً للصندوق" });
      }
      if (target.role === "custodian") {
        return res.status(400).json({ message: "هذا العضو هو الأمين الحالي بالفعل" });
      }

      const previousCustodian = allMembers.find(m => m.role === "custodian");
      if (previousCustodian) {
        await storage.updateMember(previousCustodian.id, { role: "member" });
      }
      const updated = await storage.updateMember(memberId, { role: "custodian" });

      await storage.createAuditLog({
        action: "custodian_assigned",
        entityType: "member",
        entityId: memberId,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
        description: previousCustodian
          ? `تم تعيين ${target.name} أميناً للصندوق بدلاً من ${previousCustodian.name}`
          : `تم تعيين ${target.name} أميناً للصندوق`,
        metadata: {
          newCustodianId: memberId,
          newCustodianName: target.name,
          previousCustodianId: previousCustodian?.id ?? null,
          previousCustodianName: previousCustodian?.name ?? null,
        },
      });

      res.json(updated);
    } catch (error) {
      console.error("Assign custodian error:", error);
      res.status(500).json({ message: "تعذر تعيين الأمين حاليًا" });
    }
  });

  app.patch("/api/members/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const memberId = req.params.id as string;
      const member = await storage.updateMember(memberId, req.body);
      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }
      res.json(member);
    } catch (error) {
      res.status(500).json({ error: "Failed to update member" });
    }
  });

  app.delete("/api/members/:id", isAuthenticated, isAdmin, async (_req, res) => {
    return res.status(403).json({ error: "تم تعطيل الحذف النهائي حفاظاً على البيانات" });
  });
}
