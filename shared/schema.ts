import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, decimal, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
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
  // الاشتراك الشهري المتوقع من هذا العضو — فارغ يعني استخدام الافتراضي العائلي
  expectedMonthly: decimal("expected_monthly", { precision: 10, scale: 3 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMemberSchema = createInsertSchema(members).omit({ id: true, createdAt: true }).extend({
  role: z.enum(["guardian", "custodian", "member"]).default("member"),
  expectedMonthly: z.string().nullable().optional(),
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
}, (table) => ({
  memberMonthYearUnique: uniqueIndex("contributions_member_year_month_unique").on(table.memberId, table.year, table.month),
}));

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
  description: text("description"),
  amount: decimal("amount", { precision: 10, scale: 3 }).notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  repaymentType: text("repayment_type").notNull().default("scheduled"),
  repaymentMonths: integer("repayment_months").default(12),
  createdAt: timestamp("created_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
});

export const insertLoanSchema = createInsertSchema(loans).omit({ id: true, createdAt: true, approvedAt: true }).extend({
  type: z.enum(["urgent", "standard", "emergency"]),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  repaymentType: z.enum(["scheduled", "open"]).default("scheduled"),
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

export const loanPayments = pgTable("loan_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: varchar("loan_id").notNull().references(() => loans.id),
  amount: decimal("amount", { precision: 10, scale: 3 }).notNull(),
  note: text("note"),
  paidAt: timestamp("paid_at").defaultNow(),
  createdBy: varchar("created_by"),
});

export const insertLoanPaymentSchema = createInsertSchema(loanPayments).omit({ id: true, paidAt: true }).extend({
  amount: z.string().refine((value) => Number(value) > 0, "Amount must be greater than zero"),
});
export type InsertLoanPayment = z.infer<typeof insertLoanPaymentSchema>;
export type LoanPayment = typeof loanPayments.$inferSelect;

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
  // الاشتراك الشهري الافتراضي لكل عضو لم يُحدد له مبلغ خاص
  defaultMonthlyContribution: decimal("default_monthly_contribution", { precision: 10, scale: 3 }).notNull().default("0"),
  // نصاب الزكاة بالريال (قيمة 85 غراماً من الذهب — تتغير بتغير سعر الذهب)
  zakatNisab: decimal("zakat_nisab", { precision: 12, scale: 3 }).notNull().default("0"),
  emergencyMode: boolean("emergency_mode").notNull().default(false),
  backupEnabled: boolean("backup_enabled").notNull().default(false),
  backupKeepDays: integer("backup_keep_days").notNull().default(7),
  backupKeepWeeksPerMonth: integer("backup_keep_weeks_per_month").notNull().default(4),
  backupKeepMonths: integer("backup_keep_months").notNull().default(12),
  backupLastRunAt: timestamp("backup_last_run_at"),
});

/**
 * الأعداد هنا مقيَّدة عمداً.
 *
 * كان المسار يتحقق من مجموع النسب = ١٠٠ ولا شيء غير ذلك، فيمرّ توزيعٌ مثل
 * (محمي ‎-50‎، طوارئ ‎150‎، مرن ٠، نمو ٠) لأن مجموعه مئة — فتصير طبقة المحمي
 * سالبة وطبقة الطوارئ مرة ونصفاً من الصندوق كله، ويأذن حارس الطبقات بإنفاق
 * أكثر مما فيه. والمجموع وحده يعطي طمأنينة كاذبة.
 */
const percent = z.number().int().min(0).max(100);
// نصّ لا رقم: العمود decimal في القاعدة، وتمرير رقم يكسر نوعه
const money = z
  .string()
  .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, "المبلغ لا يكون سالباً");

export const insertFamilySettingsSchema = createInsertSchema(familySettings).omit({ id: true }).extend({
  protectedPercent: percent.optional(),
  emergencyPercent: percent.optional(),
  flexiblePercent: percent.optional(),
  growthPercent: percent.optional(),
  defaultMonthlyContribution: money.optional(),
  zakatNisab: money.optional(),
  backupKeepDays: z.number().int().min(1).max(3650).optional(),
  backupKeepWeeksPerMonth: z.number().int().min(1).max(5).optional(),
  backupKeepMonths: z.number().int().min(1).max(600).optional(),
});
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
  payload: jsonb("payload").$type<Record<string, unknown> | null>().default(null),
});

export const insertSystemBackupSchema = createInsertSchema(systemBackups).omit({ id: true });
export type InsertSystemBackup = z.infer<typeof insertSystemBackupSchema>;
export type SystemBackup = typeof systemBackups.$inferSelect;

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id"),
  actorUserId: varchar("actor_user_id"),
  actorName: text("actor_name"),
  description: text("description").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(null),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// تصويت العائلة على السلف الكبيرة (فوق حد التصويت) — صوت واحد لكل مستخدم لكل سلفة
export const loanVotes = pgTable("loan_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: varchar("loan_id").notNull().references(() => loans.id),
  userId: varchar("user_id").notNull(),
  voterName: text("voter_name").notNull(),
  vote: text("vote").notNull(), // 'approve' | 'reject'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  loanUserUnique: uniqueIndex("loan_votes_loan_user_unique").on(table.loanId, table.userId),
}));

export type LoanVote = typeof loanVotes.$inferSelect;

// طلبات استعادة كلمة المرور — العضو يطلب، الوصي يصدر كوداً مؤقتاً يرسله له بنفسه
export const passwordResetRequests = pgTable("password_reset_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").notNull(),
  userId: varchar("user_id"),
  status: text("status").notNull().default("pending"), // 'pending' | 'code_issued' | 'completed' | 'rejected'
  codeHash: varchar("code_hash"),
  codeExpiresAt: timestamp("code_expires_at"),
  attemptsLeft: integer("attempts_left").notNull().default(5),
  requestedAt: timestamp("requested_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
});

export type PasswordResetRequest = typeof passwordResetRequests.$inferSelect;

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

// دورات الزكاة — كل دورة حول كامل على مال الصندوق
export const zakatCycles = pgTable("zakat_cycles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cycleStart: timestamp("cycle_start").notNull(),
  dueAt: timestamp("due_at"),                                              // متى اكتمل الحول فعلياً
  netAssetsAtDue: decimal("net_assets_at_due", { precision: 12, scale: 3 }).notNull().default("0"),
  nisabUsed: decimal("nisab_used", { precision: 12, scale: 3 }).notNull().default("0"),
  amountDue: decimal("amount_due", { precision: 12, scale: 3 }).notNull().default("0"),
  status: text("status").notNull().default("open"),                        // 'open' | 'due' | 'paid'
  expenseId: varchar("expense_id").references(() => expenses.id),          // مصروف الزكاة عند الإخراج
  paidAt: timestamp("paid_at"),
  paidBy: varchar("paid_by"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ZakatCycle = typeof zakatCycles.$inferSelect;

// سجل الاستثمارات — تُموَّل من طبقة النمو
export const investments = pgTable("investments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  type: text("type").notNull().default("other"),                           // 'property' | 'stocks' | 'project' | 'other'
  amount: decimal("amount", { precision: 12, scale: 3 }).notNull(),        // المبلغ المستثمر
  startedAt: timestamp("started_at").notNull(),
  status: text("status").notNull().default("active"),                      // 'active' | 'exited'
  exitedAt: timestamp("exited_at"),
  exitValue: decimal("exit_value", { precision: 12, scale: 3 }),           // قيمة الخروج عند التصفية
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by"),
});

export const insertInvestmentSchema = createInsertSchema(investments)
  .omit({ id: true, createdAt: true, exitedAt: true, exitValue: true })
  .extend({
    type: z.enum(["property", "stocks", "project", "other"]).default("other"),
    amount: z.string().refine((value) => Number(value) > 0, "المبلغ يجب أن يكون أكبر من صفر"),
    startedAt: z.coerce.date(),
  });
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type Investment = typeof investments.$inferSelect;

// تقييمات دورية للاستثمار — لرسم منحنى العائد
export const investmentValuations = pgTable("investment_valuations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  investmentId: varchar("investment_id").notNull().references(() => investments.id, { onDelete: "cascade" }),
  valuedAt: timestamp("valued_at").notNull(),
  value: decimal("value", { precision: 12, scale: 3 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by"),
});

export const insertInvestmentValuationSchema = createInsertSchema(investmentValuations)
  .omit({ id: true, createdAt: true })
  .extend({
    value: z.string().refine((value) => Number(value) >= 0, "القيمة لا يمكن أن تكون سالبة"),
    valuedAt: z.coerce.date(),
  });
export type InsertInvestmentValuation = z.infer<typeof insertInvestmentValuationSchema>;
export type InvestmentValuation = typeof investmentValuations.$inferSelect;

// اقتراحات العائلة — تعميم محرك التصويت خارج السلف
export const proposals = pgTable("proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  category: text("category").notNull().default("general"), // 'allocation' | 'expense' | 'investment' | 'general'
  description: text("description"),
  amount: decimal("amount", { precision: 12, scale: 3 }),  // إن كان للاقتراح أثر مالي
  status: text("status").notNull().default("open"),        // 'open' | 'approved' | 'rejected' | 'cancelled'
  closesAt: timestamp("closes_at"),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by"),
  createdByName: text("created_by_name"),
});

export const insertProposalSchema = createInsertSchema(proposals)
  .omit({ id: true, createdAt: true, decidedAt: true, status: true })
  .extend({
    category: z.enum(["allocation", "expense", "investment", "general"]).default("general"),
    title: z.string().min(3, "العنوان قصير جداً").max(200),
    amount: z.string().nullable().optional(),
    closesAt: z.coerce.date().nullable().optional(),
  });
export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposals.$inferSelect;

export const proposalVotes = pgTable("proposal_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  voterName: text("voter_name").notNull(),
  vote: text("vote").notNull(), // 'approve' | 'reject'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  proposalUserUnique: uniqueIndex("proposal_votes_proposal_user_unique").on(table.proposalId, table.userId),
}));

export type ProposalVote = typeof proposalVotes.$inferSelect;

// مرفقات الإيصالات — تُحفظ bytes في Object Storage، مع content legacy nullable للترحيل التدريجي.
export const attachments = pgTable("attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(),   // 'contribution' | 'expense' | 'loan_payment' | 'investment'
  entityId: varchar("entity_id").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storageKey: text("storage_key"),             // مفتاح Object Storage — المسار المعتمد للملفات الجديدة
  storageUrl: text("storage_url"),             // رابط العرض الموقّع/الممرّر إن وفره مزود التخزين
  content: text("content"),                    // base64 legacy — يُقرأ فقط عند غياب storageKey
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by"),
});

export type Attachment = typeof attachments.$inferSelect;

// سجل الاشتراك الشهري بتواريخ سريانه — المبلغ يتغيّر بين سنة وأخرى،
// فيُحاسَب كل شهر بالسعر الذي كان سارياً فيه، ولا يُعاد حساب الماضي عند التغيير.
export const contributionRates = pgTable("contribution_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").references(() => members.id, { onDelete: "cascade" }), // فارغ = السعر العائلي الافتراضي
  amount: decimal("amount", { precision: 10, scale: 3 }).notNull(),
  effectiveYear: integer("effective_year").notNull(),
  effectiveMonth: integer("effective_month").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by"),
}, (table) => ({
  scopeMonthUnique: uniqueIndex("contribution_rates_scope_month_unique")
    .on(table.memberId, table.effectiveYear, table.effectiveMonth),
}));

export const insertContributionRateSchema = createInsertSchema(contributionRates)
  .omit({ id: true, createdAt: true })
  .extend({
    memberId: z.string().nullable().optional(),
    amount: z.string().refine((v) => Number(v) >= 0, "المبلغ لا يمكن أن يكون سالباً"),
    effectiveYear: z.number().int().min(2020).max(2100),
    effectiveMonth: z.number().int().min(1).max(12),
  });
export type InsertContributionRate = z.infer<typeof insertContributionRateSchema>;
export type ContributionRate = typeof contributionRates.$inferSelect;

// ————— الإشعارات —————

// اشتراك جهاز واحد في الإشعارات. للمستخدم أكثر من جهاز، ولكل جهاز مفتاحاه.
// endpoint فريد لأن المتصفح يعطي عنواناً واحداً لكل تركيبة (جهاز، متصفح، تطبيق).
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  platform: text("platform"),                  // 'android' | 'ios' | 'desktop'
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
}, (table) => ({
  endpointUnique: uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint),
}));

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions)
  .omit({ id: true, createdAt: true, lastUsedAt: true });
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// سجل الإشعارات: المرسَل والمجدول معاً. المجدول ينتظر حتى scheduledAt
// ثم يُرسل ويُحدَّث في مكانه، فيبقى للعائلة سجل واحد لكل ما أُرسل.
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url").notNull().default("/"),     // الصفحة التي يفتحها الضغط على الإشعار
  audience: text("audience").notNull(),        // 'all' | 'admins' | 'members' | 'user'
  targetUserId: varchar("target_user_id"),     // مع audience = 'user'
  status: text("status").notNull().default("scheduled"), // 'scheduled' | 'sent' | 'cancelled' | 'failed'
  scheduledAt: timestamp("scheduled_at"),      // فارغ = إرسال فوري
  sentAt: timestamp("sent_at"),
  deliveredCount: integer("delivered_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  error: text("error"),
  createdBy: varchar("created_by"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  // مفتاح فريد للتذكيرات التلقائية يمنع تكرار التنبيه نفسه كل يوم.
  // فارغ لكل إشعار يكتبه الوصي بيده، والفهرس الفريد يتجاهل الفارغ.
  dedupeKey: text("dedupe_key"),
}, (table) => ({
  dedupeKeyUnique: uniqueIndex("notifications_dedupe_key_unique").on(table.dedupeKey),
}));

export const insertNotificationSchema = createInsertSchema(notifications)
  .omit({
    id: true,
    createdAt: true,
    sentAt: true,
    deliveredCount: true,
    failedCount: true,
    error: true,
    status: true,
    dedupeKey: true,
  })
  .extend({
    title: z.string().trim().min(1, "العنوان مطلوب").max(120),
    body: z.string().trim().min(1, "نص الإشعار مطلوب").max(500),
    url: z.string().trim().startsWith("/", "الرابط يجب أن يكون مساراً داخل التطبيق").max(200).default("/"),
    audience: z.enum(["all", "admins", "members", "user"]),
    targetUserId: z.string().nullable().optional(),
    scheduledAt: z.coerce.date().nullable().optional(),
  })
  .refine((data) => data.audience !== "user" || !!data.targetUserId, {
    message: "اختر المستخدم المقصود",
    path: ["targetUserId"],
  });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// أسرار يولّدها الخادم لنفسه ويحفظها ليبقى ثابتاً بين عمليات النشر.
// أول ساكنيه مفتاحا VAPID: بدونهما لا إشعارات، ومع تولّدهما عند كل إقلاع
// تبطل اشتراكات الأجهزة كلها. الجدول يجعلهما يُولَّدان مرة واحدة إلى الأبد.
export const appSecrets = pgTable("app_secrets", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
export type AppSecret = typeof appSecrets.$inferSelect;
