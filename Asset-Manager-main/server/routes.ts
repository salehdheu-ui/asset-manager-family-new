import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, createDefaultAdmin } from "./auth";
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

  return httpServer;
}
