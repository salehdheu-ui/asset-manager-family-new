import MobileLayout from "@/components/layout/MobileLayout";
import { createMember, getMembers, getSettings, updateSettings } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronLeft, ChevronRight, CircleHelp, Users, Wallet, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

const STEPS = [
  { title: "هوية الصندوق", description: "عرّف العائلة والعملة التي ستظهر في التقارير.", icon: ShieldCheck },
  { title: "القواعد المالية", description: "ضع الاشتراك الافتراضي وتوزيع طبقات رأس المال.", icon: Wallet },
  { title: "الأعضاء", description: "أضف أفراد العائلة دفعة واحدة، ويمكن تعديلهم لاحقًا.", icon: Users },
  { title: "المراجعة", description: "تحقق من الملخص ثم ابدأ باستخدام الصندوق.", icon: Sparkles },
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [familyName, setFamilyName] = useState("صندوق العائلة");
  const [currency, setCurrency] = useState("ر.ع");
  const [defaultMonthly, setDefaultMonthly] = useState("0");
  const [percentages, setPercentages] = useState({ protected: "45", emergency: "15", flexible: "20", growth: "20" });
  const [memberNames, setMemberNames] = useState("");
  const [saved, setSaved] = useState(false);

  const { data: settings, isLoading: settingsLoading } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: members = [], isLoading: membersLoading } = useQuery({ queryKey: ["members"], queryFn: getMembers });

  useEffect(() => {
    if (!settings) return;
    setFamilyName(settings.familyName || "صندوق العائلة");
    setCurrency(settings.currency || "ر.ع");
    setDefaultMonthly(String(settings.defaultMonthlyContribution || "0"));
    setPercentages({
      protected: String(settings.protectedPercent ?? 45),
      emergency: String(settings.emergencyPercent ?? 15),
      flexible: String(settings.flexiblePercent ?? 20),
      growth: String(settings.growthPercent ?? 20),
    });
  }, [settings]);

  const parsedNames = useMemo(() => Array.from(new Set(memberNames.split(/[,،\n]+/).map((name) => name.trim()).filter(Boolean))), [memberNames]);
  const percentageTotal = Object.values(percentages).reduce((sum, value) => sum + Number(value || 0), 0);
  const canSubmit = familyName.trim().length >= 2 && Number(defaultMonthly) >= 0 && percentageTotal === 100;

  const saveMutation = useMutation({
    mutationFn: async () => {
      await updateSettings({
        familyName: familyName.trim(),
        currency: currency.trim() || "ر.ع",
        defaultMonthlyContribution: defaultMonthly || "0",
        protectedPercent: Number(percentages.protected),
        emergencyPercent: Number(percentages.emergency),
        flexiblePercent: Number(percentages.flexible),
        growthPercent: Number(percentages.growth),
      });
      const existingNames = new Set(members.map((member) => member.name.trim()));
      for (const name of parsedNames) {
        if (!existingNames.has(name)) await createMember({ name, role: "member", expectedMonthly: null });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["members"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
      ]);
      localStorage.setItem("family_onboarding_completed", "1");
      setSaved(true);
      toast({ title: "اكتمل إعداد الصندوق", description: "يمكنك الآن الانتقال إلى لوحة الصندوق." });
    },
    onError: (error: Error) => toast({ title: "تعذر حفظ الإعداد", description: error.message, variant: "destructive" }),
  });

  const next = () => {
    if (step === 0 && familyName.trim().length < 2) {
      toast({ title: "أدخل اسم العائلة", description: "يجب أن يكون الاسم حرفين على الأقل.", variant: "destructive" });
      return;
    }
    if (step === 1 && percentageTotal !== 100) {
      toast({ title: "توزيع غير مكتمل", description: `مجموع الطبقات الحالي ${percentageTotal}%، ويجب أن يساوي 100%.`, variant: "destructive" });
      return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  if (saved) {
    return (
      <MobileLayout title="اكتمل الإعداد">
        <div className="mx-auto max-w-xl space-y-5 py-10 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700"><Check className="h-10 w-10" /></div>
          <h2 className="font-heading text-3xl font-black text-primary">الصندوق جاهز للبدء</h2>
          <p className="text-sm leading-7 text-muted-foreground">تم حفظ الإعدادات وإضافة الأعضاء الجدد. انتقل إلى اللوحة لمتابعة المساهمات والسلف والتقارير.</p>
          <button onClick={() => setLocation("/dashboard")} className="w-full rounded-2xl bg-primary px-5 py-4 font-black text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90">الانتقال إلى لوحة الصندوق</button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="إعداد الصندوق">
      <div className="mx-auto max-w-2xl space-y-6 pb-8 pt-2">
        <div className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-card to-amber-50/70 p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-3"><CircleHelp className="mt-1 h-5 w-5 shrink-0 text-primary" /><div><p className="text-xs font-black uppercase tracking-[0.18em] text-primary/65">بداية سريعة · 4 خطوات</p><h1 className="mt-2 font-heading text-2xl font-black text-primary sm:text-3xl">لنجهّز صندوق العائلة معًا</h1><p className="mt-2 text-sm leading-7 text-muted-foreground">أدخل الأساسيات الآن، وستبقى كل القيم قابلة للتعديل من الإعدادات لاحقًا.</p></div></div>
          <div className="mt-7 grid grid-cols-4 gap-2">
            {STEPS.map((item, index) => { const Icon = item.icon; const active = index === step; const complete = index < step; return <div key={item.title} className="space-y-2 text-center"><div className={`mx-auto flex h-10 w-10 items-center justify-center rounded-2xl border text-sm font-black transition ${complete ? "border-emerald-300 bg-emerald-100 text-emerald-700" : active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}>{complete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</div><p className={`text-[10px] font-black sm:text-xs ${active ? "text-primary" : "text-muted-foreground"}`}>{item.title}</p></div>; })}
          </div>
        </div>

        <div className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm sm:p-7">
          {settingsLoading || membersLoading ? <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div> : <>
            {step === 0 && <div className="space-y-5"><div><h2 className="text-xl font-black text-primary">ما اسم الصندوق؟</h2><p className="mt-1 text-sm text-muted-foreground">سيظهر الاسم في رأس التطبيق والتقارير والإشعارات.</p></div><label className="block space-y-2"><span className="text-sm font-bold">اسم العائلة أو الصندوق</span><input value={familyName} onChange={(event) => setFamilyName(event.target.value)} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none ring-primary/30 transition focus:ring-4" placeholder="مثال: صندوق عائلة آل ..." /></label><label className="block space-y-2"><span className="text-sm font-bold">العملة</span><input value={currency} onChange={(event) => setCurrency(event.target.value)} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none ring-primary/30 transition focus:ring-4" placeholder="ر.ع" /></label></div>}
            {step === 1 && <div className="space-y-5"><div><h2 className="text-xl font-black text-primary">ضع القواعد المالية الأولى</h2><p className="mt-1 text-sm text-muted-foreground">يجب أن يساوي مجموع الطبقات 100%. يمكنك تعديلها لاحقًا.</p></div><label className="block space-y-2"><span className="text-sm font-bold">الاشتراك الشهري الافتراضي</span><div className="flex items-center gap-2"><input type="number" min="0" step="0.001" value={defaultMonthly} onChange={(event) => setDefaultMonthly(event.target.value)} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none ring-primary/30 transition focus:ring-4" /><span className="rounded-xl bg-muted px-3 py-2 text-sm font-black text-muted-foreground">{currency || "ر.ع"}</span></div></label><div className="grid grid-cols-2 gap-3">{(["protected", "emergency", "flexible", "growth"] as const).map((key) => { const labels = { protected: "محمي", emergency: "طوارئ", flexible: "مرن", growth: "نمو" }; return <label key={key} className="space-y-2"><span className="text-xs font-bold text-muted-foreground">{labels[key]} %</span><input type="number" min="0" max="100" value={percentages[key]} onChange={(event) => setPercentages((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-black outline-none ring-primary/30 transition focus:ring-4" /></label>; })}</div><div className={`rounded-2xl border px-4 py-3 text-sm font-black ${percentageTotal === 100 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>مجموع التوزيع: {percentageTotal}% {percentageTotal === 100 ? "✓" : "— يجب أن يساوي 100%"}</div></div>}
            {step === 2 && <div className="space-y-5"><div><h2 className="text-xl font-black text-primary">أضف أفراد العائلة</h2><p className="mt-1 text-sm text-muted-foreground">اكتب كل اسم في سطر مستقل أو افصل بين الأسماء بفاصلة. هذه الخطوة اختيارية.</p></div><textarea value={memberNames} onChange={(event) => setMemberNames(event.target.value)} rows={7} className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-7 outline-none ring-primary/30 transition focus:ring-4" placeholder={"أحمد\nخالد\nمريم"} /><div className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground"><p className="font-black text-primary">سيتم إضافة {parsedNames.length} عضو جديد</p><p className="mt-1">الأعضاء الحاليون: {members.length}. الأسماء المكررة سيتم تجاهلها.</p></div></div>}
            {step === 3 && <div className="space-y-5"><div><h2 className="text-xl font-black text-primary">راجع إعدادك</h2><p className="mt-1 text-sm text-muted-foreground">إذا كان كل شيء صحيحًا، اضغط حفظ وابدأ استخدام الصندوق.</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-muted/40 p-4"><p className="text-xs font-bold text-muted-foreground">اسم الصندوق</p><p className="mt-1 font-black text-primary">{familyName || "—"}</p></div><div className="rounded-2xl bg-muted/40 p-4"><p className="text-xs font-bold text-muted-foreground">الاشتراك الافتراضي</p><p className="mt-1 font-black text-primary">{defaultMonthly || "0"} {currency || "ر.ع"}</p></div><div className="rounded-2xl bg-muted/40 p-4"><p className="text-xs font-bold text-muted-foreground">توزيع رأس المال</p><p className="mt-1 font-black text-primary">{percentages.protected}% / {percentages.emergency}% / {percentages.flexible}% / {percentages.growth}%</p></div><div className="rounded-2xl bg-muted/40 p-4"><p className="text-xs font-bold text-muted-foreground">الأعضاء الجدد</p><p className="mt-1 font-black text-primary">{parsedNames.length} عضو</p></div></div><div className="rounded-2xl border border-primary/15 bg-primary/[0.05] p-4 text-sm leading-7 text-muted-foreground">بعد الحفظ يمكنك تعديل أي قيمة من الإعدادات، ثم تسجيل أول مساهمة أو سلفة من لوحة الحركات.</div></div>}
          </>}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button onClick={() => step === 0 ? setLocation("/dashboard") : setStep((current) => current - 1)} className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-black text-muted-foreground transition hover:border-primary/30 hover:text-primary"><ChevronRight className="h-4 w-4" />{step === 0 ? "لاحقًا" : "السابق"}</button>
          {step < STEPS.length - 1 ? <button onClick={next} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90">التالي<ChevronLeft className="h-4 w-4" /></button> : <button onClick={() => saveMutation.mutate()} disabled={!canSubmit || saveMutation.isPending} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">{saveMutation.isPending ? "جاري الحفظ..." : "حفظ وبدء الاستخدام"}<Check className="h-4 w-4" /></button>}
        </div>
      </div>
    </MobileLayout>
  );
}
