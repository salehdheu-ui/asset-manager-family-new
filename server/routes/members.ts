import type { Express } from "express";
import { storage } from "../storage";
import { insertMemberSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";

export function registerMemberRoutes(app: Express) {
  app.get("/api/members", isAuthenticated, async (req: any, res) => {
    try {
      const members = await storage.getMembers();
      if (req.user?.role !== 'admin' && req.user?.memberId) {
        return res.json(members.filter(m => m.id === req.user.memberId));
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
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create member" });
      }
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

  app.delete("/api/members/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const memberId = req.params.id as string;
      const member = await storage.getMember(memberId);
      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }
      await storage.deleteMember(memberId);
      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ error: "Failed to delete member" });
    }
  });
}
