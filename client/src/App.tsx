import { lazy, Suspense, useEffect, useState } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AuthGuard from "@/components/AuthGuard";
import AdminGuard from "@/components/AdminGuard";
import ErrorBoundary from "@/components/ErrorBoundary";
import InstallPrompt from "@/components/InstallPrompt";
import PushInvite from "@/components/PushInvite";
import UpdateBanner from "@/components/UpdateBanner";
import { registerServiceWorker } from "@/lib/pwa";
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
const ReportBuilder = lazy(() => import("@/pages/report-builder"));
const PlatformReview = lazy(() => import("@/pages/platform-review"));
const Onboarding = lazy(() => import("@/pages/onboarding"));
const Investments = lazy(() => import("@/pages/investments"));
const Proposals = lazy(() => import("@/pages/proposals"));
const Notifications = lazy(() => import("@/pages/notifications"));
const InstallHelp = lazy(() => import("@/pages/install"));

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
        {/* بلا حماية: من يتعثّر في التثبيت قد لا يكون داخلاً أصلاً */}
        <Route path="/install" component={InstallHelp} />
        <Route path="/dashboard">{() => <ProtectedRoute component={Dashboard} />}</Route>
        <Route path="/loans">{() => <ProtectedRoute component={Loans} />}</Route>
        <Route path="/governance">{() => <ProtectedRoute component={Governance} />}</Route>
        <Route path="/expenses">{() => <ProtectedRoute component={Expenses} />}</Route>
        <Route path="/members">{() => <ProtectedRoute component={Members} />}</Route>
        <Route path="/settings">{() => <ProtectedRoute component={FamilySettings} />}</Route>
        <Route path="/payments">{() => <ProtectedRoute component={PaymentList} />}</Route>
        {/* /reports مسار قديم — يوجّه للمسار الرسمي حتى تبقى الروابط المحفوظة تعمل */}
        <Route path="/reports">{() => <Redirect to="/analytics" replace />}</Route>
        <Route path="/analytics">{() => <ProtectedRoute component={Analytics} />}</Route>
        <Route path="/admin">{() => <AdminRoute component={AdminDashboard} />}</Route>
        <Route path="/fund-ops">{() => <AdminRoute component={FundOps} />}</Route>
        <Route path="/members/:id">{() => <ProtectedRoute component={MemberDetail} />}</Route>
        <Route path="/profile">{() => <ProtectedRoute component={UserDashboard} />}</Route>
        <Route path="/audit-log">{() => <ProtectedRoute component={AuditLog} />}</Route>
        <Route path="/annual-report">{() => <AdminRoute component={AnnualReport} />}</Route>
        <Route path="/report-builder">{() => <AdminRoute component={ReportBuilder} />}</Route>
        <Route path="/platform-review">{() => <AdminRoute component={PlatformReview} />}</Route>
        <Route path="/onboarding">{() => <AdminRoute component={Onboarding} />}</Route>
        <Route path="/investments">{() => <AdminRoute component={Investments} />}</Route>
        <Route path="/proposals">{() => <ProtectedRoute component={Proposals} />}</Route>
        <Route path="/notifications">{() => <AdminRoute component={Notifications} />}</Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

/** يسجّل عامل الخدمة ويصل ضغطة الإشعار بالتوجيه داخل التطبيق */
function ServiceWorkerHost() {
  const [, setLocation] = useLocation();
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    registerServiceWorker({
      onUpdateReady: () => setUpdateReady(true),
      // الضغط على إشعار والتطبيق مفتوح: ننتقل داخلياً بدل إعادة تحميل الصفحة
      onNavigate: (url) => setLocation(url),
    });
  }, [setLocation]);

  if (!updateReady) return null;
  return <UpdateBanner onDismiss={() => setUpdateReady(false)} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div dir="rtl" className="min-h-screen bg-background text-foreground font-sans antialiased selection:bg-primary/20">
          <Toaster />
          <ServiceWorkerHost />
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
          <InstallPrompt />
          {/* بعد التثبيت تأتي دعوة الإشعارات — بطاقة واحدة في الشاشة لا اثنتان */}
          <PushInvite />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
