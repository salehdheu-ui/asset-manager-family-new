import type { Express } from "express";
import { storage } from "../storage";
import { insertLoanPaymentSchema, insertLoanSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { blockMembersDuringEmergency } from "../emergency";
import { rebalanceYear } from "../capital-engine";
import { buildRepaymentSchedule, LOAN_VOTE_THRESHOLD } from "@shared/finance";
import { zodErrorResponse } from "../validation";

type LoanRecord = Awaited<ReturnType<typeof storage.getLoans>>[number];

// السلف فوق حد التصويت تتطلب موافقة العائلة: 3 موافقين على الأقل (أو كل المؤهلين إن كانوا أقل) وأغلبية الموافقين
async function getVoteTally(loan: LoanRecord) {
  const votes = await storage.getLoanVotes(loan.id);
  const approve = votes.filter(v => v.vote === "approve").length;
  const reject = votes.filter(v => v.vote === "reject").length;
  const eligible = await storage.countEligibleVoters(loan.memberId);
  const required = Math.max(1, Math.min(3, eligible));
  const passed = approve >= required && approve > reject;
  return { votes, approve, reject, eligible, required, passed };
}

function needsFamilyVote(loan: { amount: string | number }) {
  return Number(loan.amount) > LOAN_VOTE_THRESHOLD;
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

      // إثراء كل سلفة بالمسدد والمتبقي وحالة السداد الكامل
      const allPayments = await storage.getAllLoanPayments();
      const paidByLoan = new Map<string, number>();
      for (const payment of allPayments) {
        paidByLoan.set(payment.loanId, (paidByLoan.get(payment.loanId) ?? 0) + Number(payment.amount));
      }

      const enriched = loans.map((loan: any) => {
        const totalPaid = paidByLoan.get(loan.id) ?? 0;
        const remaining = Math.max(0, Number(loan.amount) - totalPaid);
        return {
          ...loan,
          totalPaid: Number(totalPaid.toFixed(3)),
          remaining: Number(remaining.toFixed(3)),
          settled: loan.status === "approved" && remaining <= 0.0005,
        };
      });

      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch loans" });
    }
  });

  app.post("/api/loans", isAuthenticated, blockMembersDuringEmergency, async (req, res) => {
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

      // إغلاق ثغرة الاعتماد المباشر: السلفة الكبيرة لا تُنشأ معتمدة — تمر بالتصويت أولاً
      if (data.status === "approved" && needsFamilyVote(data)) {
        return res.status(400).json({
          error: `السلف التي تتجاوز ${LOAN_VOTE_THRESHOLD.toLocaleString()} ر.ع تتطلب تصويت العائلة — أنشئها كطلب معلق ثم اعتمدها بعد اكتمال التصويت`,
        });
      }

      const loan = await storage.createLoan(data);

      if (loan.status === "approved") {
        await createScheduleAndRebalance(loan);
      }

      res.status(201).json(loan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json(zodErrorResponse(error));
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
        const existingLoan = await storage.getLoan(loanId);
        if (!existingLoan) {
          return res.status(404).json({ error: "Loan not found" });
        }

        // بوابة تصويت العائلة للسلف الكبيرة
        if (needsFamilyVote(existingLoan)) {
          const tally = await getVoteTally(existingLoan);
          if (!tally.passed) {
            return res.status(400).json({
              error: `هذه السلفة تتطلب تصويت العائلة قبل الاعتماد — الموافقون: ${tally.approve}/${tally.required} المطلوبين (الرافضون: ${tally.reject})`,
              voteTally: { approve: tally.approve, reject: tally.reject, required: tally.required, eligible: tally.eligible },
            });
          }

          await storage.createAuditLog({
            action: "loan_vote_passed",
            entityType: "loan",
            entityId: existingLoan.id,
            actorUserId: req.user?.id ?? null,
            actorName: req.user?.username ?? "مشرف",
            description: `اكتمل تصويت العائلة على سلفة كبيرة (${Number(existingLoan.amount).toLocaleString()} ر.ع) — موافقون: ${tally.approve}، رافضون: ${tally.reject}`,
            metadata: { loanId: existingLoan.id, approve: tally.approve, reject: tally.reject, required: tally.required },
          });
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

  // تعديل بيانات السلفة — صلاحية الوصي فقط، مع توثيق كامل في سجل التدقيق
  app.patch("/api/loans/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const loanId = req.params.id as string;
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ error: "السلفة غير موجودة" });
      }

      const editSchema = z.object({
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        type: z.enum(["urgent", "standard", "emergency"]).optional(),
        amount: z.string().refine((v) => Number(v) > 0, "المبلغ يجب أن يكون أكبر من صفر").optional(),
        repaymentType: z.enum(["scheduled", "open"]).optional(),
        repaymentMonths: z.number().int().min(1).max(120).nullable().optional(),
      });
      const data = editSchema.parse(req.body);

      // المبلغ وخطة السداد لا يعدَّلان إلا والسلفة معلقة — بعد الاعتماد تكون الأقساط قد أُنشئت
      if (loan.status !== "pending" && (data.amount !== undefined || data.repaymentType !== undefined || data.repaymentMonths !== undefined)) {
        return res.status(400).json({ error: "لا يمكن تعديل المبلغ أو خطة السداد بعد اعتماد السلفة — احذفها وأنشئها من جديد إذا لزم" });
      }

      const updated = await storage.updateLoan(loanId, data);
      const member = await storage.getMember(loan.memberId);

      await storage.createAuditLog({
        action: "loan_updated",
        entityType: "loan",
        entityId: loanId,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
        description: `تم تعديل سلفة ${member?.name ?? "عضو غير معروف"} (${loan.title})`,
        metadata: {
          memberId: loan.memberId,
          changedFields: Object.keys(data),
          before: { title: loan.title, description: loan.description, type: loan.type, amount: loan.amount, repaymentType: loan.repaymentType, repaymentMonths: loan.repaymentMonths },
          after: data,
        },
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "بيانات التعديل غير صحيحة" });
      } else {
        res.status(500).json({ error: "تعذر تعديل السلفة" });
      }
    }
  });

  // حذف سلفة — صلاحية الوصي فقط، يحذف أقساطها وسدادها معها ويعيد حساب التخصيص
  app.delete("/api/loans/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const loanId = req.params.id as string;
      const loan = await storage.getLoan(loanId);
      if (!loan) {
        return res.status(404).json({ error: "السلفة غير موجودة" });
      }

      const member = await storage.getMember(loan.memberId);
      const payments = await storage.getLoanPayments(loanId);
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

      await storage.deleteLoan(loanId);

      await storage.createAuditLog({
        action: "loan_deleted",
        entityType: "loan",
        entityId: loanId,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
        description: `تم حذف سلفة ${member?.name ?? "عضو غير معروف"} (${loan.title}) بمبلغ ${loan.amount} ر.ع`,
        metadata: {
          memberId: loan.memberId,
          memberName: member?.name ?? null,
          title: loan.title,
          amount: loan.amount,
          status: loan.status,
          totalPaidBeforeDeletion: totalPaid.toFixed(3),
          paymentsDeleted: payments.length,
        },
      });

      const loanYear = (loan.approvedAt || loan.createdAt || new Date()).getFullYear();
      await rebalanceYear(loanYear);

      res.status(204).send();
    } catch (error) {
      console.error("Delete loan error:", error);
      res.status(500).json({ error: "تعذر حذف السلفة" });
    }
  });

  // نتيجة التصويت على سلفة كبيرة — الأعداد للجميع، الأسماء للوصي فقط
  app.get("/api/loans/:id/votes", isAuthenticated, async (req, res) => {
    try {
      const loan = await storage.getLoan(req.params.id as string);
      if (!loan) {
        return res.status(404).json({ error: "السلفة غير موجودة" });
      }
      const tally = await getVoteTally(loan);
      const myVote = tally.votes.find(v => v.userId === req.user?.id)?.vote ?? null;
      res.json({
        required: tally.required,
        eligible: tally.eligible,
        approve: tally.approve,
        reject: tally.reject,
        passed: tally.passed,
        myVote,
        threshold: LOAN_VOTE_THRESHOLD,
        canVote:
          !!req.user?.memberId &&
          req.user.memberId !== loan.memberId &&
          loan.status === "pending" &&
          needsFamilyVote(loan),
        voters: req.user?.role === "admin"
          ? tally.votes.map(v => ({ name: v.voterName, vote: v.vote }))
          : undefined,
      });
    } catch (error) {
      res.status(500).json({ error: "تعذر جلب نتيجة التصويت" });
    }
  });

  // الإدلاء بصوت — لكل مستخدم مرتبط بعضوية صوت واحد، وصاحب السلفة لا يصوت لنفسه
  app.post("/api/loans/:id/vote", isAuthenticated, async (req, res) => {
    try {
      const vote = String(req.body?.vote ?? "");
      if (!["approve", "reject"].includes(vote)) {
        return res.status(400).json({ error: "قيمة التصويت غير صحيحة" });
      }

      const loan = await storage.getLoan(req.params.id as string);
      if (!loan) {
        return res.status(404).json({ error: "السلفة غير موجودة" });
      }
      if (loan.status !== "pending") {
        return res.status(400).json({ error: "التصويت متاح على الطلبات المعلقة فقط" });
      }
      if (!needsFamilyVote(loan)) {
        return res.status(400).json({ error: `هذه السلفة لا تتطلب تصويتاً (الحد ${LOAN_VOTE_THRESHOLD.toLocaleString()} ر.ع)` });
      }
      if (!req.user?.memberId) {
        return res.status(403).json({ error: "التصويت متاح لحسابات الأعضاء المرتبطة بعضوية فقط" });
      }
      if (req.user.memberId === loan.memberId) {
        return res.status(403).json({ error: "لا يمكنك التصويت على سلفتك" });
      }

      await storage.castLoanVote({
        loanId: loan.id,
        userId: req.user.id,
        voterName: req.user.username ?? req.user.firstName ?? "عضو",
        vote,
      });

      const tally = await getVoteTally(loan);
      res.json({ approve: tally.approve, reject: tally.reject, required: tally.required, passed: tally.passed, myVote: vote });
    } catch (error) {
      console.error("Cast vote error:", error);
      res.status(500).json({ error: "تعذر تسجيل الصوت" });
    }
  });

  // Loan Repayments
  app.get("/api/loans/:id/repayments", isAuthenticated, async (req: any, res) => {
    try {
      const loanId = req.params.id as string;
      // التحقق من ملكية السلفة أو صلاحية المدير
      if (req.user?.role !== 'admin') {
        const loan = await storage.getLoan(loanId);
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
        const loan = await storage.getLoan(loanId);
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
      const loan = await storage.getLoan(loanId);
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
        res.status(400).json(zodErrorResponse(error));
      } else {
        res.status(500).json({ error: "Failed to create loan payment" });
      }
    }
  });
}
