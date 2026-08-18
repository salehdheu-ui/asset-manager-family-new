import { apiRequest, throwIfResNotOk } from "./queryClient";
import type { Member, Contribution, Loan, LoanRepayment, LoanPayment, Expense, FamilySettings, PublicUser, FundAdjustment, SystemBackup, AuditLog } from "@shared/schema";

type QueryParams = Record<string, string | number | boolean | null | undefined>;

/**
 * قراءة من الخادم.
 *
 * كان كل واحدة من خمس وثلاثين دالة قراءة تكرر السطور الثلاثة نفسها: fetch
 * بـ credentials، ثم فحص res.ok، ثم json. صارت هنا مرة واحدة.
 *
 * المعاملات الفارغة تُحذف، فتبقى الروابط نظيفة بلا `?year=undefined`.
 *
 * الأخطاء تمر بمسار queryClient نفسه بدل نسخة ثانية كانت ترمي رسالة فارغة
 * حين لا يرد الخادم بنص — أي إشعار خطأ بلا كلمة واحدة تشرحه.
 */
async function get<T>(path: string, params?: QueryParams): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }

  const search = query.toString();
  const res = await fetch(search ? `${path}?${search}` : path, { credentials: "include" });
  await throwIfResNotOk(res);
  return res.json() as Promise<T>;
}

/** كتابة تُرجع الصف الناتج — apiRequest يتكفّل بالخطأ */
async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await apiRequest(method, path, body);
  return res.json() as Promise<T>;
}

// Members
export async function getMembers(): Promise<Member[]> {
  return get<Member[]>("/api/members");
}

export async function createMember(data: { name: string; role?: string; avatar?: string; expectedMonthly?: string | null }): Promise<Member> {
  return send<Member>("POST", "/api/members", data);
}

export async function updateMember(id: string, data: Partial<{ name: string; role: string; avatar: string; expectedMonthly: string | null }>): Promise<Member> {
  return send<Member>("PATCH", `/api/members/${id}`, data);
}

export async function deleteMember(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/members/${id}`);
}

// Contributions
export async function getContributions(year?: number): Promise<Contribution[]> {
  return get<Contribution[]>("/api/contributions", { year });
}

export async function createContribution(data: { memberId: string; year: number; month: number; amount: string; status?: string }): Promise<Contribution> {
  return send<Contribution>("POST", "/api/contributions", data);
}

export async function deleteContribution(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/contributions/${id}`);
}

export async function approveContribution(id: string): Promise<Contribution> {
  return send<Contribution>("PATCH", `/api/contributions/${id}/approve`, {});
}

// Loans
// السلفة مُثراة من الخادم بالمسدد والمتبقي وحالة السداد الكامل
export type LoanWithBalance = Loan & { totalPaid: number; remaining: number; settled: boolean };

export async function getLoans(): Promise<LoanWithBalance[]> {
  return get<LoanWithBalance[]>("/api/loans");
}

export async function updateLoan(
  id: string,
  data: Partial<{ title: string; description: string | null; type: string; amount: string; repaymentType: string; repaymentMonths: number | null }>,
): Promise<Loan> {
  return send<Loan>("PATCH", `/api/loans/${id}`, data);
}

/**
 * تجاوز حدّ طبقة رأس المال — يُرافق ردّ الخادم حين يقع.
 *
 * الحد إرشاد لا سدّ: العملية تُنفَّذ ويُوثَّق التجاوز، وتُعرض هذه البيانات
 * للوصي فور وقوعه بدل أن يكتشف العجز بعد شهر.
 */
export interface LayerOverdraft {
  layer: string;
  layerName: string;
  available: number;
  requested: number;
  excess: number;
}

/** الرد قد يحمل معه بيان تجاوز */
export type WithOverdraft<T> = T & { overdraft?: LayerOverdraft | null };

/** فحص مسبق: هل يتجاوز هذا المبلغ حدّ طبقته؟ لا يكتب شيئاً */
export async function previewLoanLimit(amount: number): Promise<LayerOverdraft | null> {
  const result = await send<{ allowed: boolean; overdraft: LayerOverdraft | null }>(
    "POST",
    "/api/allocation/check-loan",
    { amount },
  );
  return result.overdraft;
}

export async function previewExpenseLimit(amount: number, category: string): Promise<LayerOverdraft | null> {
  const result = await send<{ allowed: boolean; overdraft: LayerOverdraft | null }>(
    "POST",
    "/api/allocation/check-expense",
    { amount, category },
  );
  return result.overdraft;
}

export async function previewInvestmentLimit(amount: number): Promise<LayerOverdraft | null> {
  const result = await send<{ allowed: boolean; overdraft: LayerOverdraft | null }>(
    "POST",
    "/api/allocation/check-investment",
    { amount },
  );
  return result.overdraft;
}

export async function createLoan(data: { memberId: string; type: string; title: string; amount: string; description?: string; repaymentType?: string; repaymentMonths?: number | null; status?: string }): Promise<WithOverdraft<Loan>> {
  return send<WithOverdraft<Loan>>("POST", "/api/loans", data);
}

export async function updateLoanStatus(id: string, status: string): Promise<WithOverdraft<Loan>> {
  return send<WithOverdraft<Loan>>("PATCH", `/api/loans/${id}/status`, { status });
}

export async function deleteLoan(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/loans/${id}`);
}

export async function getLoanRepayments(loanId: string): Promise<LoanRepayment[]> {
  return get<LoanRepayment[]>(`/api/loans/${loanId}/repayments`);
}

export async function markRepaymentPaid(id: string): Promise<LoanRepayment> {
  return send<LoanRepayment>("PATCH", `/api/repayments/${id}/pay`, {});
}

export async function getLoanPayments(loanId: string): Promise<LoanPayment[]> {
  return get<LoanPayment[]>(`/api/loans/${loanId}/payments`);
}

export async function createLoanPayment(loanId: string, data: { amount: string; note?: string }): Promise<LoanPayment> {
  return send<LoanPayment>("POST", `/api/loans/${loanId}/payments`, data);
}

// Expenses
export async function getExpenses(): Promise<Expense[]> {
  return get<Expense[]>("/api/expenses");
}

export async function createExpense(data: { title: string; amount: string; category: string; description?: string }): Promise<WithOverdraft<Expense>> {
  return send<WithOverdraft<Expense>>("POST", "/api/expenses", data);
}

export async function deleteExpense(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/expenses/${id}`);
}

// Settings
export async function getSettings(): Promise<FamilySettings> {
  return get<FamilySettings>("/api/settings");
}

export async function updateSettings(data: Partial<FamilySettings>): Promise<FamilySettings> {
  return send<FamilySettings>("PATCH", "/api/settings", data);
}

export async function setEmergencyMode(enabled: boolean): Promise<FamilySettings> {
  return send<FamilySettings>("POST", "/api/settings/emergency", { enabled });
}

export async function assignCustodian(memberId: string): Promise<Member> {
  return send<Member>("POST", `/api/members/${memberId}/assign-custodian`, {});
}

export async function getBackups(): Promise<SystemBackup[]> {
  return get<SystemBackup[]>("/api/backups");
}

export async function createBackup(): Promise<SystemBackup> {
  return send<SystemBackup>("POST", "/api/backups/create", {});
}

export async function applyBackupRetention(): Promise<{ kept: number; deleted: number }> {
  return send<{ kept: number; deleted: number }>("POST", "/api/backups/apply-retention", {});
}

export interface BackupContentSummary {
  fileName: string;
  backupDate: string;
  backupLevel: string;
  createdAt: string | null;
  version: number | null;
  counts: Record<string, number>;
}

export interface RestoreResult {
  record: SystemBackup;
  safetySnapshotId: string;
  summary: { createdAt: string | null; version: number | null; counts: Record<string, number> };
}

export async function getBackupSummary(id: string): Promise<BackupContentSummary> {
  return get<BackupContentSummary>(`/api/backups/${id}/summary`);
}

export async function restoreBackup(id: string): Promise<RestoreResult> {
  return send<RestoreResult>("POST", `/api/backups/${id}/restore`, {});
}

export async function importBackup(payload: unknown): Promise<RestoreResult> {
  return send<RestoreResult>("POST", "/api/backups/import", payload);
}

// Dashboard
export interface DashboardSummary {
  totalContributions: number;
  totalLoans: number;
  totalExpenses: number;
  totalRepayments: number;
  totalDeposits: number;
  totalWithdrawals: number;
  netCapital: number;
  /** الرصيد الحقيقي بلا تصفير — سالبٌ عند العجز */
  actualNetCapital?: number;
  inDeficit?: boolean;
  lockedNetAssets?: number;
  allocation?: {
    year: number;
    netAssets: number;
    locked: boolean;
    protected: { amount: number; percent: number };
    emergency: { amount: number; percent: number; used: number; available: number };
    flexible: { amount: number; percent: number; used: number; available: number };
    growth: { amount: number; percent: number; used: number; available: number };
  };
  layers: Array<{
    id: string;
    name: string;
    arabicName?: string;
    percentage: number;
    amount: number;
    locked: boolean;
    used?: number;
    available?: number;
  }>;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return get<DashboardSummary>("/api/dashboard/summary");
}

// User Profile
export async function getUserProfile(): Promise<PublicUser & { member?: Member }> {
  return get<PublicUser & { member?: Member }>("/api/user/profile");
}

export async function updateUserProfile(data: { firstName?: string; lastName?: string }): Promise<PublicUser> {
  return send<PublicUser>("PATCH", "/api/user/profile", data);
}

// Admin - Users
export async function getAdminUsers(): Promise<PublicUser[]> {
  return get<PublicUser[]>("/api/admin/users");
}

// التحليلات الذكية
export interface CommitmentScore {
  memberId: string;
  name: string;
  score: number;
  contributedMonths: number;
  windowMonths: number;
  totalBorrowed: number;
  totalRepaid: number;
  overdueInstallments: number;
}

export async function getCommitmentScores(): Promise<CommitmentScore[]> {
  return get<CommitmentScore[]>("/api/reports/commitment-scores");
}

export interface CashflowForecast {
  currentBalance: number;
  avgMonthlyContributions: number;
  forecast: Array<{ month: string; expectedContributions: number; scheduledRepayments: number; projectedBalance: number }>;
  note: string;
}

export async function getCashflowForecast(): Promise<CashflowForecast> {
  return get<CashflowForecast>("/api/reports/cashflow-forecast");
}

export interface SystemAlert {
  severity: "high" | "medium" | "info";
  title: string;
  detail: string;
}

export async function getAlerts(): Promise<SystemAlert[]> {
  return get<SystemAlert[]>("/api/reports/alerts");
}

// تصويت العائلة على السلف الكبيرة
export interface LoanVoteTally {
  required: number;
  eligible: number;
  approve: number;
  reject: number;
  passed: boolean;
  myVote: string | null;
  threshold: number;
  canVote: boolean;
  voters?: Array<{ name: string; vote: string }>;
}

export async function getLoanVotes(loanId: string): Promise<LoanVoteTally> {
  return get<LoanVoteTally>(`/api/loans/${loanId}/votes`);
}

export async function castLoanVote(loanId: string, vote: "approve" | "reject"): Promise<{ approve: number; reject: number; required: number; passed: boolean; myVote: string }> {
  return send<{ approve: number; reject: number; required: number; passed: boolean; myVote: string }>("POST", `/api/loans/${loanId}/vote`, { vote });
}

// المتأخرات بالريال وحصص الأعضاء
export interface ArrearsReport {
  windowMonths: number;
  familyDefault: number;
  totalArrears: number;
  members: Array<{
    memberId: string;
    name: string;
    expectedMonthly: number;
    expectedTotal: number;
    paidTotal: number;
    arrears: number;
    missedMonths: number;
    partialMonths: number;
  }>;
}

export async function getArrearsReport(): Promise<ArrearsReport> {
  return get<ArrearsReport>("/api/reports/arrears");
}

export interface MemberSharesReport {
  netAssets: number;
  note: string;
  shares: Array<{ memberId: string; name: string; contributed: number; weight: number; percent: number; value: number }>;
}

export async function getMemberShares(): Promise<MemberSharesReport> {
  return get<MemberSharesReport>("/api/reports/member-shares");
}

// كشف حساب العضو الكامل
export interface MemberStatement {
  member: { id: string; name: string; role: string };
  generatedAt: string;
  filterYear: number | null;
  summary: {
    totalContributed: number;
    totalBorrowed: number;
    totalRepaid: number;
    currentDebt: number;
  };
  arrears: {
    expectedMonthly: number;
    expectedTotal: number;
    paidTotal: number;
    arrears: number;
    missedMonths: number;
    partialMonths: number;
  };
  timeline: Array<{
    date: string;
    type: "contribution" | "loan" | "repayment";
    label: string;
    amount: number;
    debtAfter: number;
    contributedAfter: number;
  }>;
  loans: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    amount: number;
    borrowedAt: string | null;
    totalPaid: number;
    remaining: number;
    settled: boolean;
    payments: Array<{ date: string | null; amount: number; note: string | null }>;
  }>;
  contributionsByYear: Array<{ year: number; months: Array<{ month: number; amount: number; status: string }> }>;
}

export async function getMemberStatement(memberId: string, year?: number | null): Promise<MemberStatement> {
  return get<MemberStatement>(`/api/reports/member-statement/${memberId}`, { year });
}

// استعادة كلمة المرور
export async function forgotPassword(username: string): Promise<{ message: string }> {
  return send<{ message: string }>("POST", "/api/auth/forgot-password", { username });
}

export async function resetPassword(data: { username: string; code: string; newPassword: string }): Promise<{ message: string }> {
  return send<{ message: string }>("POST", "/api/auth/reset-password", data);
}

export interface ResetRequest {
  id: string;
  username: string;
  status: string;
  requestedAt: string;
  codeExpiresAt: string | null;
}

export async function getResetRequests(): Promise<ResetRequest[]> {
  return get<ResetRequest[]>("/api/admin/reset-requests");
}

export async function issueResetCode(id: string): Promise<{ code: string; username: string; expiresAt: string; message: string }> {
  return send<{ code: string; username: string; expiresAt: string; message: string }>("POST", `/api/admin/reset-requests/${id}/issue`, {});
}

export async function rejectResetRequest(id: string): Promise<{ message: string }> {
  return send<{ message: string }>("POST", `/api/admin/reset-requests/${id}/reject`, {});
}

export interface AuditLogsResponse {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getAuditLogs(page = 1, limit = 50): Promise<AuditLogsResponse> {
  return get<AuditLogsResponse>("/api/admin/audit-logs", { page, limit });
}

export async function getAuditLogsPublic(): Promise<AuditLog[]> {
  return get<AuditLog[]>("/api/audit-logs");
}

export async function createUser(data: { 
  username: string; 
  password: string; 
  firstName?: string; 
  lastName?: string;
  email?: string;
  role?: string;
  memberId?: string;
}): Promise<PublicUser> {
  return send<PublicUser>("POST", "/api/admin/users", data);
}

export async function updateUser(id: string, data: Partial<{
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  memberId: string;
}>): Promise<PublicUser> {
  return send<PublicUser>("PUT", `/api/admin/users/${id}`, data);
}

export async function updateUserPassword(id: string, password: string): Promise<void> {
  await apiRequest("PUT", `/api/admin/users/${id}/password`, { password });
}

export async function updateUserRole(id: string, role: string): Promise<PublicUser> {
  return send<PublicUser>("PUT", `/api/admin/users/${id}`, { role });
}

export async function linkUserToMember(id: string, memberId: string): Promise<PublicUser> {
  return send<PublicUser>("PUT", `/api/admin/users/${id}`, { memberId });
}

export async function deleteUser(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/admin/users/${id}`);
}

// Fund Adjustments (Admin)
export async function getFundAdjustments(): Promise<FundAdjustment[]> {
  return get<FundAdjustment[]>("/api/fund-adjustments");
}

export async function createFundAdjustment(data: { type: string; amount: string; description?: string; memberId?: string }): Promise<FundAdjustment> {
  return send<FundAdjustment>("POST", "/api/fund-adjustments", data);
}

export async function deleteFundAdjustment(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/fund-adjustments/${id}`);
}

// Capital Allocation
export async function lockYearAllocation(year: number): Promise<any> {
  return send<any>("POST", `/api/allocation/${year}/lock`);
}


// System Reset
export async function resetSystem(): Promise<void> {
  await apiRequest("POST", "/api/system/reset");
}

// Reports & Analytics
export interface MonthlyReport {
  year: number;
  month: number;
  totalContributions: number;
  totalLoans: number;
  totalExpenses: number;
  activeMembers: number;
  netFlow: number;
  contributionCount: number;
  loanCount: number;
  expenseCount: number;
}

export async function getMonthlyReport(year?: number, month?: number): Promise<MonthlyReport> {
  return get<MonthlyReport>("/api/reports/monthly", { year, month });
}

export interface YearlyReport {
  year: number;
  summary: {
    totalContributions: number;
    totalLoans: number;
    totalExpenses: number;
    contributionCount: number;
    loanCount: number;
    expenseCount: number;
  };
  monthlyData: Array<{
    month: number;
    monthName: string;
    contributions: number;
    loans: number;
    expenses: number;
    contributionCount: number;
    loanCount: number;
    expenseCount: number;
  }>;
}

export async function getYearlyReport(year?: number): Promise<YearlyReport> {
  return get<YearlyReport>("/api/reports/yearly", { year });
}

export interface MemberPerformance {
  memberId: string;
  name: string;
  role: string;
  totalContributions: number;
  totalLoans: number;
  contributionCount: number;
  loanCount: number;
  contributionMonths: number;
  attendanceRate: number;
  sharePercent: number;   // نسبته الحقيقية من الصندوق (مرجّحة بالزمن)
  shareValue: number;     // مقابل نسبته من صافي الأصول
}

export interface MembersPerformanceReport {
  year: number;
  members: MemberPerformance[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  totals: {
    contributions: number;
    loans: number;
    activeMembers: number;
  };
}

export async function getMembersPerformance(year?: number): Promise<MembersPerformanceReport> {
  return get<MembersPerformanceReport>("/api/reports/members-performance", { year });
}

export interface LoansAnalysis {
  year: number;
  summary: {
    totalLoans: number;
    totalAmount: number;
    avgLoanAmount: number;
    repaymentRate: number;
    totalPaid: number;
    totalRemaining: number;
  };
  byType: {
    urgent: { count: number; total: number; avgAmount: number };
    standard: { count: number; total: number; avgAmount: number };
    emergency: { count: number; total: number; avgAmount: number };
  };
  recentLoans: Array<{
    id: string;
    memberName: string;
    type: string;
    amount: number;
    createdAt: string | null;
    status: string;
  }>;
}

export async function getLoansAnalysis(year?: number): Promise<LoansAnalysis> {
  return get<LoansAnalysis>("/api/reports/loans-analysis", { year });
}

export interface MemberReport {
  member: { id: string; name: string; role: string; avatar: string | null };
  year: number;
  summary: {
    totalContributions: number;
    totalLoaned: number;
    totalLoanPaid: number;
    totalLoanRemaining: number;
    contributionCount: number;
    loanCount: number;
    pendingCount: number;
  };
  performance: {
    paidMonths: number;
    expectedMonths: number;
    commitmentRate: number;
    rating: string;
    expectedTotal: number;
    paidTotal: number;
    arrears: number;
    partialMonths: number;
  };
  contributionsGrid: Array<{
    month: number;
    monthName: string;
    status: 'approved' | 'pending_approval' | 'missing' | 'upcoming';
    amount: number;
    paidAt: string | null;
    contributionId: string | null;
  }>;
  loans: Array<{
    id: string;
    title: string;
    type: string;
    amount: number;
    status: string;
    repaymentType: string;
    repaymentMonths: number | null;
    totalPaid: number;
    remaining: number;
    createdAt: string | null;
    approvedAt: string | null;
    description: string | null;
  }>;
}

export async function getMemberReport(memberId: string, year?: number): Promise<MemberReport> {
  return get<MemberReport>(`/api/reports/member/${memberId}`, { year });
}

export interface ChartDataResponse {
  type: string;
  period: string;
  data: any;
}

export async function getChartData(type: string, period?: string): Promise<ChartDataResponse> {
  return get<ChartDataResponse>("/api/reports/chart-data", { type, period });
}

// ــــ الزكاة ــــ
export interface ZakatCycle {
  id: string;
  cycleStart: string;
  dueAt: string | null;
  netAssetsAtDue: string;
  nisabUsed: string;
  amountDue: string;
  status: "open" | "due" | "paid";
  expenseId: string | null;
  paidAt: string | null;
  note: string | null;
}

export interface ZakatStatus {
  nisab: number;
  hawlDays: number;
  netAssets: number;
  currentCycle: (ZakatCycle & { hawlComplete: boolean; daysRemaining: number }) | null;
  estimate: { netAssets: number; nisab: number; reachesNisab: boolean; amount: number };
  history: ZakatCycle[];
}

export async function getZakatStatus(): Promise<ZakatStatus> {
  return get<ZakatStatus>("/api/zakat");
}

export async function startZakatCycle(data: { cycleStart?: string; note?: string | null } = {}): Promise<ZakatCycle> {
  return send<ZakatCycle>("POST", "/api/zakat/cycles", data);
}

export async function payZakat(cycleId: string, data: { amount?: string; title?: string; note?: string | null } = {}): Promise<{ cycle: ZakatCycle }> {
  return send<{ cycle: ZakatCycle }>("POST", `/api/zakat/cycles/${cycleId}/pay`, data);
}

// ــــ الاستثمارات ــــ
export interface InvestmentValuation {
  id: string;
  investmentId: string;
  valuedAt: string;
  value: string;
  note: string | null;
}

export interface InvestmentRow {
  id: string;
  title: string;
  type: "property" | "stocks" | "project" | "other";
  amount: string;
  startedAt: string;
  status: "active" | "exited";
  exitedAt: string | null;
  exitValue: string | null;
  note: string | null;
  currentValue: number;
  gain: number;
  returnPercent: number;
  valuations: InvestmentValuation[];
}

export interface InvestmentsResponse {
  investments: InvestmentRow[];
  totals: { invested: number; currentValue: number; realizedGain: number };
  growthLayer: { amount: number; percent: number; used: number; available: number };
}

export async function getInvestments(): Promise<InvestmentsResponse> {
  return get<InvestmentsResponse>("/api/investments");
}

export async function createInvestment(data: {
  title: string;
  type: string;
  amount: string;
  startedAt: string;
  note?: string | null;
}): Promise<WithOverdraft<InvestmentRow>> {
  return send<WithOverdraft<InvestmentRow>>("POST", "/api/investments", data);
}

export async function addInvestmentValuation(id: string, data: { value: string; valuedAt: string; note?: string | null }): Promise<InvestmentValuation> {
  return send<InvestmentValuation>("POST", `/api/investments/${id}/valuations`, data);
}

export async function exitInvestment(id: string, data: { exitValue: string; note?: string | null }): Promise<{ gain: number; returnPercent: number }> {
  return send<{ gain: number; returnPercent: number }>("POST", `/api/investments/${id}/exit`, data);
}

export async function deleteInvestment(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/investments/${id}`);
}

// ــــ اقتراحات العائلة ــــ
export interface ProposalRow {
  id: string;
  title: string;
  category: "allocation" | "expense" | "investment" | "general";
  description: string | null;
  amount: string | null;
  status: "open" | "approved" | "rejected" | "cancelled";
  closesAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  createdByName: string | null;
  approve: number;
  reject: number;
  eligible: number;
  required: number;
  passed: boolean;
  myVote: "approve" | "reject" | null;
  voters: Array<{ name: string; vote: string }>;
}

export async function getProposals(): Promise<ProposalRow[]> {
  return get<ProposalRow[]>("/api/proposals");
}

export async function createProposal(data: {
  title: string;
  category: string;
  description?: string | null;
  amount?: string | null;
  closesAt?: string | null;
}): Promise<ProposalRow> {
  return send<ProposalRow>("POST", "/api/proposals", data);
}

export async function voteProposal(id: string, vote: "approve" | "reject"): Promise<{ approve: number; reject: number; required: number; passed: boolean }> {
  return send<{ approve: number; reject: number; required: number; passed: boolean }>("POST", `/api/proposals/${id}/vote`, { vote });
}

export async function closeProposal(id: string, status: "rejected" | "cancelled" = "rejected"): Promise<ProposalRow> {
  return send<ProposalRow>("POST", `/api/proposals/${id}/close`, { status });
}

// ــــ المرفقات (إيصالات وفواتير) ــــ
export interface AttachmentMeta {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export async function getAttachments(entityType: string, entityId: string): Promise<AttachmentMeta[]> {
  return get<AttachmentMeta[]>("/api/attachments", { entityType, entityId });
}

// يقرأ الملف في المتصفح ويرسله base64 إلى الخادم — الخادم يختار Object Storage أو legacy fallback
export async function uploadAttachment(entityType: string, entityId: string, file: File): Promise<AttachmentMeta> {
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("تعذرت قراءة الملف"));
    reader.readAsDataURL(file);
  });

  const res = await apiRequest("POST", "/api/attachments", {
    entityType,
    entityId,
    fileName: file.name,
    mimeType: file.type,
    content,
  });
  return res.json();
}

export function attachmentUrl(id: string) {
  return `/api/attachments/${id}/download`;
}

export async function deleteAttachment(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/attachments/${id}`);
}

// ــــ سجل الاشتراك الشهري بتواريخ سريانه ــــ
export interface ContributionRateRow {
  id: string;
  memberId: string | null;
  scopeName: string;
  amount: number;
  effectiveYear: number;
  effectiveMonth: number;
  note: string | null;
  createdAt: string;
}

export interface RatesResponse {
  defaultEffective: { year: number; month: number };
  rates: ContributionRateRow[];
  current: {
    family: number;
    members: Array<{ memberId: string; name: string; now: number; fromNextMonth: number }>;
  };
}

export async function getContributionRates(): Promise<RatesResponse> {
  return get<RatesResponse>("/api/contribution-rates");
}

export async function setContributionRate(data: {
  memberId?: string | null;
  amount: string;
  effectiveYear?: number;
  effectiveMonth?: number;
  note?: string | null;
}): Promise<ContributionRateRow> {
  return send<ContributionRateRow>("POST", "/api/contribution-rates", data);
}

export async function deleteContributionRate(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/contribution-rates/${id}`);
}

// ————— الإشعارات —————

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  url: string;
  audience: "all" | "admins" | "members" | "user";
  targetUserId: string | null;
  status: "scheduled" | "sending" | "sent" | "cancelled" | "failed";
  scheduledAt: string | null;
  sentAt: string | null;
  deliveredCount: number;
  failedCount: number;
  error: string | null;
  createdByName: string | null;
  createdAt: string | null;
}

export interface NotificationsResponse {
  configured: boolean;
  subscribedDevices: number;
  notifications: NotificationRow[];
}

export async function getNotifications(): Promise<NotificationsResponse> {
  return get<NotificationsResponse>("/api/notifications");
}

export async function sendNotification(data: {
  title: string;
  body: string;
  url: string;
  audience: "all" | "admins" | "members" | "user";
  targetUserId?: string | null;
  scheduledAt?: string | null;
}): Promise<{ notification: NotificationRow; scheduled: boolean; delivered?: number; failed?: number }> {
  return send<{ notification: NotificationRow; scheduled: boolean; delivered?: number; failed?: number }>("POST", "/api/notifications", data);
}

export async function runReminders(): Promise<{ considered: number; sent: number; skipped: number }> {
  return send("POST", "/api/notifications/run-reminders", {});
}

export async function cancelNotification(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/notifications/${id}`);
}

// ————— التدقيق المالي —————

export interface ReconcileFinding {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  amount?: number;
  samples?: string[];
}

export interface ReconcileReport {
  generatedAt: string;
  rebuilt: {
    contributionsApproved: number;
    contributionsPending: number;
    deposits: number;
    withdrawals: number;
    loansApproved: number;
    loansPending: number;
    repayments: number;
    expenses: number;
    netAssets: number;
    activeInvestments: number;
  };
  displayed: {
    allocationYear: number | null;
    allocationNetAssets: number | null;
    allocationLockedAt: string | null;
  };
  differences: { allocationVsRebuilt: number | null };
  findings: ReconcileFinding[];
  coverage: { table: string; label: string; rows: number; audited: number }[];
}

export interface AmountMatch {
  source: string;
  id: string;
  amount: number;
  description: string;
  createdAt: string | null;
}

export async function getReconcileReport(): Promise<ReconcileReport> {
  return get<ReconcileReport>("/api/audit/reconcile");
}

export async function findAmount(value: number): Promise<AmountMatch[]> {
  return get<AmountMatch[]>("/api/audit/find-amount", { value });
}
