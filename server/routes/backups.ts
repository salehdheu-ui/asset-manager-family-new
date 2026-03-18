import type { Express } from "express";
import { isAuthenticated, isAdmin } from "../auth";
import { applyRetentionPolicy, createBackupSnapshot, listBackups } from "../services/backup";

export function registerBackupRoutes(app: Express) {
  app.get("/api/backups", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const backups = await listBackups();
      res.json(backups);
    } catch (error) {
      console.error("Backups list error:", error);
      res.status(500).json({ error: "Failed to fetch backups" });
    }
  });

  app.post("/api/backups/create", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const backup = await createBackupSnapshot(req.user?.id);
      res.status(201).json(backup);
    } catch (error) {
      console.error("Create backup error:", error);
      res.status(500).json({ error: "Failed to create backup" });
    }
  });

  app.post("/api/backups/apply-retention", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const result = await applyRetentionPolicy();
      res.json(result);
    } catch (error) {
      console.error("Apply backup retention error:", error);
      res.status(500).json({ error: "Failed to apply backup retention" });
    }
  });
}
