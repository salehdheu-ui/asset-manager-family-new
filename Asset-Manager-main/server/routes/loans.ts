import type { Express } from "express";
import { storage } from "../storage";
import { insertLoanSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { rebalanceYear, checkLoanTransaction } from "../capital-engine";

export function registerLoanRoutes(app: Express) {
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
      const loan = await storage.createLoan(data);
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

  app.patch("/api/loans/:id/status", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      const loanId = req.params.id as string;
      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      // التحقق المالي عند الاعتماد فقط
      if (status === 'approved') {
        const existingLoan = await storage.getLoans().then(ls => ls.find(l => l.id === loanId));
        if (!existingLoan) {
          return res.status(404).json({ error: "Loan not found" });
        }
        const approvalYear = new Date().getFullYear();
        const check = await checkLoanTransaction(Number(existingLoan.amount), approvalYear);
        if (!check.allowed) {
          return res.status(403).json({
            error: check.reason,
            layer: check.layer,
            available: check.available,
            requested: check.requested
          });
        }
      }

      const loan = await storage.updateLoanStatus(loanId, status);
      if (!loan) {
        return res.status(404).json({ error: "Loan not found" });
      }

      // إنشاء الأقساط وتحديث التخصيص المالي عند الاعتماد فقط
      if (status === 'approved') {
        const approvalYear = (loan.approvedAt || new Date()).getFullYear();

        // إنشاء جدول أقساط السداد
        if (loan.repaymentMonths && loan.repaymentMonths > 0) {
          const monthlyAmount = Number(loan.amount) / loan.repaymentMonths;
          const repayments = [];
          const approvalDate = loan.approvedAt || new Date();

          for (let i = 1; i <= loan.repaymentMonths; i++) {
            const dueDate = new Date(approvalDate);
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

        await rebalanceYear(approvalYear);
      }

      res.json(loan);
    } catch (error) {
      res.status(500).json({ error: "Failed to update loan status" });
    }
  });

  app.delete("/api/loans/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const loanId = req.params.id as string;
      const loan = (await storage.getLoans()).find((item) => item.id === loanId);
      if (!loan) {
        return res.status(404).json({ error: "Loan not found" });
      }
      await storage.deleteLoan(loanId);
      const loanYear = (loan.approvedAt || loan.createdAt || new Date()).getFullYear();
      await rebalanceYear(loanYear);
      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ error: "Failed to delete loan" });
    }
  });

  // Loan Repayments
  app.get("/api/loans/:id/repayments", isAuthenticated, async (req: any, res) => {
    try {
      const loanId = req.params.id as string;
      // التحقق من ملكية السلفة أو صلاحية المدير
      if (req.user?.role !== 'admin' && req.user?.memberId) {
        const allLoans = await storage.getLoans();
        const loan = allLoans.find(l => l.id === loanId);
        if (loan && loan.memberId !== req.user.memberId) {
          return res.status(403).json({ error: "غير مسموح بعرض أقساط سلفة عضو آخر" });
        }
      }
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
}
