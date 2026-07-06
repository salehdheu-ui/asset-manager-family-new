import { Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Area, ComposedChart, ReferenceLine } from "recharts";
import { ChartCard } from "./ChartCard";
import { Telescope, Wallet, CalendarClock } from "lucide-react";
import type { CashflowForecast } from "@/lib/api";

const MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function labelOf(month: string) {
  const [, m] = month.split("-");
  return MONTH_NAMES[Number(m) - 1] ?? month;
}

export function CashflowForecastChart({ data, loading = false, delay = 0 }: { data?: CashflowForecast; loading?: boolean; delay?: number }) {
  if (loading || !data) {
    return (
      <ChartCard title="إسقاط السيولة — 6 أشهر قادمة" icon={<Telescope className="w-5 h-5" />} delay={delay}>
        <div className="flex h-52 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </ChartCard>
    );
  }

  const chartData = [
    { month: "الآن", projectedBalance: data.currentBalance, expectedContributions: 0, scheduledRepayments: 0 },
    ...data.forecast.map((f) => ({ ...f, month: labelOf(f.month) })),
  ];
  const last = data.forecast[data.forecast.length - 1];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const row = payload[0].payload;
      return (
        <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-xs shadow-xl">
          <p className="mb-1.5 font-bold text-foreground">{label}</p>
          <p className="text-base font-bold font-mono text-emerald-600">
            {row.projectedBalance.toLocaleString("en-US")}
            <span className="text-xs font-sans text-muted-foreground mr-1"> ر.ع</span>
          </p>
          {row.expectedContributions > 0 && (
            <p className="mt-1 text-muted-foreground">مساهمات متوقعة: {row.expectedContributions.toLocaleString("en-US")}</p>
          )}
          {row.scheduledRepayments > 0 && (
            <p className="text-muted-foreground">أقساط مجدولة: {row.scheduledRepayments.toLocaleString("en-US")}</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <ChartCard title="إسقاط السيولة — 6 أشهر قادمة" icon={<Telescope className="w-5 h-5" />} delay={delay}>
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-card p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">الرصيد المتوقع بعد 6 أشهر</p>
            <p className="mt-0.5 text-sm font-extrabold font-mono text-emerald-600">
              {last ? last.projectedBalance.toLocaleString("en-US") : "—"} <span className="text-[10px] font-sans text-muted-foreground">ر.ع</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-card p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/80 to-primary text-white shadow-md">
            <CalendarClock className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">متوسط المساهمات الشهري</p>
            <p className="mt-0.5 text-sm font-extrabold font-mono text-foreground">
              {data.avgMonthlyContributions.toLocaleString("en-US")} <span className="text-[10px] text-muted-foreground">ر.ع</span>
            </p>
          </div>
        </div>
      </div>

      <div className="h-56 rounded-2xl border border-border/30 bg-gradient-to-b from-muted/20 to-card p-3" data-testid="cashflow-forecast-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="forecastAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.22} />
                <stop offset="85%" stopColor="#10b981" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={36}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={data.currentBalance} stroke="#94a3b8" strokeDasharray="5 4" strokeOpacity={0.4} strokeWidth={1.5} />
            <Area type="monotone" dataKey="projectedBalance" stroke="none" fill="url(#forecastAreaGrad)" />
            <Line
              type="monotone"
              dataKey="projectedBalance"
              stroke="#10b981"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={{ fill: "#ffffff", stroke: "#10b981", strokeWidth: 2.5, r: 4 }}
              activeDot={{ r: 7, fill: "#10b981", stroke: "#ffffff", strokeWidth: 2.5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-[10px] leading-5 text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
        {data.note}
      </p>
    </ChartCard>
  );
}
