import React from "react";
import { Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Area, ComposedChart, ReferenceLine } from "recharts";
import { ChartCard } from "./ChartCard";
import { TrendingUp, TrendingDown, Star, BarChart2, Sigma } from "lucide-react";

interface ContributionsTrendChartProps {
  data: Array<{
    month: string;
    amount: number;
    count?: number;
    year?: number;
  }>;
  loading?: boolean;
  delay?: number;
}

export function ContributionsTrendChart({
  data,
  loading = false,
  delay = 0,
}: ContributionsTrendChartProps) {
  if (loading) {
    return (
      <ChartCard
        title="تطور المساهمات"
        icon={<TrendingUp className="w-5 h-5" />}
        delay={delay}
      >
        <div className="flex h-52 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </ChartCard>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-fund-in-bright/40 bg-white px-4 py-3 text-xs shadow-xl">
          <p className="mb-1.5 font-bold text-foreground">{label}</p>
          <p className="text-base font-bold font-mono text-fund-in">
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

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
  const avgAmount = data.length > 0 ? totalAmount / data.length : 0;
  const bestMonth = [...data].sort((a, b) => b.amount - a.amount)[0];
  const isUpward = data.length > 1 && data[data.length - 1].amount >= data[0].amount;

  return (
    <ChartCard
      title="تطور المساهمات"
      icon={<TrendingUp className="w-5 h-5" />}
      delay={delay}
    >
      {/* stat pills */}
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-card p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fund-in to-fund-in text-white shadow-md">
            <Star className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">أفضل شهر</p>
            <p className="mt-0.5 text-sm font-bold text-foreground leading-tight">{bestMonth?.month || "—"}</p>
            <p className="text-xs font-mono text-fund-in">
              {bestMonth ? `${bestMonth.amount.toLocaleString("en-US")} ر.ع` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-card p-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-md text-white ${isUpward ? "bg-gradient-to-br from-fund-in to-fund-in" : "bg-gradient-to-br from-fund-out to-fund-out"}`}>
            {isUpward ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">اتجاه الحركة</p>
            <p className={`mt-0.5 text-sm font-bold leading-tight ${isUpward ? "text-fund-in" : "text-fund-out"}`}>
              {isUpward ? "تصاعدي" : "متذبذب"}
            </p>
            <p className="text-xs text-muted-foreground">آخر {data.length} فترات</p>
          </div>
        </div>
      </div>

      {/* chart */}
      <div className="h-56 rounded-lg border border-border/30 bg-gradient-to-b from-muted/20 to-card p-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="contributionAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-in)" stopOpacity={0.22} />
                <stop offset="85%" stopColor="var(--chart-in)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" opacity={0.6} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
              axisLine={false}
              tickLine={false}
              width={32}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={avgAmount}
              stroke="var(--chart-in)"
              strokeDasharray="5 4"
              strokeOpacity={0.35}
              strokeWidth={1.5}
            />
            <Area type="monotone" dataKey="amount" stroke="none" fill="url(#contributionAreaGrad)" />
            <Line
              type="monotone"
              dataKey="amount"
              stroke="var(--chart-in)"
              strokeWidth={2.5}
              dot={{ fill: "#ffffff", stroke: "var(--chart-in)", strokeWidth: 2.5, r: 4 }}
              activeDot={{ r: 7, fill: "var(--chart-in)", stroke: "#ffffff", strokeWidth: 2.5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* footer summary */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="flex items-center gap-2.5 rounded-xl border border-border/30 bg-card px-3.5 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-fund-in to-fund-in text-white shadow-sm">
            <Sigma className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">المجموع</p>
            <p className="text-sm font-extrabold font-mono text-foreground">
              {totalAmount.toLocaleString("en-US")} <span className="text-xs text-muted-foreground">ر.ع</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-border/30 bg-card px-3.5 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/80 to-primary text-white shadow-sm">
            <BarChart2 className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">المتوسط الشهري</p>
            <p className="text-sm font-extrabold font-mono text-foreground">
              {Math.round(avgAmount).toLocaleString("en-US")} <span className="text-xs text-muted-foreground">ر.ع</span>
            </p>
          </div>
        </div>
      </div>
    </ChartCard>
  );
}
