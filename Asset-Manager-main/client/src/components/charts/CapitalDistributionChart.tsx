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
    fill: defaultColors[index % defaultColors.length],
  }));

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const isEmpty = total === 0;

  const displayData = isEmpty
    ? chartData.map((item) => ({ ...item, value: 1 }))
    : chartData;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      if (isEmpty) return null;
      const percentage = Math.round((item.value / total) * 100);
      return (
        <div className="rounded-2xl border border-border/60 bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
          <p className="mb-1 font-bold" style={{ color: item.fill }}>{item.name}</p>
          <p className="text-muted-foreground">{item.value.toLocaleString()} ر.ع</p>
          <p className="font-bold" style={{ color: item.fill }}>{percentage}% من الإجمالي</p>
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
      {/* Donut Chart — top, centered */}
      <div className="relative flex items-center justify-center py-2">
        <div className="h-[240px] w-full max-w-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={displayData}
                cx="50%"
                cy="50%"
                innerRadius={72}
                outerRadius={108}
                paddingAngle={isEmpty ? 2 : 4}
                cornerRadius={8}
                stroke="none"
                strokeWidth={0}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                {displayData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.fill}
                    opacity={isEmpty ? 0.25 : 1}
                  />
                ))}
              </Pie>
              {!isEmpty && <Tooltip content={<CustomTooltip />} />}
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Center label */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-extrabold font-mono text-primary leading-none">
            {isEmpty ? "—" : formatCompactCurrency(total)}
          </p>
          <p className="mt-1 text-[11px] font-bold text-muted-foreground">
            {isEmpty ? "لا توجد بيانات" : "ر.ع إجمالي"}
          </p>
        </div>
      </div>

      {/* Legend grid — 2×2 below chart */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {chartData.map((item) => {
          const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div
              key={item.name}
              className="flex flex-col gap-2 rounded-2xl border p-3.5"
              style={{ borderColor: `${item.fill}35`, backgroundColor: `${item.fill}0A` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.fill }}
                />
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-extrabold font-mono"
                  style={{ backgroundColor: `${item.fill}20`, color: item.fill }}
                >
                  {percentage}%
                </span>
              </div>
              <p
                className="text-[12px] font-bold leading-tight"
                style={{ color: item.fill }}
              >
                {item.name}
              </p>
              <p className="text-[11px] font-mono font-semibold text-muted-foreground">
                {formatCompactCurrency(item.value)} ر.ع
              </p>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
