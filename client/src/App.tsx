import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AuthGuard from "@/components/AuthGuard";
import AdminGuard from "@/components/AdminGuard";
import ErrorBoundary from "@/components/ErrorBoundary";
import Auth from "@/pages/auth";

// تحميل الصفحات عند الطلب لتسريع الفتح الأول على الجوال
const NotFound = lazy(() => import("@/pages/not-found"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Loans = lazy(() => import("@/pages/loans"));
const Governance = lazy(() => import("@/pages/governance"));
const Expenses = lazy(() => import("@/pages/expenses"));
const Members = lazy(() => import("@/pages/members"));
const FamilySettings = lazy(() => import("@/pages/settings"));
const PaymentList = lazy(() => import("@/pages/payments"));
const Analytics = lazy(() => import("@/pages/analytics"));
const AdminDashboard = lazy(() => import("@/pages/admin-dashboard"));
const UserDashboard = lazy(() => import("@/pages/user-dashboard"));
const FundOps = lazy(() => import("@/pages/fund-ops"));
const MemberDetail = lazy(() => import("@/pages/member-detail"));
const AuditLog = lazy(() => import("@/pages/audit-log"));
const AnnualReport = lazy(() => import("@/pages/annual-report"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <AuthGuard>
      <Component />
    </AuthGuard>
  );
}

function AdminRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <AdminGuard>
      <Component />
    </AdminGuard>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Auth} />
        <Route path="/dashboard">{() => <ProtectedRoute component={Dashboard} />}</Route>
        <Route path="/loans">{() => <ProtectedRoute component={Loans} />}</Route>
        <Route path="/governance">{() => <ProtectedRoute component={Governance} />}</Route>
        <Route path="/expenses">{() => <ProtectedRoute component={Expenses} />}</Route>
        <Route path="/members">{() => <ProtectedRoute component={Members} />}</Route>
        <Route path="/settings">{() => <ProtectedRoute component={FamilySettings} />}</Route>
        <Route path="/payments">{() => <ProtectedRoute component={PaymentList} />}</Route>
        <Route path="/reports">{() => <ProtectedRoute component={Analytics} />}</Route>
        <Route path="/analytics">{() => <ProtectedRoute component={Analytics} />}</Route>
        <Route path="/admin">{() => <AdminRoute component={AdminDashboard} />}</Route>
        <Route path="/fund-ops">{() => <AdminRoute component={FundOps} />}</Route>
        <Route path="/members/:id">{() => <ProtectedRoute component={MemberDetail} />}</Route>
        <Route path="/profile">{() => <ProtectedRoute component={UserDashboard} />}</Route>
        <Route path="/audit-log">{() => <ProtectedRoute component={AuditLog} />}</Route>
        <Route path="/annual-report">{() => <AdminRoute component={AnnualReport} />}</Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div dir="rtl" className="min-h-screen bg-background text-foreground font-sans antialiased selection:bg-primary/20">
          <Toaster />
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
