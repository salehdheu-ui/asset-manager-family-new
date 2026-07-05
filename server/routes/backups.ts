import type { Express } from "express";
import { isAuthenticated, isAdmin } from "../auth";
import { storage } from "../storage";
import {
  applyRetentionPolicy,
  createBackupSnapshot,
  importBackupPayload,
  listBackups,
  readBackupRecord,
  restoreBackupSnapshot,
  summarizeBackupPayload,
} from "../services/backup";

function actorName(req: any) {
  return req.user?.username ?? req.user?.firstName ?? "مشرف";
}

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

  app.post("/api/backups/create", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const backup = await createBackupSnapshot(req.user?.id);

      await storage.createAuditLog({
        action: "backup_created",
        entityType: "system_backup",
        entityId: backup.id,
        actorUserId: req.user?.id ?? null,
        actorName: actorName(req),
        description: `تم إنشاء نسخة احتياطية يدوية (${backup.fileName})`,
        metadata: { fileName: backup.fileName, sizeBytes: backup.sizeBytes },
      });

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

  // ملخص محتوى نسخة — يُعرض قبل تأكيد الاستعادة
  app.get("/api/backups/:id/summary", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const snapshot = await readBackupRecord(req.params.id as string);
      if (!snapshot) {
        return res.status(404).json({ error: "النسخة غير موجودة" });
      }
      res.json({
        fileName: snapshot.record.fileName,
        backupDate: snapshot.record.backupDate,
        backupLevel: snapshot.record.backupLevel,
        ...summarizeBackupPayload(snapshot.payload),
      });
    } catch (error) {
      res.status(500).json({ error: "تعذر قراءة ملخص النسخة" });
    }
  });

  app.get("/api/backups/:id/download", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const snapshot = await readBackupRecord(req.params.id as string);
      if (!snapshot) {
        return res.status(404).json({ error: "Backup not found" });
      }

      await storage.createAuditLog({
        action: "backup_exported",
        entityType: "system_backup",
        entityId: snapshot.record.id,
        actorUserId: req.user?.id ?? null,
        actorName: actorName(req),
        description: `تم تصدير النسخة الاحتياطية (${snapshot.record.fileName}) خارج النظام`,
        metadata: { fileName: snapshot.record.fileName },
      });

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
      const result = await restoreBackupSnapshot(req.params.id as string, req.user?.id);
      if (!result) {
        return res.status(404).json({ error: "Backup not found" });
      }

      await storage.createAuditLog({
        action: "backup_restored",
        entityType: "system_backup",
        entityId: result.record.id,
        actorUserId: req.user?.id ?? null,
        actorName: actorName(req),
        description: `تمت استعادة النسخة الاحتياطية (${result.record.fileName}) — أُنشئت نسخة أمان تلقائية قبل الاستعادة`,
        metadata: {
          fileName: result.record.fileName,
          safetySnapshotId: result.safetySnapshotId,
          restoredCounts: result.summary.counts,
        },
      });

      res.json(result);
    } catch (error) {
      console.error("Restore backup error:", error);
      const message = error instanceof Error ? error.message : "Failed to restore backup";
      res.status(400).json({ error: message });
    }
  });

  // استيراد نسخة من ملف خارجي مُنزَّل سابقاً — لاستعادة النظام حتى بعد فقدان الخادم
  app.post("/api/backups/import", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const payload = req.body;
      const result = await importBackupPayload(payload, req.user?.id);

      await storage.createAuditLog({
        action: "backup_imported",
        entityType: "system_backup",
        entityId: result.record.id,
        actorUserId: req.user?.id ?? null,
        actorName: actorName(req),
        description: `تمت استعادة النظام من ملف نسخة مستورد (${result.record.fileName}) — أُنشئت نسخة أمان تلقائية قبل الاستعادة`,
        metadata: {
          fileName: result.record.fileName,
          safetySnapshotId: result.safetySnapshotId,
          restoredCounts: result.summary.counts,
        },
      });

      res.status(201).json(result);
    } catch (error) {
      console.error("Import backup error:", error);
      const message = error instanceof Error ? error.message : "تعذر استيراد النسخة";
      res.status(400).json({ error: message });
    }
  });
}
