import type { Express } from "express";
import { storage } from "../storage";
import { insertLoanPaymentSchema, insertLoanSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { rebalanceYear } from "../capital-engine";

type LoanRecord = Awaited<ReturnType<typeof storage.getLoans>>[number];

// يبني جدول الأقساط بحيث يمتص القسط الأخير فرق التقريب ليطابق المجموع مبلغ السلفة تماماً
function buildRepaymentSchedule(loan: LoanRecord) {
  if (loan.repaymentType !== "scheduled" || !loan.repaymentMonths || loan.repaymentMonths <= 0) {
    return [];
  }

  const totalAmount = Number(loan.amount);
  const months = loan.repaymentMonths;
  const baseInstallment = Math.floor((totalAmount / months) * 1000) / 1000;
  const lastInstallment = totalAmount - baseInstallment * (months - 1);
  const approvalDate = loan.approvedAt || loan.createdAt || new Date();

  return Array.from({ length: months }, (_, i) => {
    const dueDate = new Date(approvalDate);
    dueDate.setMonth(dueDate.getMonth() + i + 1);
    return {
      loanId: loan.id,
      installmentNumber: i + 1,
      amount: (i === months - 1 ? lastInstallment : baseInstallment).toFixed(3),
      dueDate,
      status: "scheduled" as const,
    };
  });
}

async function createScheduleAndRebalance(loan: LoanRecord) {
  const repayments = buildRepaymentSchedule(loan);
  if (repayments.length > 0) {
    await storage.createLoanRepayments(repayments as any);
  }
  const approvalYear = (loan.approvedAt || loan.createdAt || new Date()).getFullYear();
  await rebalanceYear(approvalYear);
}

export function registerLoanRoutes(app: Express) {
  app.get("/api/loans", isAuthenticated, async (req: any, res) => {
    try {
      const memberId = req.query.memberId as string | undefined;
      let loans = memberId 
        ? await storage.getLoansByMember(memberId)
        : await storage.getLoans();

      if (req.user?.role !== 'admin') {
        const ownMemberId = req.user?.memberId;
        loans = ownMemberId ? loans.filter((l: any) => l.memberId === ownMemberId) : [];
      }

      res.json(loans);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch loans" });
    }
  });

  app.post("/api/loans", isAuthenticated, async (req, res) => {
    try {
      const isAdminUser = req.user?.role === "admin";
      const data = insertLoanSchema.parse({
        ...req.body,
        // تحديد الحالة عند الإنشاء حصري للمدير — طلب العضو يبدأ معلقاً دائماً
        status: isAdminUser ? req.body?.status : "pending",
      });

      if (!isAdminUser && data.memberId !== req.user?.memberId) {
        return res.status(403).json({ error: "لا يمكنك طلب سلفة لعضو آخر" });
      }

      const loan = await storage.createLoan(data);

      if (loan.status === "approved") {
        await createScheduleAndRebalance(loan);
      }

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
      }

      const loan = await storage.updateLoanStatus(loanId, status);
      if (!loan) {
        return res.status(404).json({ error: "Loan not found" });
      }

      // إنشاء الأقساط وتحديث التخصيص المالي عند الاعتماد فقط
      if (status === 'approved') {
        await createScheduleAndRebalance(loan);
      }

      res.json(loan);
    } catch (error) {
      res.status(500).json({ error: "Failed to update loan status" });
    }
  });

  app.delete("/api/loans/:id", isAuthenticated, async (_req, res) => {
    return res.status(403).json({ error: "تم تعطيل الحذف النهائي حفاظاً على البيانات" });
  });

  // Loan Repayments
  app.get("/api/loans/:id/repayments", isAuthenticated, async (req: any, res) => {
    try {
      const loanId = req.params.id as string;
      // التحقق من ملكية السلفة أو صلاحية المدير
      if (req.user?.role !== 'admin') {
        const allLoans = await storage.getLoans();
        const loan = allLoans.find(l => l.id === loanId);
        if (!loan) {
          return res.status(404).json({ error: "السلفة غير موجودة" });
        }
        if (!req.user?.memberId || loan.memberId !== req.user.memberId) {
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
      await storage.createLoanPayment({
        loanId: repayment.loanId,
        amount: String(repayment.amount),
        note: `سداد القسط رقم ${repayment.installmentNumber}`,
        createdBy: (req as any).user?.id
      });
      const paidYear = repayment.paidAt ? repayment.paidAt.getFullYear() : new Date().getFullYear();
      await rebalanceYear(paidYear);
      res.json(repayment);
    } catch (error) {
      res.status(500).json({ error: "Failed to mark repayment as paid" });
    }
  });

  app.get("/api/loans/:id/payments", isAuthenticated, async (req: any, res) => {
    try {
      const loanId = req.params.id as string;
      if (req.user?.role !== 'admin') {
        const allLoans = await storage.getLoans();
        const loan = allLoans.find(l => l.id === loanId);
        if (!loan) {
          return res.status(404).json({ error: "السلفة غير موجودة" });
        }
        if (!req.user?.memberId || loan.memberId !== req.user.memberId) {
          return res.status(403).json({ error: "غير مسموح بعرض سداد سلفة عضو آخر" });
        }
      }
      const payments = await storage.getLoanPayments(loanId);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch loan payments" });
    }
  });

  app.post("/api/loans/:id/payments", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const loanId = req.params.id as string;
      const allLoans = await storage.getLoans();
      const loan = allLoans.find(l => l.id === loanId);
      if (!loan) {
        return res.status(404).json({ error: "Loan not found" });
      }
      if (loan.status !== 'approved') {
        return res.status(400).json({ error: "لا يمكن تسجيل سداد إلا لسلفة معتمدة" });
      }
      const payments = await storage.getLoanPayments(loanId);
      const paidTotal = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const amount = Number(req.body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "يرجى إدخال مبلغ سداد صحيح" });
      }
      if (paidTotal + amount > Number(loan.amount)) {
        return res.status(400).json({ error: "مبلغ السداد أكبر من المتبقي على السلفة" });
      }
      const paymentData = insertLoanPaymentSchema.parse({
        loanId,
        amount: req.body.amount,
        note: req.body.note || null,
        createdBy: req.user?.id
      });
      const payment = await storage.createLoanPayment(paymentData);
      const paidYear = payment.paidAt ? payment.paidAt.getFullYear() : new Date().getFullYear();
      await rebalanceYear(paidYear);
      res.status(201).json(payment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create loan payment" });
      }
    }
  });
}
