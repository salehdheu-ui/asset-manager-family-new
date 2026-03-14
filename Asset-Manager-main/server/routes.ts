import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMemberSchema, insertContributionSchema, insertLoanSchema, insertExpenseSchema, insertFamilySettingsSchema, insertFundAdjustmentSchema, members, contributions, loans, loanRepayments, expenses, fundAdjustments, capitalAllocations, familySettings } from "@shared/schema";
import { z } from "zod";
import { setupAuth, isAuthenticated, isAdmin, createDefaultAdmin } from "./auth";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { rebalanceYear, lockYearAllocation, checkLoanTransaction, checkExpenseTransaction, resetYearAllocation, getAllocationForYear } from "./capital-engine";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup custom authentication
  await setupAuth(app);
  
  // Create default admin user if not exists
  await createDefaultAdmin();

  // ============= User Profile =============
  app.get("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // If linked to a member, get member data too
      let memberData = null;
      if (user.memberId) {
        memberData = await storage.getMember(user.memberId);
      }
      
      res.json({ ...user, member: memberData });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.patch("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { firstName, lastName } = req.body;
      const [updated] = await db
        .update(users)
        .set({ firstName, lastName, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // ============= Members =============
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

  app.post("/api/members", isAuthenticated, async (req, res) => {
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

  app.patch("/api/members/:id", isAuthenticated, async (req, res) => {
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
      await storage.deleteMember(memberId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete member" });
    }
  });

  // ============= Contributions =============
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

  app.patch("/api/contributions/:id/approve", isAuthenticated, async (req, res) => {
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
      const contribId = req.params.id as string;
      await storage.deleteContribution(contribId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete contribution" });
    }
  });

  // ============= Loans =============
  app.get("/api/loans", isAuthenticated, async (req: any, res) => {
    try {
      const memberId = req.query.memberId as string | undefined;
      let loans = memberId 
        ? await storage.getLoansByMember(memberId)
        : await storage.getLoans();

      if (req.user?.role !== 'admin' && req.user?.memberId) {
        loans = loans.filter((l: any) => l.memberId === req.user.memberId);
      }

      res.json(loans);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch loans" });
    }
  });

  app.post("/api/loans", isAuthenticated, async (req, res) => {
    try {
      const data = insertLoanSchema.parse(req.body);
      const currentYear = new Date().getFullYear();
      
      const check = await checkLoanTransaction(Number(data.amount), currentYear);
      if (!check.allowed) {
        return res.status(403).json({ 
          error: check.reason,
          layer: check.layer,
          available: check.available,
          requested: check.requested
        });
      }

      const loan = await storage.createLoan(data);
      
      if (data.repaymentMonths && data.repaymentMonths > 0) {
        const monthlyAmount = Number(data.amount) / data.repaymentMonths;
        const repayments = [];
        const now = new Date();
        
        for (let i = 1; i <= data.repaymentMonths; i++) {
          const dueDate = new Date(now);
          dueDate.setMonth(dueDate.getMonth() + i);
          repayments.push({
            loanId: loan.id,
            installmentNumber: i,
            amount: monthlyAmount.toFixed(3),
            dueDate,
            status: "scheduled"
          });
        }
        await storage.createLoanRepayments(repayments as any);
      }

      await rebalanceYear(currentYear);
      
      res.status(201).json(loan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        console.error(error);
        res.status(500).json({ error: "Failed to create loan" });
      }
    }
  });

  app.patch("/api/loans/:id/status", isAuthenticated, async (req, res) => {
    try {
      const { status } = req.body;
      const loanId = req.params.id as string;
      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const loan = await storage.updateLoanStatus(loanId, status);
      if (!loan) {
        return res.status(404).json({ error: "Loan not found" });
      }
      res.json(loan);
    } catch (error) {
      res.status(500).json({ error: "Failed to update loan status" });
    }
  });

  app.delete("/api/loans/:id", isAuthenticated, async (req, res) => {
    try {
      const loanId = req.params.id as string;
      await storage.deleteLoan(loanId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete loan" });
    }
  });

  // Loan Repayments
  app.get("/api/loans/:id/repayments", async (req, res) => {
    try {
      const loanId = req.params.id as string;
      const repayments = await storage.getLoanRepayments(loanId);
      res.json(repayments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch repayments" });
    }
  });

  app.patch("/api/repayments/:id/pay", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const repaymentId = req.params.id as string;
      const repayment = await storage.markRepaymentPaid(repaymentId);
      if (!repayment) {
        return res.status(404).json({ error: "Repayment not found" });
      }
      const paidYear = repayment.paidAt ? repayment.paidAt.getFullYear() : new Date().getFullYear();
      await rebalanceYear(paidYear);
      res.json(repayment);
    } catch (error) {
      res.status(500).json({ error: "Failed to mark repayment as paid" });
    }
  });

  // ============= Expenses =============
  app.get("/api/expenses", async (req, res) => {
    try {
      const expenses = await storage.getExpenses();
      res.json(expenses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expenses" });
    }
  });

  app.post("/api/expenses", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const data = insertExpenseSchema.parse(req.body);
      const currentYear = new Date().getFullYear();

      const check = await checkExpenseTransaction(Number(data.amount), data.category, currentYear);
      if (!check.allowed) {
        return res.status(403).json({ 
          error: check.reason,
          layer: check.layer,
          available: check.available,
          requested: Number(data.amount)
        });
      }

      const expense = await storage.createExpense(data);
      await rebalanceYear(currentYear);
      res.status(201).json(expense);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create expense" });
      }
    }
  });

  app.delete("/api/expenses/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const expenseId = req.params.id as string;
      await storage.deleteExpense(expenseId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });

  // ============= Family Settings =============
  app.get("/api/settings", async (req, res) => {
    try {
      let settings = await storage.getFamilySettings();
      if (!settings) {
        settings = await storage.updateFamilySettings({
          familyName: "صندوق العائلة",
          currency: "ر.ع"
        });
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const settings = await storage.updateFamilySettings(req.body);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // ============= Dashboard Summary =============
  app.get("/api/dashboard/summary", async (req, res) => {
    try {
      const currentYear = new Date().getFullYear();
      const [allContributions, allLoans, allExpenses, settings, allAdjustments] = await Promise.all([
        storage.getContributions(),
        storage.getLoans(),
        storage.getExpenses(),
        storage.getFamilySettings(),
        storage.getFundAdjustments()
      ]);

      const approvedContributions = allContributions.filter(c => c.status === "approved");
      const approvedLoans = allLoans.filter(l => l.status === "approved");

      const totalContributions = approvedContributions.reduce((sum, c) => sum + Number(c.amount), 0);
      const totalLoans = approvedLoans.reduce((sum, l) => sum + Number(l.amount), 0);
      const totalExpenses = allExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const totalDeposits = allAdjustments.filter(a => a.type === 'deposit').reduce((sum, a) => sum + Number(a.amount), 0);
      const totalWithdrawals = allAdjustments.filter(a => a.type === 'withdrawal').reduce((sum, a) => sum + Number(a.amount), 0);

      let totalRepayments = 0;
      for (const loan of approvedLoans) {
        const reps = await storage.getLoanRepayments(loan.id);
        totalRepayments += reps.filter(r => r.status === 'paid').reduce((sum, r) => sum + Number(r.amount), 0);
      }

      const netCapital = totalContributions + totalDeposits - totalWithdrawals - totalLoans + totalRepayments - totalExpenses;
      const capital = Math.max(0, netCapital);

      const percents = settings || { protectedPercent: 45, emergencyPercent: 15, flexiblePercent: 20, growthPercent: 20 };

      const allocation = await getAllocationForYear(currentYear);

      res.json({
        totalContributions,
        totalLoans,
        totalExpenses,
        totalRepayments,
        netCapital: capital,
        allocation,
        lockedNetAssets: allocation.netAssets,
        layers: [
          { id: "protected", name: "رأس المال المحمي", percentage: percents.protectedPercent, amount: allocation.protected.amount, locked: true, used: 0, available: 0 },
          { id: "emergency", name: "احتياطي الطوارئ", percentage: percents.emergencyPercent, amount: allocation.emergency.amount, locked: true, used: allocation.emergency.used, available: allocation.emergency.available },
          { id: "flexible", name: "رأس المال المرن", percentage: percents.flexiblePercent, amount: allocation.flexible.amount, locked: false, used: allocation.flexible.used, available: allocation.flexible.available },
          { id: "growth", name: "رأس مال النمو", percentage: percents.growthPercent, amount: allocation.growth.amount, locked: true, used: allocation.growth.used, available: allocation.growth.available },
        ]
      });
    } catch (error) {
      console.error("Dashboard summary error:", error);
      res.status(500).json({ error: "Failed to fetch dashboard summary" });
    }
  });

  // ============= Fund Adjustments (Admin) =============
  app.get("/api/fund-adjustments", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const adjustments = await storage.getFundAdjustments();
      res.json(adjustments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch fund adjustments" });
    }
  });

  app.post("/api/fund-adjustments", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const data = insertFundAdjustmentSchema.parse({
        ...req.body,
        createdBy: req.user?.id,
      });
      if (!['deposit', 'withdrawal'].includes(data.type)) {
        return res.status(400).json({ error: "Invalid type" });
      }
      const adjustment = await storage.createFundAdjustment(data);
      const currentYear = new Date().getFullYear();
      await rebalanceYear(currentYear);
      res.status(201).json(adjustment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create fund adjustment" });
      }
    }
  });

  app.delete("/api/fund-adjustments/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      await storage.deleteFundAdjustment(id);
      const currentYear = new Date().getFullYear();
      await rebalanceYear(currentYear);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete fund adjustment" });
    }
  });

  // ============= Capital Allocation =============
  app.get("/api/allocation/:year", isAuthenticated, async (req, res) => {
    try {
      const year = Number(req.params.year);
      const allocation = await getAllocationForYear(year);
      res.json(allocation);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch allocation" });
    }
  });

  app.post("/api/allocation/:year/lock", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const year = Number(req.params.year);
      const allocation = await lockYearAllocation(year);
      res.json(allocation);
    } catch (error) {
      res.status(500).json({ error: "Failed to lock allocation" });
    }
  });

  app.post("/api/allocation/:year/reset", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const year = Number(req.params.year);
      const allocation = await resetYearAllocation(year, req.user.id);
      res.json(allocation);
    } catch (error) {
      res.status(500).json({ error: "Failed to reset allocation" });
    }
  });

  app.post("/api/allocation/check-loan", isAuthenticated, async (req, res) => {
    try {
      const { amount } = req.body;
      const currentYear = new Date().getFullYear();
      const check = await checkLoanTransaction(Number(amount), currentYear);
      res.json(check);
    } catch (error) {
      res.status(500).json({ error: "Failed to check loan" });
    }
  });

  app.post("/api/allocation/check-expense", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { amount, category } = req.body;
      const currentYear = new Date().getFullYear();
      const check = await checkExpenseTransaction(Number(amount), category, currentYear);
      res.json(check);
    } catch (error) {
      res.status(500).json({ error: "Failed to check expense" });
    }
  });

  // ============= System Reset (Admin Only) =============
  app.post("/api/system/reset", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await db.transaction(async (tx) => {
        await tx.delete(loanRepayments);
        await tx.delete(loans);
        await tx.delete(contributions);
        await tx.delete(expenses);
        await tx.delete(fundAdjustments);
        await tx.delete(capitalAllocations);
        await tx.delete(members);
        await tx.delete(familySettings);
      });
      res.json({ success: true });
    } catch (error) {
      console.error("System reset error:", error);
      res.status(500).json({ error: "فشل في إعادة تصفير النظام" });
    }
  });

  return httpServer;
}
