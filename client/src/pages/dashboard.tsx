import { useQuery } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import CapitalLayerCard from "@/components/dashboard/CapitalLayerCard";
import { getDashboardSummary } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { AlertTriangle, TrendingUp, ShieldCheck, Wallet, ArrowUpRight, HandCoins, Users, CreditCard, History, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const layerMeta: Record<string, { arabicName: string; color: string }> = {
  protected: { arabicName: "رأس المال المحمي", color: "bg-primary" },
  emergency: { arabicName: "احتياطي الطوارئ", color: "bg-amber-600" },
  flexible: { arabicName: "رأس المال المرن", color: "bg-emerald-500" },
  growth: { arabicName: "رأس مال النمو", color: "bg-blue-600" },
};

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
  });

  const quickActions = [
    { label: "المساهمات", icon: CreditCard, href: "/payments", color: "bg-emerald-500" },
    ...(isAdmin ? [{ label: "الإنفاق", icon: Wallet, href: "/expenses", color: "bg-amber-500" }] : []),
    { label: "السلف", icon: HandCoins, href: "/loans", color: "bg-blue-500" },
    { label: "التقارير", icon: FileText, href: "/reports", color: "bg-purple-500" },
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
  const totalContributions = summary?.totalContributions || 0;
  const totalExpenses = (summary?.totalExpenses || 0) + (summary?.totalLoans || 0) - (summary?.totalRepayments || 0);

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
          className="text-center space-y-2 py-8 bg-card border border-border/40 rounded-[2.5rem] shadow-sm relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <p className="text-sm text-muted-foreground font-medium">صافي الأصول المعتمدة</p>
          <h2 className="text-5xl font-bold font-mono text-primary tracking-tighter">
            {totalCapital.toLocaleString()} <span className="text-xl text-muted-foreground font-sans">ر.ع</span>
          </h2>
          <div className="flex items-center justify-center gap-3 mt-4">
            <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700 text-[11px] font-bold flex items-center gap-1.5 border border-emerald-500/20 shadow-sm">
              <ShieldCheck className="w-4 h-4" />
              <span>الاعتمادات نشطة</span>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions Grid */}
        <div className={cn("grid gap-4", quickActions.length <= 3 ? "grid-cols-3" : "grid-cols-4")}>
          {quickActions.map((action) => (
            <Link key={action.label} href={action.href} className="flex flex-col items-center gap-2 group" data-testid={`link-${action.href.slice(1)}`}>
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform group-active:scale-95",
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
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-3xl p-5 flex flex-col gap-1 relative overflow-hidden group">
            <div className="absolute -right-2 -bottom-2 opacity-5 transition-transform group-hover:scale-110">
              <TrendingUp className="w-16 h-16" />
            </div>
            <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">الإيداعات</span>
            <span className="text-2xl font-bold font-mono text-emerald-600">
              {totalContributions.toLocaleString()} <span className="text-xs">ر.ع</span>
            </span>
          </div>
          <div className="bg-amber-50/50 border border-amber-100 rounded-3xl p-5 flex flex-col gap-1 relative overflow-hidden group">
            <div className="absolute -right-2 -bottom-2 opacity-5 transition-transform group-hover:scale-110">
              <History className="w-16 h-16" />
            </div>
            <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">المصروفات</span>
            <span className="text-2xl font-bold font-mono text-amber-600">
              {totalExpenses.toLocaleString()} <span className="text-xs">ر.ع</span>
            </span>
          </div>
        </div>

        {/* Capital Layers Section */}
        <div className="space-y-4 pb-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-lg text-primary font-heading">توزيع المحفظة</h3>
            <span className="text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full font-bold uppercase tracking-wider">45/15/20/20</span>
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
