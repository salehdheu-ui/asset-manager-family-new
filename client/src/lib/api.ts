import { apiRequest } from "./queryClient";
import type { Member, Contribution, Loan, LoanRepayment, LoanPayment, Expense, FamilySettings, PublicUser, FundAdjustment, SystemBackup, AuditLog } from "@shared/schema";

async function parseFetchError(res: Response) {
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await res.json().catch(() => null);
    const message = body?.message || body?.error;
    if (typeof message === "string" && message.trim()) {
      throw new Error(message);
    }
  }

  throw new Error((await res.text().catch(() => "")) || res.statusText);
}

// Members
export async function getMembers(): Promise<Member[]> {
  const res = await fetch("/api/members", { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export async function createMember(data: { name: string; role?: string; avatar?: string }): Promise<Member> {
  const res = await apiRequest("POST", "/api/members", data);
  return res.json();
}

export async function updateMember(id: string, data: Partial<{ name: string; role: string; avatar: string }>): Promise<Member> {
  const res = await apiRequest("PATCH", `/api/members/${id}`, data);
  return res.json();
}

export async function deleteMember(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/members/${id}`);
}

// Contributions
export async function getContributions(year?: number): Promise<Contribution[]> {
  const url = year ? `/api/contributions?year=${year}` : "/api/contributions";
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export async function createContribution(data: { memberId: string; year: number; month: number; amount: string; status?: string }): Promise<Contribution> {
  const res = await apiRequest("POST", "/api/contributions", data);
  return res.json();
}

export async function deleteContribution(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/contributions/${id}`);
}

export async function approveContribution(id: string): Promise<Contribution> {
  const res = await apiRequest("PATCH", `/api/contributions/${id}/approve`, {});
  return res.json();
}

// Loans
// السلفة مُثراة من الخادم بالمسدد والمتبقي وحالة السداد الكامل
export type LoanWithBalance = Loan & { totalPaid: number; remaining: number; settled: boolean };

export async function getLoans(): Promise<LoanWithBalance[]> {
  const res = await fetch("/api/loans", { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export async function updateLoan(
  id: string,
  data: Partial<{ title: string; description: string | null; type: string; amount: string; repaymentType: string; repaymentMonths: number | null }>,
): Promise<Loan> {
  const res = await apiRequest("PATCH", `/api/loans/${id}`, data);
  return res.json();
}

export async function createLoan(data: { memberId: string; type: string; title: string; amount: string; description?: string; repaymentType?: string; repaymentMonths?: number | null; status?: string }): Promise<Loan> {
  const res = await apiRequest("POST", "/api/loans", data);
  return res.json();
}

export async function updateLoanStatus(id: string, status: string): Promise<Loan> {
  const res = await apiRequest("PATCH", `/api/loans/${id}/status`, { status });
  return res.json();
}

export async function deleteLoan(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/loans/${id}`);
}

export async function getLoanRepayments(loanId: string): Promise<LoanRepayment[]> {
  const res = await fetch(`/api/loans/${loanId}/repayments`, { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export async function markRepaymentPaid(id: string): Promise<LoanRepayment> {
  const res = await apiRequest("PATCH", `/api/repayments/${id}/pay`, {});
  return res.json();
}

export async function getLoanPayments(loanId: string): Promise<LoanPayment[]> {
  const res = await fetch(`/api/loans/${loanId}/payments`, { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export async function createLoanPayment(loanId: string, data: { amount: string; note?: string }): Promise<LoanPayment> {
  const res = await apiRequest("POST", `/api/loans/${loanId}/payments`, data);
  return res.json();
}

// Expenses
export async function getExpenses(): Promise<Expense[]> {
  const res = await fetch("/api/expenses", { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export async function createExpense(data: { title: string; amount: string; category: string; description?: string }): Promise<Expense> {
  const res = await apiRequest("POST", "/api/expenses", data);
  return res.json();
}

export async function deleteExpense(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/expenses/${id}`);
}

// Settings
export async function getSettings(): Promise<FamilySettings> {
  const res = await fetch("/api/settings", { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export async function updateSettings(data: Partial<FamilySettings>): Promise<FamilySettings> {
  const res = await apiRequest("PATCH", "/api/settings", data);
  return res.json();
}

export async function setEmergencyMode(enabled: boolean): Promise<FamilySettings> {
  const res = await apiRequest("POST", "/api/settings/emergency", { enabled });
  return res.json();
}

export async function assignCustodian(memberId: string): Promise<Member> {
  const res = await apiRequest("POST", `/api/members/${memberId}/assign-custodian`, {});
  return res.json();
}

export async function getBackups(): Promise<SystemBackup[]> {
  const res = await fetch("/api/backups", { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export async function createBackup(): Promise<SystemBackup> {
  const res = await apiRequest("POST", "/api/backups/create", {});
  return res.json();
}

export async function applyBackupRetention(): Promise<{ kept: number; deleted: number }> {
  const res = await apiRequest("POST", "/api/backups/apply-retention", {});
  return res.json();
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
  const res = await fetch(`/api/backups/${id}/summary`, { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export async function restoreBackup(id: string): Promise<RestoreResult> {
  const res = await apiRequest("POST", `/api/backups/${id}/restore`, {});
  return res.json();
}

export async function importBackup(payload: unknown): Promise<RestoreResult> {
  const res = await apiRequest("POST", "/api/backups/import", payload);
  return res.json();
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
  const res = await fetch("/api/dashboard/summary", { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

// User Profile
export async function getUserProfile(): Promise<PublicUser & { member?: Member }> {
  const res = await fetch("/api/user/profile", { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export async function updateUserProfile(data: { firstName?: string; lastName?: string }): Promise<PublicUser> {
  const res = await apiRequest("PATCH", "/api/user/profile", data);
  return res.json();
}

// Admin - Users
export async function getAdminUsers(): Promise<PublicUser[]> {
  const res = await fetch("/api/admin/users", { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export interface AuditLogsResponse {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getAuditLogs(page = 1, limit = 50): Promise<AuditLogsResponse> {
  const url = new URL("/api/admin/audit-logs", window.location.origin);
  url.searchParams.append("page", String(page));
  url.searchParams.append("limit", String(limit));
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export async function getAuditLogsPublic(): Promise<AuditLog[]> {
  const res = await fetch("/api/audit-logs", { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
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
  const res = await apiRequest("POST", "/api/admin/users", data);
  return res.json();
}

export async function updateUser(id: string, data: Partial<{
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  memberId: string;
}>): Promise<PublicUser> {
  const res = await apiRequest("PUT", `/api/admin/users/${id}`, data);
  return res.json();
}

export async function updateUserPassword(id: string, password: string): Promise<void> {
  await apiRequest("PUT", `/api/admin/users/${id}/password`, { password });
}

export async function updateUserRole(id: string, role: string): Promise<PublicUser> {
  const res = await apiRequest("PUT", `/api/admin/users/${id}`, { role });
  return res.json();
}

export async function linkUserToMember(id: string, memberId: string): Promise<PublicUser> {
  const res = await apiRequest("PUT", `/api/admin/users/${id}`, { memberId });
  return res.json();
}

export async function deleteUser(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/admin/users/${id}`);
}

// Fund Adjustments (Admin)
export async function getFundAdjustments(): Promise<FundAdjustment[]> {
  const res = await fetch("/api/fund-adjustments", { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export async function createFundAdjustment(data: { type: string; amount: string; description?: string; memberId?: string }): Promise<FundAdjustment> {
  const res = await apiRequest("POST", "/api/fund-adjustments", data);
  return res.json();
}

export async function deleteFundAdjustment(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/fund-adjustments/${id}`);
}

// Capital Allocation
export async function lockYearAllocation(year: number): Promise<any> {
  const res = await apiRequest("POST", `/api/allocation/${year}/lock`);
  return res.json();
}

export async function resetYearAllocation(year: number): Promise<any> {
  const res = await apiRequest("POST", `/api/allocation/${year}/reset`);
  return res.json();
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
  const url = new URL("/api/reports/monthly", window.location.origin);
  if (year) url.searchParams.append("year", year.toString());
  if (month) url.searchParams.append("month", month.toString());
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
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
  const url = new URL("/api/reports/yearly", window.location.origin);
  if (year) url.searchParams.append("year", year.toString());
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
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
  netBalance: number;
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
  const url = new URL("/api/reports/members-performance", window.location.origin);
  if (year) url.searchParams.append("year", year.toString());
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
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
  const url = new URL("/api/reports/loans-analysis", window.location.origin);
  if (year) url.searchParams.append("year", year.toString());
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
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
  const url = new URL(`/api/reports/member/${memberId}`, window.location.origin);
  if (year) url.searchParams.append("year", year.toString());
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}

export interface ChartDataResponse {
  type: string;
  period: string;
  data: any;
}

export async function getChartData(type: string, period?: string): Promise<ChartDataResponse> {
  const url = new URL("/api/reports/chart-data", window.location.origin);
  url.searchParams.append("type", type);
  if (period) url.searchParams.append("period", period);
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) await parseFetchError(res);
  return res.json();
}
