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

const defaultColors = ["#10b981", "#f59e0b", "#6366f1", "#3b82f6"];
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
    fill: defaultColors[index % defaultColors.length],
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
      {/* Pie chart centered at top */}
      <div className="relative flex items-center justify-center">
        <div className="h-[260px] w-full max-w-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={115}
                paddingAngle={4}
                cornerRadius={8}
                stroke="rgba(255,255,255,1)"
                strokeWidth={4}
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
        {/* Center label inside donut */}
        <div className="pointer-events-none absolute flex flex-col items-center justify-center">
          <p className="text-[11px] font-bold text-muted-foreground">الإجمالي</p>
          <p className="text-lg font-extrabold font-mono text-primary leading-tight">
            {formatCompactCurrency(total)}
          </p>
          <p className="text-[10px] text-muted-foreground">ر.ع</p>
        </div>
      </div>

      {/* Legend grid below */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        {chartData.map((item) => {
          const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div
              key={item.name}
              className="rounded-2xl border p-3"
              style={{
                borderColor: `${item.fill}30`,
                backgroundColor: `${item.fill}0d`,
              }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: item.fill }}
                />
                <p className="text-[12px] font-bold leading-tight" style={{ color: item.fill }}>
                  {item.name}
                </p>
              </div>
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[13px] font-extrabold font-mono text-foreground">
                  {formatCompactCurrency(item.value)}
                  <span className="text-[10px] font-sans text-muted-foreground"> ر.ع</span>
                </span>
                <span
                  className="rounded-lg px-1.5 py-0.5 text-[11px] font-extrabold font-mono"
                  style={{ backgroundColor: `${item.fill}20`, color: item.fill }}
                >
                  {percentage}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
