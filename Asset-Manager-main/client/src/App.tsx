import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AuthGuard from "@/components/AuthGuard";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Auth from "@/pages/auth";
import Loans from "@/pages/loans";
import Governance from "@/pages/governance";
import Expenses from "@/pages/expenses";
import Members from "@/pages/members";
import FamilySettings from "@/pages/settings";
import PaymentList from "@/pages/payments";
import Reports from "@/pages/reports";
import AdminDashboard from "@/pages/admin-dashboard";
import UserDashboard from "@/pages/user-dashboard";

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <AuthGuard>
      <Component />
    </AuthGuard>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Auth} />
      <Route path="/dashboard">{() => <ProtectedRoute component={Dashboard} />}</Route>
      <Route path="/loans">{() => <ProtectedRoute component={Loans} />}</Route>
      <Route path="/governance">{() => <ProtectedRoute component={Governance} />}</Route>
      <Route path="/expenses">{() => <ProtectedRoute component={Expenses} />}</Route>
      <Route path="/members">{() => <ProtectedRoute component={Members} />}</Route>
      <Route path="/settings">{() => <ProtectedRoute component={FamilySettings} />}</Route>
      <Route path="/payments">{() => <ProtectedRoute component={PaymentList} />}</Route>
      <Route path="/reports">{() => <ProtectedRoute component={Reports} />}</Route>
      <Route path="/admin">{() => <ProtectedRoute component={AdminDashboard} />}</Route>
      <Route path="/profile">{() => <ProtectedRoute component={UserDashboard} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div dir="rtl" className="min-h-screen bg-background text-foreground font-sans antialiased selection:bg-primary/20">
          <Toaster />
          <Router />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
