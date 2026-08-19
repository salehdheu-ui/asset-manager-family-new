import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, createDefaultAdmin } from "./auth";
import { storage } from "./storage";
import { applyRetentionPolicy, createBackupSnapshot } from "./services/backup";
import {
  registerAdminRoutes,
  registerMemberRoutes,
  registerContributionRoutes,
  registerLoanRoutes,
  registerExpenseRoutes,
  registerSettingsRoutes,
  registerBackupRoutes,
  registerAllocationRoutes,
  registerReportRoutes,
  registerZakatRoutes,
  registerInvestmentRoutes,
  registerProposalRoutes,
  registerAttachmentRoutes,
  registerRateRoutes,
  registerNotificationRoutes,
  registerReconcileRoutes,
} from "./routes/index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup custom authentication
  await setupAuth(app);
  
  // Create default admin user if not exists
  await createDefaultAdmin();

  // Register all route modules
  registerAdminRoutes(app);
  registerMemberRoutes(app);
  registerContributionRoutes(app);
  registerLoanRoutes(app);
  registerExpenseRoutes(app);
  registerSettingsRoutes(app);
  registerBackupRoutes(app);
  registerAllocationRoutes(app);
  registerReportRoutes(app);
  registerZakatRoutes(app);
  registerInvestmentRoutes(app);
  registerProposalRoutes(app);
  registerAttachmentRoutes(app);
  registerRateRoutes(app);
  registerNotificationRoutes(app);
  registerReconcileRoutes(app);

  /**
   * النسخ التلقائي: فحص كل ساعة، ونسخة إن مضى يوم.
   *
   * وبعد كل نسخة تُطبَّق سياسة الاستبقاء. كانت السياسة لا تعمل إلا بضغطة زر
   * في لوحة الإدارة، فينمو الأرشيف بلا حدّ — والنسخة الواحدة تُحفظ مرتين:
   * ملفاً على القرص، وحمولةً كاملة داخل عمود في قاعدة البيانات نفسها. فنسخة
   * يومية تعني نسخة من الصندوق كله كل يوم، داخل الصندوق وخارجه، إلى ما لا
   * نهاية — حتى يمتلئ القرص أو تنتفخ القاعدة.
   *
   * والسياسة نفسها لا تُفرّط: تُبقي كل نسخ آخر `backupKeepDays` يوماً، وممثلاً
   * أسبوعياً لكل أسبوع من الشهر، وممثلاً شهرياً لكل شهر — بحدودها المضبوطة في
   * الإعدادات، وأدناها واحد مهما كُتب فيها. والحذف يُوثَّق في سجل التدقيق.
   */
  setInterval(async () => {
    try {
      const settings = await storage.getFamilySettings();
      if (!settings?.backupEnabled) return;

      const now = new Date();
      const lastRun = settings.backupLastRunAt ? new Date(settings.backupLastRunAt) : null;
      const elapsed = lastRun ? now.getTime() - lastRun.getTime() : Infinity;
      if (elapsed >= 24 * 60 * 60 * 1000) {
        await createBackupSnapshot(null);

        const pruned = await applyRetentionPolicy();
        if (pruned.deletedBackups.length > 0) {
          await storage.createAuditLog({
            action: "backups_pruned",
            entityType: "system_backup",
            entityId: "retention",
            actorUserId: null,
            actorName: "استبقاء تلقائي",
            description: `حُذفت ${pruned.deletedBackups.length} نسخة احتياطية قديمة بحسب سياسة الاستبقاء (بقي ${pruned.kept})`,
            metadata: {
              count: pruned.deletedBackups.length,
              kept: pruned.kept,
              files: pruned.deletedBackups.map((b) => b.fileName),
            },
          });
        }
      }
    } catch (err) {
      console.error("[auto-backup] error:", err);
    }
  }, 60 * 60 * 1000);

  return httpServer;
}
