import { apiRequest } from "./queryClient";
import type { Member, Contribution, Loan, LoanRepayment, Expense, FamilySettings, User, FundAdjustment } from "@shared/schema";

// Members
export async function getMembers(): Promise<Member[]> {
  const res = await fetch("/api/members", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch members");
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
  if (!res.ok) throw new Error("Failed to fetch contributions");
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
export async function getLoans(): Promise<Loan[]> {
  const res = await fetch("/api/loans", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch loans");
  return res.json();
}

export async function createLoan(data: { memberId: string; type: string; title: string; amount: string; repaymentMonths?: number }): Promise<Loan> {
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
  if (!res.ok) throw new Error("Failed to fetch repayments");
  return res.json();
}

export async function markRepaymentPaid(id: string): Promise<LoanRepayment> {
  const res = await apiRequest("PATCH", `/api/repayments/${id}/pay`, {});
  return res.json();
}

// Expenses
export async function getExpenses(): Promise<Expense[]> {
  const res = await fetch("/api/expenses", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch expenses");
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
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function updateSettings(data: Partial<FamilySettings>): Promise<FamilySettings> {
  const res = await apiRequest("PATCH", "/api/settings", data);
  return res.json();
}

// Dashboard
export interface DashboardSummary {
  totalContributions: number;
  totalLoans: number;
  totalExpenses: number;
  totalRepayments: number;
  netCapital: number;
  layers: Array<{
    id: string;
    name: string;
    percentage: number;
    amount: number;
    locked: boolean;
    used?: number;
    available?: number;
  }>;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const res = await fetch("/api/dashboard/summary", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch dashboard summary");
  return res.json();
}

// User Profile
export async function getUserProfile(): Promise<User & { member?: Member }> {
  const res = await fetch("/api/user/profile", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

export async function updateUserProfile(data: { firstName?: string; lastName?: string }): Promise<User> {
  const res = await apiRequest("PATCH", "/api/user/profile", data);
  return res.json();
}

// Admin - Users
export async function getAdminUsers(): Promise<User[]> {
  const res = await fetch("/api/admin/users", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch users");
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
}): Promise<User> {
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
}>): Promise<User> {
  const res = await apiRequest("PUT", `/api/admin/users/${id}`, data);
  return res.json();
}

export async function updateUserPassword(id: string, password: string): Promise<void> {
  await apiRequest("PUT", `/api/admin/users/${id}/password`, { password });
}

export async function updateUserRole(id: string, role: string): Promise<User> {
  const res = await apiRequest("PUT", `/api/admin/users/${id}`, { role });
  return res.json();
}

export async function linkUserToMember(id: string, memberId: string): Promise<User> {
  const res = await apiRequest("PUT", `/api/admin/users/${id}`, { memberId });
  return res.json();
}

export async function deleteUser(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/admin/users/${id}`);
}

// Fund Adjustments (Admin)
export async function getFundAdjustments(): Promise<FundAdjustment[]> {
  const res = await fetch("/api/fund-adjustments", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch fund adjustments");
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
