import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChartCard } from "./ChartCard";
import { PieChartIcon } from "lucide-react";

interface CapitalDistributionChartProps {
  data: Array<{
    name: string;
    value: number;
    percentage?: number;
    color?: string;
  }>;
  loading?: boolean;
  delay?: number;
}

const defaultColors = ["#3b82f6", "#f59e0b", "#10b981", "#6366f1"];
const formatCompactCurrency = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : value.toLocaleString("en-US");

export function CapitalDistributionChart({
  data,
  loading = false,
  delay = 0,
}: CapitalDistributionChartProps) {
  if (loading) {
    return (
      <ChartCard
        title="توزيع رأس المال"
        icon={<PieChartIcon className="w-6 h-6" />}
        delay={delay}
      >
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </ChartCard>
    );
  }

  const chartData = data.map((item, index) => ({
    ...item,
    fill: item.color || defaultColors[index % defaultColors.length],
  }));

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const highestSlice = [...chartData].sort((a, b) => b.value - a.value)[0];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
      return (
        <div className="rounded-2xl border border-border/60 bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
          <p className="mb-1 font-bold text-foreground">{item.name}</p>
          <p className="text-muted-foreground">
            {item.value.toLocaleString()} ر.ع
          </p>
          <p className="font-medium text-primary">{percentage}% من الإجمالي</p>
        </div>
      );
    }
    return null;
  };

  return (
    <ChartCard
      title="توزيع رأس المال"
      icon={<PieChartIcon className="w-6 h-6" />}
      delay={delay}
    >
      <div className="mb-5 rounded-[1.5rem] border border-border/40 bg-gradient-to-l from-primary/[0.04] via-card to-card px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">أكبر مكوّن</p>
            <p className="mt-1.5 text-xl font-bold leading-tight text-foreground">{highestSlice?.name || "لا يوجد"}</p>
          </div>
          <div className="min-w-[80px] rounded-2xl bg-gradient-to-br from-primary to-emerald-600 px-4 py-2.5 text-center shadow-lg">
            <p className="text-2xl font-extrabold font-mono text-white">
              {highestSlice && total > 0 ? `${Math.round((highestSlice.value / total) * 100)}%` : "0%"}
            </p>
            <p className="text-[9px] font-medium text-white/70">من الإجمالي</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border/30 bg-gradient-to-b from-muted/20 to-card p-3">
          <div className="h-[240px] rounded-xl bg-card">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={4}
                cornerRadius={10}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={3}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-2">
          {chartData.map((item) => {
            const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl border border-border/30 bg-card px-3.5 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="h-3 w-3 rounded-md shrink-0 shadow-sm" style={{ backgroundColor: item.fill }} />
                  <p className="text-[13px] font-bold text-foreground truncate">{item.name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[12px] font-mono text-muted-foreground">{formatCompactCurrency(item.value)}</span>
                  <span className="rounded-md bg-muted/50 px-2 py-0.5 text-[11px] font-extrabold font-mono text-foreground">
                    {percentage}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-gradient-to-r from-primary to-emerald-600 px-5 py-4 text-center shadow-lg">
        <p className="text-3xl font-extrabold font-mono text-white">
          {total.toLocaleString("en-US")} <span className="text-sm font-sans font-bold text-white/70">ر.ع</span>
        </p>
        <p className="mt-1 text-[11px] font-bold text-white/60">إجمالي الأصول</p>
      </div>
    </ChartCard>
  );
}
