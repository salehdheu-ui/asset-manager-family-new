import { useQuery } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import CapitalLayerCard from "@/components/dashboard/CapitalLayerCard";
import { getDashboardSummary, getMembers } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { AlertTriangle, TrendingUp, ShieldCheck, Wallet, ArrowUpRight, HandCoins, Users, CreditCard, History, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useState } from "react";

const layerMeta: Record<string, { arabicName: string; color: string }> = {
  protected: { arabicName: "رأس المال المحمي", color: "bg-primary" },
  emergency: { arabicName: "احتياطي الطوارئ", color: "bg-fund-out" },
  flexible: { arabicName: "رأس المال المرن", color: "bg-fund-in" },
  growth: { arabicName: "رأس مال النمو", color: "bg-fund-loan" },
};

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
  });
  const { data: members = [], isSuccess: membersLoaded } = useQuery({
    queryKey: ["members"],
    queryFn: getMembers,
    enabled: isAdmin,
  });
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => localStorage.getItem("family_onboarding_dismissed") === "1");
  const showOnboarding = isAdmin && membersLoaded && members.length === 0 && !onboardingDismissed;

  const quickActions = [
    { label: "المساهمات", icon: CreditCard, href: "/payments", color: "bg-fund-in" },
    ...(isAdmin ? [{ label: "الإنفاق", icon: Wallet, href: "/expenses", color: "bg-fund-out" }] : []),
    { label: "السلف", icon: HandCoins, href: "/loans", color: "bg-fund-loan" },
    { label: "التقارير", icon: FileText, href: "/reports", color: "bg-secondary" },
  ];

  if (isLoading) {
    return (
      <MobileLayout title="المجلس المالي">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </MobileLayout>
    );
  }

  const totalCapital = summary?.netCapital || 0;
  // العجز يُعرض كما هو: تصفيره في الشاشة يطمئن الوصي في اللحظة التي يجب أن يقلق فيها
  const inDeficit = summary?.inDeficit === true;
  // العنوان يحمل الإشارة («عجز في الصندوق»)، فيُعرض المقدار مجرداً — إشارة سالبة
  // داخل نص عربي تُقرأ في غير موضعها
  const displayedCapital = inDeficit ? Math.abs(summary?.actualNetCapital ?? 0) : totalCapital;
  const totalContributions = (summary?.totalContributions || 0) + (summary?.totalDeposits || 0);
  const totalExpenses = (summary?.totalExpenses || 0) + (summary?.totalLoans || 0) - (summary?.totalRepayments || 0) + (summary?.totalWithdrawals || 0);

  const defaultLayers = [
    { id: "protected", name: "رأس المال المحمي", percentage: 45, amount: totalCapital * 0.45, locked: true, used: 0, available: 0 },
    { id: "emergency", name: "احتياطي الطوارئ", percentage: 15, amount: totalCapital * 0.15, locked: true, used: 0, available: totalCapital * 0.15 },
    { id: "flexible", name: "رأس المال المرن", percentage: 20, amount: totalCapital * 0.20, locked: false, used: 0, available: totalCapital * 0.20 },
    { id: "growth", name: "رأس مال النمو", percentage: 20, amount: totalCapital * 0.20, locked: true, used: 0, available: totalCapital * 0.20 },
  ];

  const rawLayers = summary?.layers && summary.layers.length > 0 ? summary.layers : defaultLayers;
  const layers = rawLayers.map((layer) => ({
    ...layer,
    arabicName: layerMeta[layer.id]?.arabicName || layer.name,
    color: layerMeta[layer.id]?.color || "bg-gray-500",
  }));

  return (
    <MobileLayout title="المجلس المالي">
      <div className="space-y-6 pt-1">
        
        {/* Total Wealth Summary */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-2 py-8 bg-card border border-border/70 rounded-xl shadow-sm relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <p className="text-sm text-muted-foreground font-medium">
            {inDeficit ? "عجز في الصندوق" : "صافي الأصول المعتمدة"}
          </p>
          <h2 className={cn(
            "text-5xl font-bold font-mono tracking-tighter",
            inDeficit ? "text-destructive" : "text-primary",
          )}>
            {displayedCapital.toLocaleString()} <span className="text-xl text-muted-foreground font-sans">ر.ع</span>
          </h2>
          <div className="flex items-center justify-center gap-3 mt-4">
            {inDeficit ? (
              <Link
                href="/reconcile"
                className="px-4 py-1.5 rounded-full bg-destructive/15 text-destructive text-xs font-bold flex items-center gap-1.5 border border-destructive/40 shadow-sm"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>الخارج أكثر من الداخل — راجع التدقيق</span>
              </Link>
            ) : (
              <div className="px-4 py-1.5 rounded-full bg-fund-in-bright/20 text-fund-in text-xs font-bold flex items-center gap-1.5 border border-fund-in-bright/40 shadow-sm">
                <ShieldCheck className="w-4 h-4" />
                <span>الاعتمادات نشطة</span>
              </div>
            )}
          </div>
        </motion.div>

        {showOnboarding && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-amber-50/60 p-5 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary"><Users className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-primary/65">خطوة البداية</p>
                <h3 className="mt-1 font-heading text-lg font-black text-primary">أكمل إعداد صندوق العائلة</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">أدخل اسم الصندوق، قواعد التوزيع، وأسماء الأعضاء في أربع خطوات قصيرة.</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link href="/onboarding" className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground shadow-sm transition hover:bg-primary/90">بدء الإعداد<ArrowUpRight className="h-4 w-4" /></Link>
                  <button onClick={() => { localStorage.setItem("family_onboarding_dismissed", "1"); setOnboardingDismissed(true); }} className="rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground transition hover:bg-muted">لاحقًا</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Quick Actions Grid */}
        <div className={cn("grid gap-4", quickActions.length <= 3 ? "grid-cols-3" : "grid-cols-4")}>
          {quickActions.map((action) => (
            <Link key={action.label} href={action.href} className="flex flex-col items-center gap-2 group" data-testid={`link-${action.href.slice(1)}`}>
              <div className={cn(
                "w-14 h-14 rounded-lg flex items-center justify-center text-white shadow-lg transition-transform group-active:scale-95",
                action.color
              )}>
                <action.icon className="w-7 h-7" />
              </div>
              <span className="text-xs font-bold text-muted-foreground">{action.label}</span>
            </Link>
          ))}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-fund-in-bright/20 border border-fund-in-bright/40 rounded-xl p-5 flex flex-col gap-1 relative overflow-hidden group">
            <div className="absolute -right-2 -bottom-2 opacity-5 transition-transform group-hover:scale-110">
              <TrendingUp className="w-16 h-16" />
            </div>
            <span className="text-xs text-fund-in font-bold uppercase tracking-wider">الإيداعات</span>
            <span className="text-2xl font-bold font-mono text-fund-in">
              {totalContributions.toLocaleString()} <span className="text-xs">ر.ع</span>
            </span>
          </div>
          <div className="bg-fund-out-bright/20 border border-fund-out-bright/40 rounded-xl p-5 flex flex-col gap-1 relative overflow-hidden group">
            <div className="absolute -right-2 -bottom-2 opacity-5 transition-transform group-hover:scale-110">
              <History className="w-16 h-16" />
            </div>
            <span className="text-xs text-fund-out font-bold uppercase tracking-wider">المصروفات</span>
            <span className="text-2xl font-bold font-mono text-fund-out">
              {totalExpenses.toLocaleString()} <span className="text-xs">ر.ع</span>
            </span>
          </div>
        </div>

        {/* Capital Layers Section */}
        <div className="space-y-4 pb-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-lg text-primary font-heading">توزيع المحفظة</h3>
            <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full font-bold uppercase tracking-wider">{layers.map(l => l.percentage).join('/')}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {layers.map((layer, idx) => (
              <CapitalLayerCard key={layer.id} layer={layer} delay={idx} />
            ))}
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}
