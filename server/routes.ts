import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, createDefaultAdmin } from "./auth";
import { storage } from "./storage";
import { createBackupSnapshot } from "./services/backup";
import { migrateWithdrawalsToLoans } from "./migrations/withdrawals-to-loans";
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
} from "./routes/index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup custom authentication
  await setupAuth(app);
  
  // Create default admin user if not exists
  await createDefaultAdmin();

  // Run one-time data migrations
  await migrateWithdrawalsToLoans();

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

  // Auto-backup scheduler: checks every hour, creates a snapshot if 24h have elapsed
  setInterval(async () => {
    try {
      const settings = await storage.getFamilySettings();
      if (!settings?.backupEnabled) return;

      const now = new Date();
      const lastRun = settings.backupLastRunAt ? new Date(settings.backupLastRunAt) : null;
      const elapsed = lastRun ? now.getTime() - lastRun.getTime() : Infinity;
      if (elapsed >= 24 * 60 * 60 * 1000) {
        await createBackupSnapshot(null);
      }
    } catch (err) {
      console.error("[auto-backup] error:", err);
    }
  }, 60 * 60 * 1000);

  return httpServer;
}
