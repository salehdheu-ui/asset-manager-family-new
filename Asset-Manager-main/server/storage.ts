import { 
  type Member, type InsertMember, members,
  type Contribution, type InsertContribution, contributions,
  type Loan, type InsertLoan, loans,
  type LoanRepayment, type InsertLoanRepayment, loanRepayments,
  type Expense, type InsertExpense, expenses,
  type FamilySettings, type InsertFamilySettings, familySettings,
  type FundAdjustment, type InsertFundAdjustment, fundAdjustments
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

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
  createContribution(contribution: InsertContribution): Promise<Contribution>;
  approveContribution(id: string): Promise<Contribution | undefined>;
  deleteContribution(id: string): Promise<void>;

  // Loans
  getLoans(): Promise<Loan[]>;
  getLoansByMember(memberId: string): Promise<Loan[]>;
  createLoan(loan: InsertLoan): Promise<Loan>;
  updateLoanStatus(id: string, status: string): Promise<Loan | undefined>;
  deleteLoan(id: string): Promise<void>;

  // Loan Repayments
  getLoanRepayments(loanId: string): Promise<LoanRepayment[]>;
  createLoanRepayments(repayments: InsertLoanRepayment[]): Promise<LoanRepayment[]>;
  markRepaymentPaid(id: string): Promise<LoanRepayment | undefined>;

  // Expenses
  getExpenses(): Promise<Expense[]>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  deleteExpense(id: string): Promise<void>;

  // Fund Adjustments
  getFundAdjustments(): Promise<FundAdjustment[]>;
  createFundAdjustment(adjustment: InsertFundAdjustment): Promise<FundAdjustment>;
  deleteFundAdjustment(id: string): Promise<void>;

  // Family Settings
  getFamilySettings(): Promise<FamilySettings | undefined>;
  updateFamilySettings(settings: Partial<InsertFamilySettings>): Promise<FamilySettings>;
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
    await db.transaction(async (tx) => {
      const memberLoans = await tx.select({ id: loans.id }).from(loans).where(eq(loans.memberId, id));
      for (const loan of memberLoans) {
        await tx.delete(loanRepayments).where(eq(loanRepayments.loanId, loan.id));
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

  async deleteContribution(id: string): Promise<void> {
    await db.delete(contributions).where(eq(contributions.id, id));
  }

  // Loans
  async getLoans(): Promise<Loan[]> {
    return await db.select().from(loans).orderBy(desc(loans.createdAt));
  }

  async getLoansByMember(memberId: string): Promise<Loan[]> {
    return await db.select().from(loans).where(eq(loans.memberId, memberId));
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
    await db.delete(loanRepayments).where(eq(loanRepayments.loanId, id));
    await db.delete(loans).where(eq(loans.id, id));
  }

  // Loan Repayments
  async getLoanRepayments(loanId: string): Promise<LoanRepayment[]> {
    return await db.select().from(loanRepayments).where(eq(loanRepayments.loanId, loanId)).orderBy(loanRepayments.installmentNumber);
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

  // Expenses
  async getExpenses(): Promise<Expense[]> {
    return await db.select().from(expenses).orderBy(desc(expenses.createdAt));
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
}

export const storage = new DatabaseStorage();
