import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated, isAdmin } from "../auth";
import { insertProposalSchema } from "@shared/schema";
import { zodErrorResponse } from "../validation";

const voteSchema = z.object({ vote: z.enum(["approve", "reject"]) });

// نفس نصاب السلف: 3 موافقين أو كل المؤهلين إن كانوا أقل
async function tallyOf(proposalId: string) {
  const votes = await storage.getProposalVotes(proposalId);
  const approve = votes.filter((v) => v.vote === "approve").length;
  const reject = votes.filter((v) => v.vote === "reject").length;
  const eligible = await storage.countEligibleVoters(null);
  const required = Math.max(1, Math.min(3, eligible));
  return { approve, reject, eligible, required, passed: approve >= required && approve > reject };
}

export function registerProposalRoutes(app: Express) {
  // كل الاقتراحات مع نتائجها — العائلة كلها تراها
  app.get("/api/proposals", isAuthenticated, async (req, res) => {
    try {
      const list = await storage.getProposals();
      const rows = await Promise.all(list.map(async (p) => {
        const votes = await storage.getProposalVotes(p.id);
        const tally = await tallyOf(p.id);
        return {
          ...p,
          ...tally,
          myVote: votes.find((v) => v.userId === req.user?.id)?.vote ?? null,
          voters: votes.map((v) => ({ name: v.voterName, vote: v.vote })),
        };
      }));
      res.json(rows);
    } catch (error) {
      console.error("List proposals error:", error);
      res.status(500).json({ error: "تعذر جلب الاقتراحات" });
    }
  });

  // الوصي يطرح اقتراحاً على العائلة
  app.post("/api/proposals", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const data = insertProposalSchema.parse(req.body);
      const proposal = await storage.createProposal({
        ...data,
        createdBy: req.user?.id ?? null,
        createdByName: req.user?.username ?? "الوصي",
      });

      await storage.createAuditLog({
        action: "proposal_created",
        entityType: "proposal",
        entityId: proposal.id,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? "مشرف",
        description: `طُرح اقتراح على العائلة: ${proposal.title}`,
        metadata: { category: proposal.category, amount: proposal.amount },
      });

      res.status(201).json(proposal);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json(zodErrorResponse(error));
      console.error("Create proposal error:", error);
      res.status(500).json({ error: "تعذر طرح الاقتراح" });
    }
  });

  // كل عضو له صوت واحد، وله أن يغيّره ما دام الاقتراح مفتوحاً
  app.post("/api/proposals/:id/vote", isAuthenticated, async (req, res) => {
    try {
      const { vote } = voteSchema.parse(req.body);
      const proposal = await storage.getProposal(req.params.id as string);
      if (!proposal) return res.status(404).json({ error: "الاقتراح غير موجود" });
      if (proposal.status !== "open") return res.status(400).json({ error: "انتهى التصويت على هذا الاقتراح" });
      if (proposal.closesAt && new Date(proposal.closesAt).getTime() < Date.now()) {
        return res.status(400).json({ error: "انتهت مهلة التصويت على هذا الاقتراح" });
      }

      await storage.castProposalVote({
        proposalId: proposal.id,
        userId: req.user!.id,
        voterName: req.user?.username ?? "عضو",
        vote,
      });

      const tally = await tallyOf(proposal.id);

      // اكتمال النصاب يُغلق الاقتراح تلقائياً — لا انتظار لتدخل يدوي
      if (tally.passed) {
        await storage.updateProposal(proposal.id, { status: "approved", decidedAt: new Date() });
        await storage.createAuditLog({
          action: "proposal_approved",
          entityType: "proposal",
          entityId: proposal.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? "عضو",
          description: `وافقت العائلة على اقتراح: ${proposal.title} (${tally.approve} موافقاً من ${tally.required} مطلوبين)`,
          metadata: tally,
        });
      }

      res.json({ ...tally, myVote: vote, status: tally.passed ? "approved" : proposal.status });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json(zodErrorResponse(error));
      console.error("Vote proposal error:", error);
      res.status(500).json({ error: "تعذر تسجيل التصويت" });
    }
  });

  // الوصي يغلق الاقتراح برفض أو إلغاء
  app.post("/api/proposals/:id/close", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const status = req.body?.status === "cancelled" ? "cancelled" : "rejected";
      const proposal = await storage.getProposal(req.params.id as string);
      if (!proposal) return res.status(404).json({ error: "الاقتراح غير موجود" });
      if (proposal.status !== "open") return res.status(400).json({ error: "الاقتراح مغلق أصلاً" });

      const updated = await storage.updateProposal(proposal.id, { status, decidedAt: new Date() });

      await storage.createAuditLog({
        action: status === "cancelled" ? "proposal_cancelled" : "proposal_rejected",
        entityType: "proposal",
        entityId: proposal.id,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? "مشرف",
        description: `${status === "cancelled" ? "أُلغي" : "رُفض"} اقتراح: ${proposal.title}`,
        metadata: { status },
      });

      res.json(updated);
    } catch (error) {
      console.error("Close proposal error:", error);
      res.status(500).json({ error: "تعذر إغلاق الاقتراح" });
    }
  });
}
