import { 
  type Member, type InsertMember, members,
  type Contribution, type InsertContribution, contributions,
  type Loan, type InsertLoan, loans,
  type LoanRepayment, type InsertLoanRepayment, loanRepayments,
  type LoanPayment, type InsertLoanPayment, loanPayments,
  type Expense, type InsertExpense, expenses,
  type FamilySettings, type InsertFamilySettings, familySettings,
  type FundAdjustment, type InsertFundAdjustment, fundAdjustments,
  type AuditLog, type InsertAuditLog, auditLogs,
  capitalAllocations,
  systemBackups,
  type PasswordResetRequest, passwordResetRequests,
  type LoanVote, loanVotes,
  type ZakatCycle, zakatCycles,
  type Investment, type InsertInvestment, investments,
  type InvestmentValuation, type InsertInvestmentValuation, investmentValuations,
  type Proposal, type InsertProposal, proposals,
  type ProposalVote, proposalVotes,
  type Attachment, attachments,
  type ContributionRate, type InsertContributionRate, contributionRates,
  type PushSubscription, type InsertPushSubscription, pushSubscriptions,
  type Notification, type InsertNotification, notifications
} from "@shared/schema";
import { users } from "@shared/models/auth";

/** ما يرتبط بعضو من سجلات — صفرٌ يعني أن حذفه لا يُتلف شيئاً */
export interface MemberFootprint {
  contributions: number;
  loans: number;
  accounts: number;
  total: number;
}
import { db } from "./db";
import { eq, and, desc, gte, lte, lt, ne, or, isNull, isNotNull, inArray, sql } from "drizzle-orm";

export interface IStorage {
  // Members
  getMembers(): Promise<Member[]>;
  getMember(id: string): Promise<Member | undefined>;
  createMember(member: InsertMember): Promise<Member>;
  updateMember(id: string, member: Partial<InsertMember>): Promise<Member | undefined>;
  deleteMember(id: string): Promise<void>;
  /** ما يرتبط بالعضو من سجلات — يقرر أيُحذف أم يُؤرشَف */
  memberFootprint(id: string): Promise<MemberFootprint>;
  setMemberArchived(id: string, archived: boolean): Promise<Member | undefined>;

  // Contributions
  getContributions(): Promise<Contribution[]>;
  getContributionsByMember(memberId: string): Promise<Contribution[]>;
  getContribution(id: string): Promise<Contribution | undefined>;
  getContributionsByYear(year: number): Promise<Contribution[]>;
  getApprovedContributionsByYear(year: number): Promise<Contribution[]>;
  getContributionsByYearAndMonth(year: number, month: number): Promise<Contribution[]>;
  getContributionByMemberYearMonth(memberId: string, year: number, month: number): Promise<Contribution | undefined>;
  createContribution(contribution: InsertContribution): Promise<Contribution>;
  approveContribution(id: string): Promise<Contribution | undefined>;
  deleteContribution(id: string): Promise<Contribution | undefined>;

  // Loans
  getLoans(): Promise<Loan[]>;
  getLoansByMember(memberId: string): Promise<Loan[]>;
  getLoansByYear(year: number): Promise<Loan[]>;
  getLoan(id: string): Promise<Loan | undefined>;
  createLoan(loan: InsertLoan): Promise<Loan>;
  updateLoanStatus(id: string, status: string): Promise<Loan | undefined>;
  updateLoan(id: string, data: Partial<InsertLoan>): Promise<Loan | undefined>;
  deleteLoan(id: string): Promise<void>;

  // Loan Repayments
  getLoanRepayments(loanId: string): Promise<LoanRepayment[]>;
  getAllLoanRepayments(): Promise<LoanRepayment[]>;
  createLoanRepayments(repayments: InsertLoanRepayment[]): Promise<LoanRepayment[]>;
  markRepaymentPaid(id: string): Promise<LoanRepayment | undefined>;
  getLoanPayments(loanId: string): Promise<LoanPayment[]>;
  getLoanPayment(id: string): Promise<LoanPayment | undefined>;
  createLoanPayment(payment: InsertLoanPayment): Promise<LoanPayment>;
  /** المسدَّد على كل سلفة، مجمَّعاً في قاعدة البيانات لا في الذاكرة */
  getPaidTotalsByLoan(): Promise<Map<string, number>>;
  /** إجمالي ما سُدِّد على السلف المعتمدة وحدها */
  getRepaidTotalOnApprovedLoans(): Promise<number>;
  /** السداد الواقع في سنة بعينها — للتقارير السنوية */
  getRepaymentsInYear(year: number): Promise<LoanPayment[]>;
  /** السداد الواقع في شهر بعينه */
  getRepaymentsInMonth(year: number, month: number): Promise<LoanPayment[]>;
  getLoanPaymentsForLoans(loanIds: string[]): Promise<LoanPayment[]>;
  getLoanRepaymentsForLoans(loanIds: string[]): Promise<LoanRepayment[]>;

  // Expenses
  getExpenses(): Promise<Expense[]>;
  getExpense(id: string): Promise<Expense | undefined>;
  getExpensesByYear(year: number): Promise<Expense[]>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  deleteExpense(id: string): Promise<void>;

  // Fund Adjustments
  getFundAdjustments(): Promise<FundAdjustment[]>;
  createFundAdjustment(adjustment: InsertFundAdjustment): Promise<FundAdjustment>;
  deleteFundAdjustment(id: string): Promise<void>;

  // Family Settings
  getFamilySettings(): Promise<FamilySettings | undefined>;
  updateFamilySettings(settings: Partial<InsertFamilySettings>): Promise<FamilySettings>;

  // Audit Logs
  getAuditLogs(page?: number, limit?: number): Promise<{ data: AuditLog[]; total: number; page: number; limit: number; totalPages: number }>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;

  // Loan Votes (تصويت العائلة على السلف الكبيرة)
  getLoanVotes(loanId: string): Promise<LoanVote[]>;
  castLoanVote(data: { loanId: string; userId: string; voterName: string; vote: string }): Promise<LoanVote>;
  countEligibleVoters(excludeMemberId?: string | null): Promise<number>;
  /** خريطة الحساب إلى عضويته — لفرز الأصوات على الأعضاء لا على الحسابات */
  getVoterMemberships(): Promise<Map<string, string | null>>;

  // Password Reset Requests
  createResetRequest(username: string, userId: string | null): Promise<PasswordResetRequest>;
  getPendingResetRequests(): Promise<PasswordResetRequest[]>;
  getResetRequest(id: string): Promise<PasswordResetRequest | undefined>;
  getActiveResetRequestByUsername(username: string): Promise<PasswordResetRequest | undefined>;
  updateResetRequest(id: string, data: Partial<PasswordResetRequest>): Promise<PasswordResetRequest | undefined>;

  // Zakat
  getZakatCycles(): Promise<ZakatCycle[]>;
  getZakatCycle(id: string): Promise<ZakatCycle | undefined>;
  getOpenZakatCycle(): Promise<ZakatCycle | undefined>;
  createZakatCycle(data: { cycleStart: Date; note?: string | null }): Promise<ZakatCycle>;
  updateZakatCycle(id: string, data: Partial<ZakatCycle>): Promise<ZakatCycle | undefined>;

  // Investments
  getInvestments(): Promise<Investment[]>;
  getInvestment(id: string): Promise<Investment | undefined>;
  createInvestment(data: InsertInvestment): Promise<Investment>;
  updateInvestment(id: string, data: Partial<Investment>): Promise<Investment | undefined>;
  deleteInvestment(id: string): Promise<void>;
  getInvestmentValuations(investmentId?: string): Promise<InvestmentValuation[]>;
  createInvestmentValuation(data: InsertInvestmentValuation): Promise<InvestmentValuation>;

  // Proposals (قرارات العائلة)
  getProposals(): Promise<Proposal[]>;
  getProposal(id: string): Promise<Proposal | undefined>;
  createProposal(data: InsertProposal): Promise<Proposal>;
  updateProposal(id: string, data: Partial<Proposal>): Promise<Proposal | undefined>;
  getProposalVotes(proposalId: string): Promise<ProposalVote[]>;
  castProposalVote(data: { proposalId: string; userId: string; voterName: string; vote: string }): Promise<ProposalVote>;

  // Attachments (إيصالات وفواتير)
  getAttachments(entityType: string, entityId: string): Promise<Omit<Attachment, "content" | "storageKey" | "storageUrl">[]>;
  getAttachment(id: string): Promise<Attachment | undefined>;
  createAttachment(data: Omit<Attachment, "id" | "createdAt">): Promise<Omit<Attachment, "content">>;
  deleteAttachment(id: string): Promise<void>;

  // Contribution rates (الاشتراك الشهري بتواريخ سريانه)
  getContributionRates(): Promise<ContributionRate[]>;
  createContributionRate(data: InsertContributionRate): Promise<ContributionRate>;
  deleteContributionRate(id: string): Promise<void>;

  // Push subscriptions (اشتراكات أجهزة الإشعارات)
  getPushSubscriptions(userIds?: string[]): Promise<PushSubscription[]>;
  savePushSubscription(data: InsertPushSubscription): Promise<PushSubscription>;
  deletePushSubscription(endpoint: string): Promise<void>;
  touchPushSubscription(endpoint: string): Promise<void>;

  // Notifications (سجل الإشعارات المرسلة والمجدولة)
  getNotifications(limit?: number): Promise<Notification[]>;
  getNotification(id: string): Promise<Notification | undefined>;
  getDueNotifications(now: Date): Promise<Notification[]>;
  createNotification(data: InsertNotification & { status: string; createdByName?: string | null }): Promise<Notification>;
  updateNotification(id: string, data: Partial<Notification>): Promise<Notification | undefined>;
  claimScheduledNotification(id: string): Promise<Notification | undefined>;
  /** يسجّل تذكيراً تلقائياً، ويعيد undefined إن كان قد أُرسل من قبل */
  createReminderOnce(data: InsertNotification & { status: string; dedupeKey: string }): Promise<Notification | undefined>;

  // System Reset
  resetSystemData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Members
  async getMembers(): Promise<Member[]> {
    return await db.select().from(members).orderBy(desc(members.createdAt));
  }

  async getMember(id: string): Promise<Member | undefined> {
    const [member] = await db.select().from(members).where(eq(members.id, id));
    return member;
  }

  async createMember(member: InsertMember): Promise<Member> {
    const [created] = await db.insert(members).values(member).returning();
    return created;
  }

  async updateMember(id: string, member: Partial<InsertMember>): Promise<Member | undefined> {
    const [updated] = await db.update(members).set(member).where(eq(members.id, id)).returning();
    return updated;
  }

  /**
   * حذف العضو — ولا يمسّ سجلاً مالياً.
   *
   * كانت هذه الدالة تحذف سلف العضو وأقساطه وسداداته ومساهماته ثم تحذفه: أمرٌ
   * يمحو تاريخ مال دخل الصندوق وخرج منه. ولهذا عُطِّل المسار كله من قبل، فلم
   * يبقَ للوصي سبيل إلى إزالة عضو أُضيف خطأً. الآن يُفحص أثر العضو أولاً،
   * فلا يُحذف إلا من لا أثر له — ومن له أثر يُؤرشَف.
   */
  async deleteMember(id: string): Promise<void> {
    await db.transaction(async (tx: any) => {
      const footprint = await this.memberFootprint(id);
      if (footprint.total > 0) {
        throw new Error("لا يُحذف عضو له سجل مالي — يُؤرشَف");
      }
      await tx.delete(members).where(eq(members.id, id));
    });
  }

  async memberFootprint(id: string): Promise<MemberFootprint> {
    const [memberContributions, memberLoans, linkedUsers] = await Promise.all([
      db.select({ id: contributions.id }).from(contributions).where(eq(contributions.memberId, id)),
      db.select({ id: loans.id }).from(loans).where(eq(loans.memberId, id)),
      db.select({ id: users.id }).from(users).where(eq(users.memberId, id)),
    ]);

    const counts = {
      contributions: memberContributions.length,
      loans: memberLoans.length,
      accounts: linkedUsers.length,
    };
    return { ...counts, total: counts.contributions + counts.loans + counts.accounts };
  }

  async setMemberArchived(id: string, archived: boolean): Promise<Member | undefined> {
    const [updated] = await db.update(members)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(members.id, id))
      .returning();
    return updated;
  }

  // Contributions
  async getContributions(): Promise<Contribution[]> {
    return await db.select().from(contributions).orderBy(desc(contributions.createdAt));
  }

  async getContributionsByMember(memberId: string): Promise<Contribution[]> {
    return await db.select().from(contributions).where(eq(contributions.memberId, memberId));
  }

  async getContribution(id: string): Promise<Contribution | undefined> {
    const [contribution] = await db.select().from(contributions).where(eq(contributions.id, id));
    return contribution;
  }

  async getContributionsByYear(year: number): Promise<Contribution[]> {
    return await db.select().from(contributions).where(eq(contributions.year, year));
  }

  async getApprovedContributionsByYear(year: number): Promise<Contribution[]> {
    return await db.select().from(contributions).where(
      and(eq(contributions.year, year), eq(contributions.status, "approved"))
    );
  }

  async getContributionsByYearAndMonth(year: number, month: number): Promise<Contribution[]> {
    return await db.select().from(contributions).where(
      and(eq(contributions.year, year), eq(contributions.month, month))
    );
  }

  async getContributionByMemberYearMonth(memberId: string, year: number, month: number): Promise<Contribution | undefined> {
    const [contribution] = await db.select().from(contributions).where(
      and(eq(contributions.memberId, memberId), eq(contributions.year, year), eq(contributions.month, month))
    );
    return contribution;
  }

  async createContribution(contribution: InsertContribution): Promise<Contribution> {
    const [created] = await db.insert(contributions).values(contribution).returning();
    return created;
  }

  async approveContribution(id: string): Promise<Contribution | undefined> {
    const [updated] = await db.update(contributions)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(contributions.id, id))
      .returning();
    return updated;
  }

  async deleteContribution(id: string): Promise<Contribution | undefined> {
    const [deleted] = await db.delete(contributions).where(eq(contributions.id, id)).returning();
    return deleted;
  }

  // Loans
  async getLoans(): Promise<Loan[]> {
    return await db.select().from(loans).orderBy(desc(loans.createdAt));
  }

  async getLoansByMember(memberId: string): Promise<Loan[]> {
    return await db.select().from(loans).where(eq(loans.memberId, memberId));
  }

  async getLoan(id: string): Promise<Loan | undefined> {
    const [loan] = await db.select().from(loans).where(eq(loans.id, id)).limit(1);
    return loan;
  }

  async updateLoan(id: string, data: Partial<InsertLoan>): Promise<Loan | undefined> {
    const [updated] = await db.update(loans).set(data).where(eq(loans.id, id)).returning();
    return updated;
  }

  /**
   * سلف السنة بتاريخها الفعّال: تاريخ الاعتماد إن اعتُمدت، وإلا تاريخ الطلب.
   *
   * كان الاستعلام يجلب ما أُنشئ في السنة ثم يصفّيه بالتاريخ الفعّال — فسلفة
   * طُلبت في ديسمبر واعتُمدت في يناير تسقط من تقارير السنتين معاً: تُجلب
   * للأولى ثم تُصفّى، ولا تُجلب للثانية أصلاً. الشرط الآن على التاريخ الفعّال
   * نفسه، فلا تضيع سلفة عبرت حدّ السنة.
   */
  async getLoansByYear(year: number): Promise<Loan[]> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    return await db.select().from(loans).where(
      or(
        and(gte(loans.approvedAt, startDate), lt(loans.approvedAt, endDate)),
        and(
          isNull(loans.approvedAt),
          gte(loans.createdAt, startDate),
          lt(loans.createdAt, endDate),
        ),
      ),
    );
  }

  async createLoan(loan: InsertLoan): Promise<Loan> {
    const [created] = await db.insert(loans).values(loan).returning();
    return created;
  }

  async updateLoanStatus(id: string, status: string): Promise<Loan | undefined> {
    const updateData: any = { status };
    if (status === "approved") {
      updateData.approvedAt = new Date();
    }
    const [updated] = await db.update(loans).set(updateData).where(eq(loans.id, id)).returning();
    return updated;
  }

  async deleteLoan(id: string): Promise<void> {
    await db.delete(loanVotes).where(eq(loanVotes.loanId, id));
    await db.delete(loanPayments).where(eq(loanPayments.loanId, id));
    await db.delete(loanRepayments).where(eq(loanRepayments.loanId, id));
    await db.delete(loans).where(eq(loans.id, id));
  }

  async getLoanVotes(loanId: string): Promise<LoanVote[]> {
    return db.select().from(loanVotes).where(eq(loanVotes.loanId, loanId)).orderBy(desc(loanVotes.createdAt));
  }

  async castLoanVote(data: { loanId: string; userId: string; voterName: string; vote: string }): Promise<LoanVote> {
    const [vote] = await db.insert(loanVotes)
      .values(data)
      .onConflictDoUpdate({
        target: [loanVotes.loanId, loanVotes.userId],
        set: { vote: data.vote, voterName: data.voterName, createdAt: new Date() },
      })
      .returning();
    return vote;
  }

  async countEligibleVoters(excludeMemberId?: string | null): Promise<number> {
    const [rows, archived] = await Promise.all([
      db.select({ memberId: users.memberId }).from(users),
      // العضو المؤرشَف خرج من العائلة، فلا يُحسب في النصاب — وإلا صار نصاباً
      // لا يمكن بلوغه لأن أحد أطرافه لم يعد يشارك
      db.select({ id: members.id }).from(members).where(isNotNull(members.archivedAt)),
    ]);
    const archivedIds = new Set(archived.map((m) => m.id));
    const unique = new Set(
      rows
        .map((r) => r.memberId)
        .filter((m): m is string => !!m && m !== excludeMemberId && !archivedIds.has(m)),
    );
    return unique.size;
  }

  async getVoterMemberships(): Promise<Map<string, string | null>> {
    const rows = await db.select({ id: users.id, memberId: users.memberId }).from(users);
    return new Map(rows.map((r) => [r.id, r.memberId]));
  }

  // Loan Repayments
  async getLoanRepayments(loanId: string): Promise<LoanRepayment[]> {
    return await db.select().from(loanRepayments).where(eq(loanRepayments.loanId, loanId)).orderBy(loanRepayments.installmentNumber);
  }

  async getAllLoanRepayments(): Promise<LoanRepayment[]> {
    return await db.select().from(loanRepayments);
  }

  async createLoanRepayments(repayments: InsertLoanRepayment[]): Promise<LoanRepayment[]> {
    if (repayments.length === 0) return [];
    return await db.insert(loanRepayments).values(repayments).returning();
  }

  // شرط status <> 'paid' يجعل العملية غير قابلة للتكرار: ضغطتان على "تم السداد"
  // كانتا تنشئان سجلَي سداد لنفس القسط فيتضخم المسدَّد. الآن الثانية لا تُطابق صفاً.
  async markRepaymentPaid(id: string): Promise<LoanRepayment | undefined> {
    const [updated] = await db.update(loanRepayments)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(loanRepayments.id, id), ne(loanRepayments.status, "paid")))
      .returning();
    return updated;
  }

  async getLoanPayments(loanId: string): Promise<LoanPayment[]> {
    return await db.select().from(loanPayments).where(eq(loanPayments.loanId, loanId)).orderBy(desc(loanPayments.paidAt));
  }

  async getLoanPayment(id: string): Promise<LoanPayment | undefined> {
    const [payment] = await db.select().from(loanPayments).where(eq(loanPayments.id, id));
    return payment;
  }

  async createLoanPayment(payment: InsertLoanPayment): Promise<LoanPayment> {
    const [created] = await db.insert(loanPayments).values(payment).returning();
    return created;
  }

  // كان كل تقرير يحمّل جدول الدفعات كاملاً ثم يمسحه من جديد لكل سلفة —
  // أي عمل بحجم (عدد السلف × عدد الدفعات). التجميع هنا يقع في قاعدة البيانات
  // مرة واحدة، ويُقرأ بعدها بمفتاح.
  async getPaidTotalsByLoan(): Promise<Map<string, number>> {
    const rows = await db
      .select({
        loanId: loanPayments.loanId,
        total: sql<string>`sum(${loanPayments.amount})`,
      })
      .from(loanPayments)
      .groupBy(loanPayments.loanId);
    return new Map(rows.map((row) => [row.loanId, Number(row.total)]));
  }

  async getRepaidTotalOnApprovedLoans(): Promise<number> {
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${loanPayments.amount}), 0)` })
      .from(loanPayments)
      .innerJoin(loans, eq(loanPayments.loanId, loans.id))
      .where(eq(loans.status, "approved"));
    return Number(row?.total ?? 0);
  }

  async getRepaymentsInYear(year: number): Promise<LoanPayment[]> {
    return await this.repaymentsBetween(new Date(year, 0, 1), new Date(year + 1, 0, 1));
  }

  async getRepaymentsInMonth(year: number, month: number): Promise<LoanPayment[]> {
    return await this.repaymentsBetween(new Date(year, month - 1, 1), new Date(year, month, 1));
  }

  /** السداد على السلف المعتمدة وحدها — نفس ما يعدّه الرصيد، فلا يختلف تقرير عن رصيد */
  private async repaymentsBetween(from: Date, to: Date): Promise<LoanPayment[]> {
    const rows = await db
      .select({ payment: loanPayments })
      .from(loanPayments)
      .innerJoin(loans, eq(loanPayments.loanId, loans.id))
      .where(
        and(
          eq(loans.status, "approved"),
          gte(loanPayments.paidAt, from),
          lt(loanPayments.paidAt, to),
        ),
      );
    return rows.map((row) => row.payment);
  }

  async getLoanPaymentsForLoans(loanIds: string[]): Promise<LoanPayment[]> {
    if (loanIds.length === 0) return [];
    return await db.select().from(loanPayments)
      .where(inArray(loanPayments.loanId, loanIds))
      .orderBy(desc(loanPayments.paidAt));
  }

  async getLoanRepaymentsForLoans(loanIds: string[]): Promise<LoanRepayment[]> {
    if (loanIds.length === 0) return [];
    return await db.select().from(loanRepayments)
      .where(inArray(loanRepayments.loanId, loanIds))
      .orderBy(loanRepayments.installmentNumber);
  }

  // Expenses
  async getExpenses(): Promise<Expense[]> {
    return await db.select().from(expenses).orderBy(desc(expenses.createdAt));
  }

  async getExpense(id: string): Promise<Expense | undefined> {
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, id));
    return expense;
  }

  async getExpensesByYear(year: number): Promise<Expense[]> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);
    // نهاية المدى مفتوحة: lte تجعل مصروفاً وقع في أول لحظة من السنة التالية
    // يُحسب في السنتين معاً
    return await db.select().from(expenses).where(
      and(gte(expenses.createdAt, startDate), lt(expenses.createdAt, endDate))
    );
  }

  async createExpense(expense: InsertExpense): Promise<Expense> {
    const [created] = await db.insert(expenses).values(expense).returning();
    return created;
  }

  async deleteExpense(id: string): Promise<void> {
    await db.delete(expenses).where(eq(expenses.id, id));
  }

  // Fund Adjustments
  async getFundAdjustments(): Promise<FundAdjustment[]> {
    return await db.select().from(fundAdjustments).orderBy(desc(fundAdjustments.createdAt));
  }

  async createFundAdjustment(adjustment: InsertFundAdjustment): Promise<FundAdjustment> {
    const [created] = await db.insert(fundAdjustments).values(adjustment).returning();
    return created;
  }

  async deleteFundAdjustment(id: string): Promise<void> {
    await db.delete(fundAdjustments).where(eq(fundAdjustments.id, id));
  }

  // Family Settings
  async getFamilySettings(): Promise<FamilySettings | undefined> {
    const [settings] = await db.select().from(familySettings).limit(1);
    return settings;
  }

  async updateFamilySettings(settings: Partial<InsertFamilySettings>): Promise<FamilySettings> {
    const existing = await this.getFamilySettings();
    if (existing) {
      const [updated] = await db.update(familySettings).set(settings).where(eq(familySettings.id, existing.id)).returning();
      return updated;
    } else {
      const [created] = await db.insert(familySettings).values(settings as InsertFamilySettings).returning();
      return created;
    }
  }

  // Audit Logs
  async getAuditLogs(page = 1, limit = 50): Promise<{ data: AuditLog[]; total: number; page: number; limit: number; totalPages: number }> {
    const offset = (page - 1) * limit;
    const [data, countResult] = await Promise.all([
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(auditLogs),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values({
      ...log,
      metadata: log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
        ? (log.metadata as Record<string, unknown>)
        : null,
    }).returning();
    return created;
  }

  async createResetRequest(username: string, userId: string | null): Promise<PasswordResetRequest> {
    const [created] = await db.insert(passwordResetRequests).values({ username, userId }).returning();
    return created;
  }

  async getPendingResetRequests(): Promise<PasswordResetRequest[]> {
    return db.select().from(passwordResetRequests)
      .where(sql`${passwordResetRequests.status} in ('pending', 'code_issued')`)
      .orderBy(desc(passwordResetRequests.requestedAt));
  }

  async getResetRequest(id: string): Promise<PasswordResetRequest | undefined> {
    const [row] = await db.select().from(passwordResetRequests).where(eq(passwordResetRequests.id, id)).limit(1);
    return row;
  }

  async getActiveResetRequestByUsername(username: string): Promise<PasswordResetRequest | undefined> {
    const [row] = await db.select().from(passwordResetRequests)
      .where(and(eq(passwordResetRequests.username, username), eq(passwordResetRequests.status, "code_issued")))
      .orderBy(desc(passwordResetRequests.requestedAt))
      .limit(1);
    return row;
  }

  async updateResetRequest(id: string, data: Partial<PasswordResetRequest>): Promise<PasswordResetRequest | undefined> {
    const [updated] = await db.update(passwordResetRequests).set(data).where(eq(passwordResetRequests.id, id)).returning();
    return updated;
  }

  // Zakat
  async getZakatCycles(): Promise<ZakatCycle[]> {
    return await db.select().from(zakatCycles).orderBy(desc(zakatCycles.cycleStart));
  }

  async getZakatCycle(id: string): Promise<ZakatCycle | undefined> {
    const [row] = await db.select().from(zakatCycles).where(eq(zakatCycles.id, id));
    return row;
  }

  // الدورة الجارية: أي دورة لم تُخرَج زكاتها بعد
  async getOpenZakatCycle(): Promise<ZakatCycle | undefined> {
    const [row] = await db.select().from(zakatCycles)
      .where(sql`${zakatCycles.status} <> 'paid'`)
      .orderBy(desc(zakatCycles.cycleStart)).limit(1);
    return row;
  }

  async createZakatCycle(data: { cycleStart: Date; note?: string | null }): Promise<ZakatCycle> {
    const [created] = await db.insert(zakatCycles).values({
      cycleStart: data.cycleStart,
      note: data.note ?? null,
    }).returning();
    return created;
  }

  async updateZakatCycle(id: string, data: Partial<ZakatCycle>): Promise<ZakatCycle | undefined> {
    const [updated] = await db.update(zakatCycles).set(data).where(eq(zakatCycles.id, id)).returning();
    return updated;
  }

  // Investments
  async getInvestments(): Promise<Investment[]> {
    return await db.select().from(investments).orderBy(desc(investments.startedAt));
  }

  async getInvestment(id: string): Promise<Investment | undefined> {
    const [row] = await db.select().from(investments).where(eq(investments.id, id));
    return row;
  }

  async createInvestment(data: InsertInvestment): Promise<Investment> {
    const [created] = await db.insert(investments).values(data).returning();
    return created;
  }

  async updateInvestment(id: string, data: Partial<Investment>): Promise<Investment | undefined> {
    const [updated] = await db.update(investments).set(data).where(eq(investments.id, id)).returning();
    return updated;
  }

  async deleteInvestment(id: string): Promise<void> {
    await db.delete(investmentValuations).where(eq(investmentValuations.investmentId, id));
    await db.delete(investments).where(eq(investments.id, id));
  }

  async getInvestmentValuations(investmentId?: string): Promise<InvestmentValuation[]> {
    const query = db.select().from(investmentValuations);
    const rows = investmentId
      ? await query.where(eq(investmentValuations.investmentId, investmentId))
      : await query;
    return rows.sort((a, b) => new Date(a.valuedAt).getTime() - new Date(b.valuedAt).getTime());
  }

  async createInvestmentValuation(data: InsertInvestmentValuation): Promise<InvestmentValuation> {
    const [created] = await db.insert(investmentValuations).values(data).returning();
    return created;
  }

  // Proposals
  async getProposals(): Promise<Proposal[]> {
    return await db.select().from(proposals).orderBy(desc(proposals.createdAt));
  }

  async getProposal(id: string): Promise<Proposal | undefined> {
    const [row] = await db.select().from(proposals).where(eq(proposals.id, id));
    return row;
  }

  async createProposal(data: InsertProposal): Promise<Proposal> {
    const [created] = await db.insert(proposals).values(data).returning();
    return created;
  }

  async updateProposal(id: string, data: Partial<Proposal>): Promise<Proposal | undefined> {
    const [updated] = await db.update(proposals).set(data).where(eq(proposals.id, id)).returning();
    return updated;
  }

  async getProposalVotes(proposalId: string): Promise<ProposalVote[]> {
    return await db.select().from(proposalVotes).where(eq(proposalVotes.proposalId, proposalId));
  }

  // الصوت الواحد لكل عضو — تغيير الرأي يستبدل الصوت لا يضيف صوتاً جديداً
  async castProposalVote(data: { proposalId: string; userId: string; voterName: string; vote: string }): Promise<ProposalVote> {
    const [row] = await db.insert(proposalVotes).values(data)
      .onConflictDoUpdate({
        target: [proposalVotes.proposalId, proposalVotes.userId],
        set: { vote: data.vote, voterName: data.voterName, createdAt: new Date() },
      })
      .returning();
    return row;
  }

  // Attachments — المحتوى ثقيل، فلا يُجلب إلا عند التنزيل
  async getAttachments(entityType: string, entityId: string): Promise<Omit<Attachment, "content" | "storageKey" | "storageUrl">[]> {
    return await db.select({
      id: attachments.id,
      entityType: attachments.entityType,
      entityId: attachments.entityId,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      createdAt: attachments.createdAt,
      createdBy: attachments.createdBy,
    }).from(attachments)
      .where(and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)))
      .orderBy(desc(attachments.createdAt));
  }

  async getAttachment(id: string): Promise<Attachment | undefined> {
    const [row] = await db.select().from(attachments).where(eq(attachments.id, id));
    return row;
  }

  async createAttachment(data: Omit<Attachment, "id" | "createdAt">): Promise<Omit<Attachment, "content">> {
    const [created] = await db.insert(attachments).values(data).returning({
      id: attachments.id,
      entityType: attachments.entityType,
      entityId: attachments.entityId,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      storageKey: attachments.storageKey,
      storageUrl: attachments.storageUrl,
      createdAt: attachments.createdAt,
      createdBy: attachments.createdBy,
    });
    return created;
  }

  async deleteAttachment(id: string): Promise<void> {
    await db.delete(attachments).where(eq(attachments.id, id));
  }

  // Contribution rates
  async getContributionRates(): Promise<ContributionRate[]> {
    return await db.select().from(contributionRates)
      .orderBy(desc(contributionRates.effectiveYear), desc(contributionRates.effectiveMonth));
  }

  // تسجيل السعر نفسه لشهر السريان ذاته يستبدل السابق بدل أن يتضاعف
  async createContributionRate(data: InsertContributionRate): Promise<ContributionRate> {
    const [row] = await db.insert(contributionRates).values(data)
      .onConflictDoUpdate({
        target: [contributionRates.memberId, contributionRates.effectiveYear, contributionRates.effectiveMonth],
        set: { amount: data.amount, note: data.note ?? null, createdAt: new Date(), createdBy: data.createdBy ?? null },
      })
      .returning();
    return row;
  }

  async deleteContributionRate(id: string): Promise<void> {
    await db.delete(contributionRates).where(eq(contributionRates.id, id));
  }

  async resetSystemData(): Promise<void> {
    await db.transaction(async (tx: any) => {
      await tx.update(familySettings).set({
        familyName: "صندوق العائلة",
        currency: "ر.ع",
        protectedPercent: 45,
        emergencyPercent: 15,
        flexiblePercent: 20,
        growthPercent: 20,
        backupEnabled: false,
        backupKeepDays: 7,
        backupKeepWeeksPerMonth: 4,
        backupKeepMonths: 12,
        backupLastRunAt: null,
      });

      await tx.delete(auditLogs);
      await tx.delete(systemBackups);
      await tx.delete(contributionRates);
      await tx.delete(attachments);
      await tx.delete(proposalVotes);
      await tx.delete(proposals);
      await tx.delete(investmentValuations);
      await tx.delete(investments);
      await tx.delete(zakatCycles);
      await tx.delete(capitalAllocations);
      await tx.delete(loanPayments);
      await tx.delete(loanRepayments);
      await tx.delete(loans);
      await tx.delete(contributions);
      await tx.delete(expenses);
      await tx.delete(fundAdjustments);
      await tx.update(users).set({ memberId: null });
      await tx.delete(members);
    });
  }

  // ————— Push subscriptions —————

  async getPushSubscriptions(userIds?: string[]): Promise<PushSubscription[]> {
    if (userIds) {
      if (userIds.length === 0) return [];
      return await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
    }
    return await db.select().from(pushSubscriptions);
  }

  // الجهاز نفسه قد يعيد الاشتراك بعد تجديد المتصفح لمفاتيحه — نحدّث صفه بدل تكديس صفوف ميتة
  async savePushSubscription(data: InsertPushSubscription): Promise<PushSubscription> {
    const [saved] = await db.insert(pushSubscriptions)
      .values(data)
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: data.userId,
          p256dh: data.p256dh,
          auth: data.auth,
          platform: data.platform ?? null,
          userAgent: data.userAgent ?? null,
          lastUsedAt: new Date(),
        },
      })
      .returning();
    return saved;
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async touchPushSubscription(endpoint: string): Promise<void> {
    await db.update(pushSubscriptions)
      .set({ lastUsedAt: new Date() })
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  // ————— Notifications —————

  async getNotifications(limit = 100): Promise<Notification[]> {
    return await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
  }

  async getNotification(id: string): Promise<Notification | undefined> {
    const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
    return row;
  }

  async getDueNotifications(now: Date): Promise<Notification[]> {
    return await db.select().from(notifications).where(
      and(eq(notifications.status, "scheduled"), lte(notifications.scheduledAt, now)),
    );
  }

  async createNotification(
    data: InsertNotification & { status: string; createdByName?: string | null },
  ): Promise<Notification> {
    const [created] = await db.insert(notifications).values(data as any).returning();
    return created;
  }

  async updateNotification(id: string, data: Partial<Notification>): Promise<Notification | undefined> {
    const [updated] = await db.update(notifications).set(data).where(eq(notifications.id, id)).returning();
    return updated;
  }

  // الفهرس الفريد على dedupe_key هو ما يمنع تكرار التذكير: المحاولة الثانية
  // لا تُدرج صفاً ولا تُرجع شيئاً، فلا يُرسل التنبيه نفسه مرتين مهما تكررت الدورة.
  async createReminderOnce(
    data: InsertNotification & { status: string; dedupeKey: string },
  ): Promise<Notification | undefined> {
    const [created] = await db.insert(notifications)
      .values(data as any)
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning();
    return created;
  }

  // حجز إشعار مجدول قبل إرساله. الشرط على الحالة هو ما يمنع إرساله مرتين
  // لو تداخلت دورتا الجدولة أو عملت أكثر من نسخة من الخادم.
  async claimScheduledNotification(id: string): Promise<Notification | undefined> {
    const [claimed] = await db.update(notifications)
      .set({ status: "sending" })
      .where(and(eq(notifications.id, id), eq(notifications.status, "scheduled")))
      .returning();
    return claimed;
  }
}

export const storage = new DatabaseStorage();
