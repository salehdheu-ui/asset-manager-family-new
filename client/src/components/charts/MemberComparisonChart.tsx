import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { ChartCard } from "./ChartCard";
import { Users, Medal, Trophy } from "lucide-react";

interface MemberComparisonChartProps {
  data: Array<{
    name: string;
    amount: number;
    count?: number;
  }>;
  loading?: boolean;
  delay?: number;
  limit?: number;
}

const rankConfig = [
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-600", badge: "bg-amber-100 text-amber-700", icon: "🥇" },
  { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-500", badge: "bg-slate-100 text-slate-600", icon: "🥈" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-500", badge: "bg-orange-100 text-orange-600", icon: "🥉" },
  { bg: "bg-blue-50/40",  border: "border-blue-100",  text: "text-blue-500",  badge: "bg-blue-50 text-blue-600",  icon: "4" },
  { bg: "bg-violet-50/40", border: "border-violet-100", text: "text-violet-500", badge: "bg-violet-50 text-violet-600", icon: "5" },
];

const barColors = ["#f59e0b", "#94a3b8", "#f97316", "#3b82f6", "#8b5cf6"];

export function MemberComparisonChart({
  data,
  loading = false,
  delay = 0,
  limit = 5,
}: MemberComparisonChartProps) {
  if (loading) {
    return (
      <ChartCard
        title="أداء الأعضاء"
        icon={<Users className="w-5 h-5" />}
        delay={delay}
      >
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </ChartCard>
    );
  }

  const limitedData = data.slice(0, limit);
  const maxAmount = limitedData[0]?.amount || 1;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-2xl border border-border/60 bg-white px-4 py-3 text-xs shadow-xl">
          <p className="mb-1.5 font-bold text-foreground">{label}</p>
          <p className="text-base font-bold font-mono text-blue-600">
            {payload[0].value.toLocaleString("en-US")}
            <span className="text-xs font-sans text-muted-foreground mr-1"> ر.ع</span>
          </p>
          {payload[0].payload.count && (
            <p className="mt-1 text-muted-foreground">{payload[0].payload.count} مساهمة</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <ChartCard
      title="أداء الأعضاء"
      icon={<Users className="w-5 h-5" />}
      delay={delay}
    >
      {/* top member hero */}
      {limitedData[0] && (
        <div className="mb-4 flex items-center gap-4 rounded-xl border border-border/30 bg-card px-4 py-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-yellow-500 text-white shadow-lg">
            <Trophy className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">الأعلى مساهمة</p>
            <p className="mt-0.5 truncate text-base font-bold text-foreground leading-tight">{limitedData[0].name}</p>
          </div>
          <div className="text-left shrink-0">
            <p className="text-lg font-extrabold font-mono text-amber-600">{limitedData[0].amount.toLocaleString("en-US")}</p>
            <p className="text-[9px] text-muted-foreground text-left">ر.ع</p>
          </div>
        </div>
      )}

      {/* bar chart */}
      <div className="h-52 rounded-2xl border border-border/30 bg-gradient-to-b from-muted/20 to-card p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={limitedData} margin={{ top: 8, right: 4, left: -10, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={-25}
              textAnchor="end"
              height={46}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={30}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="amount" radius={[10, 10, 4, 4]} maxBarSize={38}>
              {limitedData.map((_, index) => (
                <Cell key={index} fill={barColors[index % barColors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ranked list */}
      <div className="mt-4 space-y-2">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">ترتيب الأعضاء</p>
        {limitedData.map((member, index) => {
          const cfg = rankConfig[index] || rankConfig[rankConfig.length - 1];
          const pct = maxAmount > 0 ? Math.round((member.amount / maxAmount) * 100) : 0;
          return (
            <div
              key={member.name}
              className="flex items-center gap-3 rounded-xl border border-border/30 bg-card px-3 py-2.5 transition-colors hover:bg-muted/20"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold ${cfg.badge}`}>
                {cfg.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="truncate text-[12px] font-bold text-foreground">{member.name}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: barColors[index] }}
                  />
                </div>
              </div>
              <p className="shrink-0 text-[12px] font-extrabold font-mono text-foreground">
                {member.amount.toLocaleString("en-US")}
                <span className="text-[9px] font-sans text-muted-foreground mr-0.5"> ر.ع</span>
              </p>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
