import type { Express } from "express";
import { isAuthenticated, isAdmin } from "../auth";
import { applyRetentionPolicy, createBackupSnapshot, listBackups, readBackupRecord, restoreBackupSnapshot } from "../services/backup";

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

  app.get("/api/backups/:id/download", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const snapshot = await readBackupRecord(req.params.id);
      if (!snapshot) {
        return res.status(404).json({ error: "Backup not found" });
      }
      const json = JSON.stringify(snapshot.payload, null, 2);
      res.setHeader("Content-Disposition", `attachment; filename="${snapshot.record.fileName}"`);
      res.setHeader("Content-Type", "application/json");
      res.send(json);
    } catch (error) {
      console.error("Download backup error:", error);
      res.status(500).json({ error: "Failed to download backup" });
    }
  });

  app.post("/api/backups/:id/restore", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const backup = await restoreBackupSnapshot(req.params.id);
      if (!backup) {
        return res.status(404).json({ error: "Backup not found" });
      }

      res.json(backup);
    } catch (error) {
      console.error("Restore backup error:", error);
      res.status(500).json({ error: "Failed to restore backup" });
    }
  });
}
