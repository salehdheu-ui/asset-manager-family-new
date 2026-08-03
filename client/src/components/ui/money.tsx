import { cn } from "@/lib/utils";

type Tone = "in" | "out" | "due" | "neutral";

interface Props {
  amount: number | string;
  /** اتجاه المبلغ يحدد لونه: داخل الصندوق أخضر، خارج منه كهرماني، متأخر أحمر */
  tone?: Tone;
  /** إظهار + أو − قبل الرقم */
  sign?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const TONES: Record<Tone, string> = {
  in: "text-primary",
  out: "text-amber-700",
  due: "text-destructive",
  neutral: "text-foreground",
};

const SIZES = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-lg",
  xl: "text-3xl",
};

// العملة لا تُصغَّر نسبياً وإلا نزلت تحت أرضية الـ12px — تُقاس بمقاسها الخاص
const CURRENCY = {
  sm: "text-xs",
  md: "text-xs",
  lg: "text-xs",
  xl: "text-sm",
};

// عرض موحّد لكل مبلغ في النظام: أرقام جدولية تصطف رأسياً، ثلاث خانات عشرية،
// والعملة بحجم أصغر حتى يبقى الرقم هو البطل.
export default function Money({ amount, tone = "neutral", sign = false, size = "md", className }: Props) {
  const value = Number(amount) || 0;
  const prefix = sign && value > 0 ? "+" : sign && value < 0 ? "−" : "";
  const shown = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

  return (
    <span className={cn("tabular font-bold", SIZES[size], TONES[tone], className)} dir="ltr">
      {prefix}{shown}
      <span className={cn("mr-1 font-sans font-normal opacity-70", CURRENCY[size])}>ر.ع</span>
    </span>
  );
}
