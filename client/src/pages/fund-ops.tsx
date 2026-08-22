import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import {
  getMembers,
  getFundAdjustments,
  createFundAdjustment,
  reverseFundAdjustment,
  createLoan,
  createExpense,
  getDashboardSummary,
  previewLoanLimit,
  previewExpenseLimit,
} from "@/lib/api";
import { overdraftToast } from "@/lib/overdraft";
import { useOverdraftGate } from "@/hooks/use-overdraft-gate";
import {
  Wallet,
  HandCoins,
  ReceiptText,
  ArrowDownCircle,
  ArrowUpCircle,
  Plus,
  TrendingUp,
  TrendingDown,
  Coins,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function FundOps() {
  const { toast } = useToast();
  const gate = useOverdraftGate();
  const queryClient = useQueryClient();

  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);

  const [adminLoanMemberId, setAdminLoanMemberId] = useState("");
  const [adminLoanType, setAdminLoanType] = useState<"urgent" | "standard" | "emergency">("standard");
  const [adminLoanAmount, setAdminLoanAmount] = useState("");
  const [adminLoanDescription, setAdminLoanDescription] = useState("");
  const [adminLoanRepaymentType, setAdminLoanRepaymentType] = useState<"scheduled" | "open">("scheduled");
  const [adminLoanMonths, setAdminLoanMonths] = useState("12");

  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<"general" | "emergency" | "charity" | "zakat">("general");
  const [expenseTitle, setExpenseTitle] = useState("مصروف إداري");

  const [depositAmount, setDepositAmount] = useState("");
  const [depositDescription, setDepositDescription] = useState("");
  const [depositSourceType, setDepositSourceType] = useState<"known" | "unknown">("unknown");

  const { data: members = [] } = useQuery({ queryKey: ["members"], queryFn: getMembers });
  const { data: adjustments = [] } = useQuery({ queryKey: ["fund-adjustments"], queryFn: getFundAdjustments });
  const { data: summary } = useQuery({ queryKey: ["dashboard-summary"], queryFn: getDashboardSummary });

  const flexibleLayer = summary?.layers?.find((l: any) => l.id === "flexible");
  const emergencyLayer = summary?.layers?.find((l: any) => l.id === "emergency");
  const availableFlexible = Number(flexibleLayer?.available ?? flexibleLayer?.amount ?? 0);
  const availableEmergency = Number(emergencyLayer?.available ?? emergencyLayer?.amount ?? 0);
  const selectedLoanAvailable = adminLoanType === "emergency" ? availableEmergency : availableFlexible;
  // كان السجل يعرض الإيداعات وحدها، فالسحب المباشر — وهو الذي ينقص الصندوق —
  // لا يظهر لأحد. ويُعلَّم المعكوس وعكسه ليُقرأ التصحيح لا كحركتين منفصلتين.
  const reversedIds = new Set(adjustments.filter((a: any) => a.reversalOfId).map((a: any) => a.reversalOfId));
  const adjustmentRecords = adjustments;

  const loanTypeLabels: Record<string, string> = {
    urgent: "سلفة عاجلة",
    standard: "سلفة غير عاجلة",
    emergency: "سلفة طارئة",
  };

  const reverseAdjustmentMutation = useMutation({
    mutationFn: (id: string) => reverseFundAdjustment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fund-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["allocation"] });
      toast({ title: "عُكس القيد — اعتدل الرصيد وبقي الأثر" });
    },
    onError: (error: any) => {
      toast({ title: "تعذر عكس القيد", description: error?.message || "خطأ غير متوقع", variant: "destructive" });
    },
  });

  const createAdminLoanMutation = useMutation({
    mutationFn: createLoan,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: "تمت إضافة السلفة واعتمادها بنجاح" });
      if (result?.overdraft) toast(overdraftToast(result.overdraft));
      setAdminLoanMemberId(""); setAdminLoanType("standard"); setAdminLoanAmount("");
      setAdminLoanDescription(""); setAdminLoanRepaymentType("scheduled"); setAdminLoanMonths("12");
      setLoanDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "تعذر إضافة السلفة", description: error?.message || "خطأ غير متوقع", variant: "destructive" });
    },
  });

  const createAdminExpenseMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: "تم تسجيل المصروف بنجاح" });
      if (result?.overdraft) toast(overdraftToast(result.overdraft));
      setExpenseAmount(""); setExpenseDescription(""); setExpenseCategory("general");
      setExpenseTitle("مصروف إداري"); setExpenseDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "تعذر تسجيل المصروف", description: error?.message || "خطأ غير متوقع", variant: "destructive" });
    },
  });

  const createAdjustmentMutation = useMutation({
    mutationFn: createFundAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fund-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: "تم تسجيل الإيداع في السجل العام بنجاح" });
      setDepositAmount(""); setDepositDescription(""); setDepositSourceType("unknown");
      setDepositDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "فشلت العملية", description: error?.message || "خطأ غير متوقع", variant: "destructive" });
    },
  });

  return (
    <MobileLayout title="إجراءات الصندوق">
      <div className="space-y-6 pt-2 pb-12">

        {/* Header */}
        <div className="bg-fund-out text-white p-6 rounded-xl relative overflow-hidden shadow-lg shadow-fund-out/20">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <Wallet className="w-8 h-8" />
              <h2 className="text-xl font-bold">إجراءات الصندوق</h2>
            </div>
            <p className="text-sm opacity-80">إضافة سلفة مباشرة، مصروف، أو إيداع مبلغ وارد</p>
          </div>
          <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        </div>

        {/* Balance overview */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border/80 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-primary" />
              <p className="text-xs font-bold text-muted-foreground">المتاح للسلف</p>
            </div>
            <p className="text-lg font-mono font-bold text-primary">{availableFlexible.toFixed(3)} ر.ع</p>
          </div>
          <div className="bg-card border border-border/80 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-fund-out" />
              <p className="text-xs font-bold text-muted-foreground">المتاح للطوارئ</p>
            </div>
            <p className="text-lg font-mono font-bold text-fund-out">{availableEmergency.toFixed(3)} ر.ع</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid gap-3">
          <button
            onClick={() => setLoanDialogOpen(true)}
            className="w-full bg-primary text-primary-foreground py-4 rounded-lg font-bold flex items-center gap-4 px-5 active:scale-95 transition-transform shadow-lg shadow-primary/20"
            data-testid="button-fund-ops-loan"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <HandCoins className="w-5 h-5" />
            </div>
            <div className="text-right">
              <p className="font-bold text-sm">إضافة سلفة مباشرة</p>
              <p className="text-xs opacity-75">تُعتمد فورًا بعد التحقق من الرصيد</p>
            </div>
            <Plus className="w-5 h-5 mr-auto" />
          </button>

          <button
            onClick={() => setExpenseDialogOpen(true)}
            className="w-full bg-fund-due text-white py-4 rounded-lg font-bold flex items-center gap-4 px-5 active:scale-95 transition-transform shadow-lg shadow-fund-due/20"
            data-testid="button-fund-ops-expense"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <ReceiptText className="w-5 h-5" />
            </div>
            <div className="text-right">
              <p className="font-bold text-sm">إضافة مصروف</p>
              <p className="text-xs opacity-75">يُسجل ضمن قائمة المصروفات</p>
            </div>
            <Plus className="w-5 h-5 mr-auto" />
          </button>

          <button
            onClick={() => setDepositDialogOpen(true)}
            className="w-full bg-fund-in text-white py-4 rounded-lg font-bold flex items-center gap-4 px-5 active:scale-95 transition-transform shadow-lg shadow-fund-in/20"
            data-testid="button-fund-ops-deposit"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <ArrowDownCircle className="w-5 h-5" />
            </div>
            <div className="text-right">
              <p className="font-bold text-sm">إضافة مبلغ وارد</p>
              <p className="text-xs opacity-75">إيداع عام — معلوم أو غير معروف المصدر</p>
            </div>
            <Plus className="w-5 h-5 mr-auto" />
          </button>
        </div>

        {/* --- Loan Dialog --- */}
        <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
          <DialogContent className="sm:max-w-md font-sans" dir="rtl">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">إضافة سلفة مباشرة</DialogTitle>
              <DialogDescription>تُسجل في قائمة السلف وتُعتمد فورًا بعد التحقق من الرصيد.</DialogDescription>
            </DialogHeader>
            <form className="py-4 space-y-4" onSubmit={async (e) => {
              e.preventDefault();
              if (adminLoanMemberId && adminLoanAmount && Number(adminLoanAmount) > 0) {
                if (!(await gate.confirm(() => previewLoanLimit(Number(adminLoanAmount))))) return;
                createAdminLoanMutation.mutate({
                  memberId: adminLoanMemberId,
                  type: adminLoanType,
                  title: loanTypeLabels[adminLoanType],
                  amount: adminLoanAmount,
                  description: adminLoanDescription || undefined,
                  repaymentType: adminLoanRepaymentType,
                  repaymentMonths: adminLoanRepaymentType === "scheduled" ? Number(adminLoanMonths) : null,
                  status: "approved",
                });
              }
            }}>
              <div className="space-y-2">
                <label className="text-sm font-medium">العضو *</label>
                <select value={adminLoanMemberId} onChange={(e) => setAdminLoanMemberId(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50" required>
                  <option value="">اختر العضو...</option>
                  {members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">نوع السلفة *</label>
                <select value={adminLoanType} onChange={(e) => setAdminLoanType(e.target.value as any)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="urgent">سلفة عاجلة</option>
                  <option value="standard">سلفة غير عاجلة</option>
                  <option value="emergency">سلفة طارئة</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">المبلغ (ر.ع) *</label>
                <input type="number" step="0.001" min="0.001" value={adminLoanAmount}
                  onChange={(e) => setAdminLoanAmount(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="0.000" required />
                <p className="text-xs text-muted-foreground">الرصيد المتاح: {selectedLoanAvailable.toFixed(3)} ر.ع</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">طريقة السداد</label>
                <select value={adminLoanRepaymentType} onChange={(e) => setAdminLoanRepaymentType(e.target.value as any)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="scheduled">بخطة سداد</option>
                  <option value="open">مفتوحة بدون خطة</option>
                </select>
              </div>
              {adminLoanRepaymentType === "scheduled" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">مدة السداد بالأشهر</label>
                  <select value={adminLoanMonths} onChange={(e) => setAdminLoanMonths(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="6">6 أشهر</option>
                    <option value="12">12 شهر</option>
                    <option value="18">18 شهر</option>
                    <option value="24">24 شهر</option>
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">ملاحظة (اختياري)</label>
                <input type="text" value={adminLoanDescription} onChange={(e) => setAdminLoanDescription(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="سبب السلفة..." />
              </div>
              <button type="submit" disabled={createAdminLoanMutation.isPending || !adminLoanAmount || !adminLoanMemberId}
                className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 text-white bg-primary">
                {createAdminLoanMutation.isPending
                  ? <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                  : <><HandCoins className="w-5 h-5" /> اعتماد السلفة وإضافتها</>}
              </button>
            </form>
          </DialogContent>
        </Dialog>

        {/* --- Expense Dialog --- */}
        <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
          <DialogContent className="sm:max-w-md font-sans" dir="rtl">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">إضافة مصروف</DialogTitle>
              <DialogDescription>يُسجل مباشرة في قائمة المصروفات مع التحقق من الرصيد.</DialogDescription>
            </DialogHeader>
            <form className="py-4 space-y-4" onSubmit={async (e) => {
              e.preventDefault();
              if (expenseAmount && Number(expenseAmount) > 0) {
                if (!(await gate.confirm(() => previewExpenseLimit(Number(expenseAmount), expenseCategory)))) return;
                createAdminExpenseMutation.mutate({ title: expenseTitle, amount: expenseAmount, category: expenseCategory, description: expenseDescription || undefined });
              }
            }}>
              <div className="space-y-2">
                <label className="text-sm font-medium">نوع المصروف *</label>
                <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value as any)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="general">مصروفات عامة</option>
                  <option value="emergency">طوارئ</option>
                  <option value="charity">أعمال خيرية</option>
                  <option value="zakat">زكاة</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">عنوان العملية *</label>
                <input type="text" value={expenseTitle} onChange={(e) => setExpenseTitle(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="مثال: مصروف تشغيل" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">المبلغ (ر.ع) *</label>
                <input type="number" step="0.001" min="0.001" value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="0.000" required />
                <p className="text-xs text-muted-foreground">
                  الرصيد المتاح: {(expenseCategory === "emergency" ? availableEmergency : availableFlexible).toFixed(3)} ر.ع
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">ملاحظة (اختياري)</label>
                <input type="text" value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="سبب المصروف..." />
              </div>
              <button type="submit" disabled={createAdminExpenseMutation.isPending || !expenseTitle || !expenseAmount}
                className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 text-white bg-fund-due">
                {createAdminExpenseMutation.isPending
                  ? <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                  : <><ReceiptText className="w-5 h-5" /> تسجيل المصروف</>}
              </button>
            </form>
          </DialogContent>
        </Dialog>

        {/* --- Deposit Dialog --- */}
        <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
          <DialogContent className="sm:max-w-md font-sans" dir="rtl">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">إضافة مبلغ وارد</DialogTitle>
              <DialogDescription>يُسجل في السجل العام كإيداع دون المساس بأي بيانات سابقة.</DialogDescription>
            </DialogHeader>
            <form className="py-4 space-y-4" onSubmit={(e) => {
              e.preventDefault();
              if (depositAmount && Number(depositAmount) > 0) {
                const note = depositDescription.trim();
                const prefix = depositSourceType === "unknown" ? "إيداع من مصدر غير معروف" : "إيداع عام";
                createAdjustmentMutation.mutate({ type: "deposit", amount: depositAmount, description: note ? `${prefix} - ${note}` : prefix });
              }
            }}>
              <div className="space-y-2">
                <label className="text-sm font-medium">نوع المصدر *</label>
                <select value={depositSourceType} onChange={(e) => setDepositSourceType(e.target.value as any)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="unknown">غير معروف</option>
                  <option value="known">معلوم</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">المبلغ (ر.ع) *</label>
                <input type="number" step="0.001" min="0.001" value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="0.000" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">ملاحظة (اختياري)</label>
                <input type="text" value={depositDescription} onChange={(e) => setDepositDescription(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="مثال: تسوية يدوية أو مبلغ نقدي" />
              </div>
              <button type="submit" disabled={createAdjustmentMutation.isPending || !depositAmount}
                className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 text-white bg-fund-in">
                {createAdjustmentMutation.isPending
                  ? <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                  : <><ArrowDownCircle className="w-5 h-5" /> تسجيل الإيداع</>}
              </button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Deposits log */}
        {adjustmentRecords.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg text-fund-in font-heading px-1 flex items-center gap-2">
              <Coins className="w-5 h-5" /> السجل العام للقيود المباشرة
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-bold text-muted-foreground mr-auto">{adjustmentRecords.length}</span>
            </h3>
            {adjustmentRecords.map((adj: any, idx: number) => {
              const isDeposit = adj.type === "deposit";
              const isReversal = !!adj.reversalOfId;
              const wasReversed = reversedIds.has(adj.id);
              return (
                <motion.div key={adj.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                  className={cn("bg-card border border-border/80 rounded-lg p-4 flex items-center gap-3", wasReversed && "opacity-60")}>
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                    isDeposit ? "bg-fund-in-bright/20 text-fund-in" : "bg-fund-out-bright/20 text-fund-out")}>
                    {isDeposit ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full",
                        isDeposit ? "bg-fund-in-bright/20 text-fund-in" : "bg-fund-out-bright/20 text-fund-out")}>
                        {isDeposit ? "إيداع" : "سحب"}
                      </span>
                      <span className={cn("font-bold text-sm font-mono", wasReversed && "line-through")}>
                        {Number(adj.amount).toFixed(3)} ر.ع
                      </span>
                      {isReversal && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">قيد تصحيح</span>}
                      {wasReversed && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">مُصحَّح</span>}
                    </div>
                    {adj.description && <p className="text-xs text-muted-foreground mt-1 truncate">{adj.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {adj.createdAt ? new Date(adj.createdAt).toLocaleDateString("ar-OM", { year: "numeric", month: "short", day: "numeric" }) : ""}
                    </p>
                  </div>
                  {!isReversal && !wasReversed && (
                    <button
                      onClick={() => reverseAdjustmentMutation.mutate(adj.id)}
                      disabled={reverseAdjustmentMutation.isPending}
                      className="tap-target shrink-0 text-xs font-bold text-muted-foreground hover:text-destructive px-3 py-2 rounded-lg bg-muted/40 disabled:opacity-50"
                      data-testid={`button-reverse-adjustment-${adj.id}`}
                    >
                      عكس القيد
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
      {gate.dialog}
    </MobileLayout>
  );
}
