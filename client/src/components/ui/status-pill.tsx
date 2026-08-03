import { cn } from "@/lib/utils";

export type StatusTone = "positive" | "pending" | "danger" | "neutral";

// أربع حالات فقط في النظام كله — اللون يحمل معنى واحداً لا يتغيّر من شاشة لأخرى:
// أخضر = تمّ واعتُمد · كهرماني = ينتظر قراراً · أحمر = متأخر أو مرفوض · رمادي = معلومة محايدة
const TONES: Record<StatusTone, string> = {
  positive: "bg-primary/10 border-primary/20 text-primary",
  pending: "bg-fund-out/14 border-fund-out/25 text-fund-out",
  danger: "bg-destructive/10 border-destructive/25 text-destructive",
  neutral: "bg-muted border-border text-muted-foreground",
};

interface Props {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}

export default function StatusPill({ tone, children, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
