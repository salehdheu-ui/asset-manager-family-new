import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import {
  getInvestments,
  createInvestment,
  addInvestmentValuation,
  exitInvestment,
  deleteInvestment,
  previewInvestmentLimit,
  getZakatStatus,
  startZakatCycle,
  payZakat,
  type InvestmentRow,
} from "@/lib/api";
import { TrendingUp, TrendingDown, Plus, Building2, LineChart, Briefcase, Coins, Trash2, LogOut, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { extractErrorMessage } from "@/lib/errors";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useOverdraftGate } from "@/hooks/use-overdraft-gate";

const TYPE_LABELS: Record<string, string> = {
  property: "عقار",
  stocks: "أسهم",
  project: "مشروع",
  other: "أخرى",
};

const TYPE_ICONS: Record<string, typeof Building2> = {
  property: Building2,
  stocks: LineChart,
  project: Briefcase,
  other: Coins,
};

const fmt = (n: number) => n.toLocaleString("ar-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("ar-OM") : "—");
const today = () => new Date().toISOString().slice(0, 10);

export default function Investments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const gate = useOverdraftGate();

  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("property");
  const [amount, setAmount] = useState("");
  const [startedAt, setStartedAt] = useState(today());
  const [note, setNote] = useState("");

  const [valuationTarget, setValuationTarget] = useState<InvestmentRow | null>(null);
  const [valuationValue, setValuationValue] = useState("");
  const [valuationDate, setValuationDate] = useState(today());

  const [exitTarget, setExitTarget] = useState<InvestmentRow | null>(null);
  const [exitValue, setExitValue] = useState("");

  const [zakatAmount, setZakatAmount] = useState("");
  const [zakatOpen, setZakatOpen] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["investments"], queryFn: getInvestments });
  const { data: zakat } = useQuery({ queryKey: ["zakat"], queryFn: getZakatStatus });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["investments"] });
    queryClient.invalidateQueries({ queryKey: ["zakat"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    queryClient.invalidateQueries({ queryKey: ["allocation"] });
  };

  const fail = (error: unknown, fallback: string) =>
    toast({ title: fallback, description: extractErrorMessage(error), variant: "destructive" });

  const addMutation = useMutation({
    mutationFn: () => createInvestment({ title: title.trim(), type, amount: amount.trim(), startedAt, note: note.trim() || null }),
    onSuccess: () => {
      refresh();
      setAddOpen(false);
      setTitle(""); setAmount(""); setNote(""); setStartedAt(today());
      toast({ title: "سُجّل الاستثمار" });
    },
    onError: (e) => fail(e, "تعذر تسجيل الاستثمار"),
  });

  const valuationMutation = useMutation({
    mutationFn: () => addInvestmentValuation(valuationTarget!.id, { value: valuationValue.trim(), valuedAt: valuationDate }),
    onSuccess: () => {
      refresh();
      setValuationTarget(null); setValuationValue(""); setValuationDate(today());
      toast({ title: "سُجّل التقييم" });
    },
    onError: (e) => fail(e, "تعذر تسجيل التقييم"),
  });

  const exitMutation = useMutation({
    mutationFn: () => exitInvestment(exitTarget!.id, { exitValue: exitValue.trim() }),
    onSuccess: (result) => {
      refresh();
      setExitTarget(null); setExitValue("");
      toast({
        title: result.gain >= 0 ? `تمت التصفية بربح ${fmt(result.gain)} ر.ع` : `تمت التصفية بخسارة ${fmt(Math.abs(result.gain))} ر.ع`,
      });
    },
    onError: (e) => fail(e, "تعذرت تصفية الاستثمار"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteInvestment(id),
    onSuccess: () => { refresh(); toast({ title: "حُذف الاستثمار" }); },
    onError: (e) => fail(e, "تعذر حذف الاستثمار"),
  });

  const startCycleMutation = useMutation({
    mutationFn: () => startZakatCycle({}),
    onSuccess: () => { refresh(); toast({ title: "بدأت دورة حول جديدة" }); },
    onError: (e) => fail(e, "تعذر بدء دورة الزكاة"),
  });

  const payZakatMutation = useMutation({
    mutationFn: () => payZakat(zakat!.currentCycle!.id, zakatAmount.trim() ? { amount: zakatAmount.trim() } : {}),
    onSuccess: () => {
      refresh();
      setZakatOpen(false); setZakatAmount("");
      toast({ title: "سُجّل إخراج الزكاة كمصروف" });
    },
    onError: (e) => fail(e, "تعذر تسجيل إخراج الزكاة"),
  });

  if (isLoading) {
    return (
      <MobileLayout title="الاستثمار والزكاة">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </MobileLayout>
    );
  }

  const investments = data?.investments ?? [];
  const growth = data?.growthLayer;
  const cycle = zakat?.currentCycle;

  return (
    <MobileLayout title="الاستثمار والزكاة">
      <div className="space-y-6 pt-2 pb-12">
        {/* الزكاة */}
        <div className="bg-secondary/10 border border-secondary/30 rounded-xl p-5 space-y-3" data-testid="card-zakat">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-primary font-heading">زكاة مال الصندوق</h3>
          </div>

          {!cycle ? (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                لا توجد دورة حول جارية. ابدأ الحول من اليوم ليتابع النظام اكتماله (354 يوماً) وينبّهك عند وجوب الزكاة.
              </p>
              <button
                onClick={() => startCycleMutation.mutate()}
                disabled={startCycleMutation.isPending}
                className="tap-target w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold active:scale-95 transition-transform disabled:opacity-50"
                data-testid="button-start-hawl"
              >
                بدء حول جديد من اليوم
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-background/60 rounded-xl p-3">
                  <p className="text-muted-foreground mb-1">بداية الحول</p>
                  <p className="font-bold">{fmtDate(cycle.cycleStart)}</p>
                </div>
                <div className="bg-background/60 rounded-xl p-3">
                  <p className="text-muted-foreground mb-1">{cycle.hawlComplete ? "الحالة" : "المتبقي للحول"}</p>
                  <p className="font-bold">{cycle.hawlComplete ? "اكتمل الحول ✓" : `${cycle.daysRemaining} يوماً`}</p>
                </div>
                <div className="bg-background/60 rounded-xl p-3">
                  <p className="text-muted-foreground mb-1">النصاب</p>
                  <p className="font-bold font-mono">{fmt(zakat?.nisab ?? 0)}</p>
                </div>
                <div className="bg-background/60 rounded-xl p-3">
                  <p className="text-muted-foreground mb-1">صافي الأصول</p>
                  <p className="font-bold font-mono">{fmt(zakat?.netAssets ?? 0)}</p>
                </div>
              </div>

              <div className={cn(
                "rounded-xl p-3 text-center border",
                zakat?.estimate.reachesNisab ? "bg-secondary/14 border-secondary/30" : "bg-muted/40 border-border",
              )}>
                {zakat?.nisab === 0 ? (
                  <p className="text-xs text-muted-foreground">حدّد قيمة النصاب من الإعدادات ليحسب النظام الزكاة</p>
                ) : zakat?.estimate.reachesNisab ? (
                  <>
                    <p className="text-xs text-muted-foreground mb-1">الزكاة الواجبة (2.5٪)</p>
                    <p className="text-2xl font-bold font-mono text-primary" data-testid="text-zakat-due">{fmt(zakat.estimate.amount)} <span className="text-xs">ر.ع</span></p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">صافي الأصول دون النصاب — لا زكاة واجبة</p>
                )}
              </div>

              {cycle.hawlComplete && (zakat?.estimate.amount ?? 0) > 0 && (
                <button
                  onClick={() => { setZakatAmount(String(zakat!.estimate.amount)); setZakatOpen(true); }}
                  className="tap-target w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold active:scale-95 transition-transform"
                  data-testid="button-pay-zakat"
                >
                  إخراج الزكاة وتسجيلها مصروفاً
                </button>
              )}
            </>
          )}
        </div>

        {/* طبقة النمو */}
        {growth && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-2">
            <h3 className="font-bold text-sm font-heading">طبقة النمو ({growth.percent}٪)</h3>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div><p className="text-muted-foreground mb-1">المخصص</p><p className="font-bold font-mono">{fmt(growth.amount)}</p></div>
              <div><p className="text-muted-foreground mb-1">المستثمر</p><p className="font-bold font-mono text-fund-loan">{fmt(growth.used)}</p></div>
              <div><p className="text-muted-foreground mb-1">المتاح</p><p className="font-bold font-mono text-fund-in" data-testid="text-growth-available">{fmt(growth.available)}</p></div>
            </div>
          </div>
        )}

        {/* الاستثمارات */}
        <div className="flex items-center justify-between px-1">
          <h3 className="font-bold text-lg text-primary font-heading">سجل الاستثمارات</h3>
          <button
            onClick={() => setAddOpen(true)}
            className="tap-target flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform"
            data-testid="button-add-investment"
          >
            <Plus className="w-4 h-4" /> استثمار جديد
          </button>
        </div>

        {data && investments.length > 0 && (
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-fund-loan-bright/20 border border-fund-loan-bright/40 rounded-lg p-3">
              <p className="text-fund-loan font-bold mb-1">المستثمر</p>
              <p className="font-bold font-mono text-fund-loan">{fmt(data.totals.invested)}</p>
            </div>
            <div className="bg-fund-in-bright/20 border border-fund-in-bright/40 rounded-lg p-3">
              <p className="text-fund-in font-bold mb-1">القيمة الحالية</p>
              <p className="font-bold font-mono text-fund-in">{fmt(data.totals.currentValue)}</p>
            </div>
            <div className="bg-fund-out-bright/20 border border-fund-out-bright/40 rounded-lg p-3">
              <p className="text-fund-out font-bold mb-1">أرباح محققة</p>
              <p className="font-bold font-mono text-fund-out">{fmt(data.totals.realizedGain)}</p>
            </div>
          </div>
        )}

        <div className="grid gap-4">
          {investments.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground font-medium">لا استثمارات مسجلة</p>
              <p className="text-xs text-muted-foreground mt-1">طبقة النمو مخصصة ولم تُستثمر بعد</p>
            </div>
          ) : (
            investments.map((inv, idx) => {
              const Icon = TYPE_ICONS[inv.type] ?? Coins;
              const positive = inv.gain >= 0;
              return (
                <motion.div
                  key={inv.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-card border border-border rounded-xl p-5 space-y-3 shadow-sm"
                  data-testid={`card-investment-${inv.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-primary/14 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold leading-tight">{inv.title}</h4>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_LABELS[inv.type] ?? inv.type} · بدأ {fmtDate(inv.startedAt)}
                      </p>
                    </div>
                    <span className={cn(
                      "text-xs font-bold px-2 py-1 rounded-full border",
                      inv.status === "active" ? "bg-fund-in-bright/20 border-fund-in-bright/40 text-fund-in" : "bg-muted border-border text-muted-foreground",
                    )}>
                      {inv.status === "active" ? "قائم" : "مُصفّى"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-2 border-t border-border/70">
                    <div><p className="text-muted-foreground mb-1">المبلغ</p><p className="font-bold font-mono">{fmt(Number(inv.amount))}</p></div>
                    <div><p className="text-muted-foreground mb-1">القيمة</p><p className="font-bold font-mono">{fmt(inv.currentValue)}</p></div>
                    <div>
                      <p className="text-muted-foreground mb-1">العائد</p>
                      <p className={cn("font-bold font-mono flex items-center justify-center gap-1", positive ? "text-fund-in" : "text-fund-due")}>
                        {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {inv.returnPercent}٪
                      </p>
                    </div>
                  </div>

                  {inv.valuations.length > 0 && (
                    <div className="text-xs text-muted-foreground space-y-1 pt-1">
                      {inv.valuations.slice(-3).map((v) => (
                        <div key={v.id} className="flex justify-between">
                          <span>تقييم {fmtDate(v.valuedAt)}</span>
                          <span className="font-mono font-bold">{fmt(Number(v.value))} ر.ع</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {inv.status === "active" && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setValuationTarget(inv); setValuationValue(String(inv.currentValue)); }}
                        className="tap-target flex-1 py-2 bg-muted rounded-xl text-xs font-bold active:scale-95 transition-transform"
                        data-testid={`button-value-${inv.id}`}
                      >
                        تقييم جديد
                      </button>
                      <button
                        onClick={() => { setExitTarget(inv); setExitValue(String(inv.currentValue)); }}
                        className="tap-target flex-1 py-2 bg-fund-out-bright/20 text-fund-out rounded-xl text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                        data-testid={`button-exit-${inv.id}`}
                      >
                        <LogOut className="w-3 h-3" /> تصفية
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(inv.id)}
                        className="tap-target p-2 bg-muted/50 text-muted-foreground rounded-xl hover:text-destructive transition-colors"
                        data-testid={`button-delete-investment-${inv.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* استثمار جديد */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl" className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>استثمار جديد</DialogTitle>
            <DialogDescription>يُخصم من طبقة النمو — وتجاوز المتاح فيها يُستأذن ويُوثَّق</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الاستثمار"
              className="w-full p-3 border rounded-xl bg-background text-sm" data-testid="input-investment-title" />
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-3 border rounded-xl bg-background text-sm" data-testid="select-investment-type">
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="number" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="المبلغ بالريال"
              className="w-full p-3 border rounded-xl bg-background text-sm font-mono" data-testid="input-investment-amount" />
            <input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)}
              className="w-full p-3 border rounded-xl bg-background text-sm" data-testid="input-investment-date" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)"
              className="w-full p-3 border rounded-xl bg-background text-sm" />
            <button
              onClick={async () => {
                // تجاوز طبقة النمو يُستأذن فيه قبل التنفيذ لا يُبلَّغ به بعده
                if (!(await gate.confirm(() => previewInvestmentLimit(Number(amount))))) return;
                addMutation.mutate();
              }}
              disabled={!title.trim() || !amount.trim() || addMutation.isPending}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-50"
              data-testid="button-save-investment"
            >
              {addMutation.isPending ? "جاري الحفظ..." : "تسجيل الاستثمار"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تقييم */}
      <Dialog open={!!valuationTarget} onOpenChange={(o) => !o && setValuationTarget(null)}>
        <DialogContent dir="rtl" className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>تقييم {valuationTarget?.title}</DialogTitle>
            <DialogDescription>القيمة السوقية الحالية لهذا الاستثمار</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input type="number" step="0.001" value={valuationValue} onChange={(e) => setValuationValue(e.target.value)}
              className="w-full p-3 border rounded-xl bg-background text-sm font-mono" data-testid="input-valuation-value" />
            <input type="date" value={valuationDate} onChange={(e) => setValuationDate(e.target.value)}
              className="w-full p-3 border rounded-xl bg-background text-sm" />
            <button
              onClick={() => valuationMutation.mutate()}
              disabled={!valuationValue.trim() || valuationMutation.isPending}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-50"
              data-testid="button-save-valuation"
            >
              حفظ التقييم
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تصفية */}
      <Dialog open={!!exitTarget} onOpenChange={(o) => !o && setExitTarget(null)}>
        <DialogContent dir="rtl" className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>تصفية {exitTarget?.title}</DialogTitle>
            <DialogDescription>الربح يُسجَّل إيداعاً في الصندوق والخسارة سحباً</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input type="number" step="0.001" value={exitValue} onChange={(e) => setExitValue(e.target.value)}
              placeholder="قيمة الخروج"
              className="w-full p-3 border rounded-xl bg-background text-sm font-mono" data-testid="input-exit-value" />
            <button
              onClick={() => exitMutation.mutate()}
              disabled={!exitValue.trim() || exitMutation.isPending}
              className="w-full py-3 bg-fund-out text-white rounded-xl font-bold text-sm disabled:opacity-50"
              data-testid="button-confirm-exit"
            >
              تأكيد التصفية
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* إخراج الزكاة */}
      <Dialog open={zakatOpen} onOpenChange={setZakatOpen}>
        <DialogContent dir="rtl" className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>إخراج الزكاة</DialogTitle>
            <DialogDescription>يُسجَّل المبلغ مصروفاً بتصنيف «زكاة» ويُوثَّق في سجل التدقيق</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input type="number" step="0.001" value={zakatAmount} onChange={(e) => setZakatAmount(e.target.value)}
              className="w-full p-3 border rounded-xl bg-background text-sm font-mono" data-testid="input-zakat-amount" />
            <p className="text-xs text-muted-foreground">
              المحسوب {fmt(zakat?.estimate.amount ?? 0)} ر.ع — يمكنك تعديله (تقريباً أو زيادةً تطوعاً).
            </p>
            <button
              onClick={() => payZakatMutation.mutate()}
              disabled={!zakatAmount.trim() || payZakatMutation.isPending}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-50"
              data-testid="button-confirm-zakat"
            >
              {payZakatMutation.isPending ? "جاري التسجيل..." : "تأكيد الإخراج"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {gate.dialog}
    </MobileLayout>
  );
}
