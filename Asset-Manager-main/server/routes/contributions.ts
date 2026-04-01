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
      const contribution = await storage.createContribution(data);
      res.status(201).json(contribution);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create contribution" });
      }
    }
  });

  app.patch("/api/contributions/:id/approve", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contribId = req.params.id as string;
      const contribution = await storage.approveContribution(contribId);
      if (!contribution) {
        return res.status(404).json({ error: "Contribution not found" });
      }
      await rebalanceYear(contribution.year);
      res.json(contribution);
    } catch (error) {
      res.status(500).json({ error: "Failed to approve contribution" });
    }
  });

  app.delete("/api/contributions/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const contributionId = req.params.id as string;
      const contribution = (await storage.getContributions()).find((item) => item.id === contributionId);
      if (!contribution) {
        return res.status(404).json({ error: "Contribution not found" });
      }
      await storage.deleteContribution(contributionId);
      await rebalanceYear(contribution.year);
      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ error: "Failed to delete contribution" });
    }
  });
}
