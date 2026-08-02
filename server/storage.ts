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
  type Attachment, attachments
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { db } from "./db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // Members
  getMembers(): Promise<Member[]>;
  getMember(id: string): Promise<Member | undefined>;
  createMember(member: InsertMember): Promise<Member>;
  updateMember(id: string, member: Partial<InsertMember>): Promise<Member | undefined>;
  deleteMember(id: string): Promise<void>;

  // Contributions
  getContributions(): Promise<Contribution[]>;
  getContributionsByMember(memberId: string): Promise<Contribution[]>;
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
  getAllLoanPayments(): Promise<LoanPayment[]>;
  createLoanPayment(payment: InsertLoanPayment): Promise<LoanPayment>;

  // Expenses
  getExpenses(): Promise<Expense[]>;
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
  getAttachments(entityType: string, entityId: string): Promise<Omit<Attachment, "content">[]>;
  getAttachment(id: string): Promise<Attachment | undefined>;
  createAttachment(data: Omit<Attachment, "id" | "createdAt">): Promise<Omit<Attachment, "content">>;
  deleteAttachment(id: string): Promise<void>;

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

  async deleteMember(id: string): Promise<void> {
    await db.transaction(async (tx: any) => {
      const memberLoans = await tx.select({ id: loans.id }).from(loans).where(eq(loans.memberId, id));
      for (const loan of memberLoans) {
        await tx.delete(loanRepayments).where(eq(loanRepayments.loanId, loan.id));
        await tx.delete(loanPayments).where(eq(loanPayments.loanId, loan.id));
      }
      await tx.delete(loans).where(eq(loans.memberId, id));
      await tx.delete(contributions).where(eq(contributions.memberId, id));
      await tx.delete(members).where(eq(members.id, id));
    });
  }

  // Contributions
  async getContributions(): Promise<Contribution[]> {
    return await db.select().from(contributions).orderBy(desc(contributions.createdAt));
  }

  async getContributionsByMember(memberId: string): Promise<Contribution[]> {
    return await db.select().from(contributions).where(eq(contributions.memberId, memberId));
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

  async getLoansByYear(year: number): Promise<Loan[]> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);
    const yearLoans = await db.select().from(loans).where(
      and(gte(loans.createdAt, startDate), lte(loans.createdAt, endDate))
    );

    return yearLoans.filter((loan: Loan) => {
      const effectiveDate = loan.approvedAt || loan.createdAt;
      return effectiveDate ? effectiveDate >= startDate && effectiveDate < endDate : false;
    });
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
    const rows = await db.select({ memberId: users.memberId }).from(users);
    const unique = new Set(rows.map(r => r.memberId).filter((m): m is string => !!m && m !== excludeMemberId));
    return unique.size;
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

  async markRepaymentPaid(id: string): Promise<LoanRepayment | undefined> {
    const [updated] = await db.update(loanRepayments)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(loanRepayments.id, id))
      .returning();
    return updated;
  }

  async getLoanPayments(loanId: string): Promise<LoanPayment[]> {
    return await db.select().from(loanPayments).where(eq(loanPayments.loanId, loanId)).orderBy(desc(loanPayments.paidAt));
  }

  async getAllLoanPayments(): Promise<LoanPayment[]> {
    return await db.select().from(loanPayments).orderBy(desc(loanPayments.paidAt));
  }

  async createLoanPayment(payment: InsertLoanPayment): Promise<LoanPayment> {
    const [created] = await db.insert(loanPayments).values(payment).returning();
    return created;
  }

  // Expenses
  async getExpenses(): Promise<Expense[]> {
    return await db.select().from(expenses).orderBy(desc(expenses.createdAt));
  }

  async getExpensesByYear(year: number): Promise<Expense[]> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);
    return await db.select().from(expenses).where(
      and(gte(expenses.createdAt, startDate), lte(expenses.createdAt, endDate))
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
  async getAttachments(entityType: string, entityId: string): Promise<Omit<Attachment, "content">[]> {
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
      createdAt: attachments.createdAt,
      createdBy: attachments.createdBy,
    });
    return created;
  }

  async deleteAttachment(id: string): Promise<void> {
    await db.delete(attachments).where(eq(attachments.id, id));
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
}

export const storage = new DatabaseStorage();
