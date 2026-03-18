import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Export auth models (required for Replit Auth)
export * from "./models/auth";

// Family Members
export const members = pgTable("members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"), // 'guardian' | 'custodian' | 'member'
  avatar: text("avatar"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMemberSchema = createInsertSchema(members).omit({ id: true, createdAt: true }).extend({
  role: z.enum(["guardian", "custodian", "member"]).default("member"),
});
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof members.$inferSelect;

// Monthly Contributions
export const contributions = pgTable("contributions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => members.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  amount: decimal("amount", { precision: 10, scale: 3 }).notNull(),
  status: text("status").notNull().default("pending_approval"), // 'pending_approval' | 'approved'
  createdAt: timestamp("created_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
});

export const insertContributionSchema = createInsertSchema(contributions).omit({ id: true, createdAt: true, approvedAt: true }).extend({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  status: z.enum(["pending_approval", "approved"]).default("pending_approval"),
});
export type InsertContribution = z.infer<typeof insertContributionSchema>;
export type Contribution = typeof contributions.$inferSelect;

// Loans
export const loans = pgTable("loans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => members.id),
  type: text("type").notNull(), // 'urgent' | 'standard' | 'emergency'
  title: text("title").notNull(),
  amount: decimal("amount", { precision: 10, scale: 3 }).notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  repaymentMonths: integer("repayment_months").default(12),
  createdAt: timestamp("created_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
});

export const insertLoanSchema = createInsertSchema(loans).omit({ id: true, createdAt: true, approvedAt: true }).extend({
  type: z.enum(["urgent", "standard", "emergency"]),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
});
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type Loan = typeof loans.$inferSelect;

// Loan Repayments
export const loanRepayments = pgTable("loan_repayments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: varchar("loan_id").notNull().references(() => loans.id),
  installmentNumber: integer("installment_number").notNull(),
  amount: decimal("amount", { precision: 10, scale: 3 }).notNull(),
  dueDate: timestamp("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  status: text("status").notNull().default("scheduled"), // 'scheduled' | 'paid' | 'overdue'
});

export const insertLoanRepaymentSchema = createInsertSchema(loanRepayments).omit({ id: true }).extend({
  status: z.enum(["scheduled", "paid", "overdue"]).default("scheduled"),
});
export type InsertLoanRepayment = z.infer<typeof insertLoanRepaymentSchema>;
export type LoanRepayment = typeof loanRepayments.$inferSelect;

// Expenses
export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  amount: decimal("amount", { precision: 10, scale: 3 }).notNull(),
  category: text("category").notNull(), // 'zakat' | 'charity' | 'general' | 'emergency'
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true }).extend({
  category: z.enum(["zakat", "charity", "general", "emergency"]),
});
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// Family Settings
export const familySettings = pgTable("family_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyName: text("family_name").notNull().default("صندوق العائلة"),
  currency: text("currency").notNull().default("ر.ع"),
  protectedPercent: integer("protected_percent").notNull().default(45),
  emergencyPercent: integer("emergency_percent").notNull().default(15),
  flexiblePercent: integer("flexible_percent").notNull().default(20),
  growthPercent: integer("growth_percent").notNull().default(20),
  backupEnabled: boolean("backup_enabled").notNull().default(false),
  backupKeepDays: integer("backup_keep_days").notNull().default(7),
  backupKeepWeeksPerMonth: integer("backup_keep_weeks_per_month").notNull().default(4),
  backupKeepMonths: integer("backup_keep_months").notNull().default(12),
  backupLastRunAt: timestamp("backup_last_run_at"),
});

export const insertFamilySettingsSchema = createInsertSchema(familySettings).omit({ id: true });
export type InsertFamilySettings = z.infer<typeof insertFamilySettingsSchema>;
export type FamilySettings = typeof familySettings.$inferSelect;

export const systemBackups = pgTable("system_backups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  storagePath: text("storage_path").notNull(),
  backupDate: timestamp("backup_date").notNull().defaultNow(),
  backupLevel: text("backup_level").notNull().default("snapshot"),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  weekOfMonth: integer("week_of_month"),
  isMonthEndSnapshot: boolean("is_month_end_snapshot").notNull().default(false),
  sizeBytes: integer("size_bytes"),
  createdBy: varchar("created_by"),
});

export const insertSystemBackupSchema = createInsertSchema(systemBackups).omit({ id: true });
export type InsertSystemBackup = z.infer<typeof insertSystemBackupSchema>;
export type SystemBackup = typeof systemBackups.$inferSelect;

// Fund Adjustments (admin direct deposits/withdrawals)
export const fundAdjustments = pgTable("fund_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // 'deposit' | 'withdrawal'
  amount: decimal("amount", { precision: 12, scale: 3 }).notNull(),
  description: text("description"),
  memberId: varchar("member_id").references(() => members.id),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by"),
});

export const insertFundAdjustmentSchema = createInsertSchema(fundAdjustments).omit({ id: true, createdAt: true }).extend({
  type: z.enum(["deposit", "withdrawal"]),
});
export type InsertFundAdjustment = z.infer<typeof insertFundAdjustmentSchema>;
export type FundAdjustment = typeof fundAdjustments.$inferSelect;

// Capital Allocations (yearly locked allocations)
export const capitalAllocations = pgTable("capital_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  year: integer("year").notNull().unique(),
  netAssets: decimal("net_assets", { precision: 12, scale: 3 }).notNull().default("0"),
  protectedAmount: decimal("protected_amount", { precision: 12, scale: 3 }).notNull().default("0"),
  emergencyAmount: decimal("emergency_amount", { precision: 12, scale: 3 }).notNull().default("0"),
  flexibleAmount: decimal("flexible_amount", { precision: 12, scale: 3 }).notNull().default("0"),
  growthAmount: decimal("growth_amount", { precision: 12, scale: 3 }).notNull().default("0"),
  flexibleUsed: decimal("flexible_used", { precision: 12, scale: 3 }).notNull().default("0"),
  growthUsed: decimal("growth_used", { precision: 12, scale: 3 }).notNull().default("0"),
  emergencyUsed: decimal("emergency_used", { precision: 12, scale: 3 }).notNull().default("0"),
  lockedAt: timestamp("locked_at").defaultNow(),
  resetAt: timestamp("reset_at"),
  resetBy: varchar("reset_by"),
});

export const insertCapitalAllocationSchema = createInsertSchema(capitalAllocations).omit({ id: true, lockedAt: true, resetAt: true, resetBy: true });
export type InsertCapitalAllocation = z.infer<typeof insertCapitalAllocationSchema>;
export type CapitalAllocation = typeof capitalAllocations.$inferSelect;
