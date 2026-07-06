import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getLoans, getMembers, createLoan, updateLoan, updateLoanStatus, deleteLoan, getLoanRepayments, markRepaymentPaid, getDashboardSummary, getLoanPayments, createLoanPayment, getCommitmentScores, getLoanVotes, castLoanVote } from "@/lib/api";
import { LOAN_VOTE_THRESHOLD } from "@shared/finance";
import { useAuth } from "@/hooks/use-auth";
import { HandCoins, Clock, AlertCircle, CheckCircle2, History, UserCheck, Trash2, X, Calendar, ChevronDown, ChevronUp, RotateCcw, Pencil, BarChart3, Vote, ThumbsUp, ThumbsDown, Gauge } from "lucide-react";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "تعذر الاتصال بالخادم. حاول تحديث الصفحة ثم أعد المحاولة.";
    }
    try {
      const match = error.message.match(/^\d+:\s*([\s\S]+)$/);
      if (match) {
        const parsed = JSON.parse(match[1]);
        if (typeof parsed.error === "string") return parsed.error;
        if (Array.isArray(parsed.error) && parsed.error[0]?.message) return parsed.error[0].message;
        if (typeof parsed.message === "string") return parsed.message;
      }
    } catch {}
    return error.message;
  }
  return "حدث خطأ غير متوقع";
}

// صندوق تصويت العائلة على السلف الكبيرة
function LoanVoteBox({ loanId }: { loanId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tally } = useQuery({
    queryKey: ["loan-votes", loanId],
    queryFn: () => getLoanVotes(loanId),
  });

  const voteMutation = useMutation({
    mutationFn: (vote: "approve" | "reject") => castLoanVote(loanId, vote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loan-votes", loanId] });
      toast({ title: "سُجّل صوتك" });
    },
    onError: (error) => {
      toast({ title: "تعذر التصويت", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  if (!tally) return null;

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3 space-y-2" data-testid={`vote-box-${loanId}`}>
      <div className="flex items-center gap-2 text-violet-700">
        <Vote className="w-4 h-4" />
        <span className="text-[11px] font-bold">سلفة كبيرة — تتطلب تصويت العائلة</span>
        {tally.passed && (
          <span className="mr-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">اكتمل النصاب ✓</span>
        )}
      </div>
      <div className="flex items-center justify-between text-[10px] font-bold">
        <span className="text-emerald-700">موافقون: {tally.approve} / {tally.required} المطلوبين</span>
        <span className="text-red-600">رافضون: {tally.reject}</span>
      </div>
      <div className="h-1.5 rounded-full bg-violet-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${Math.min(100, (tally.approve / Math.max(1, tally.required)) * 100)}%` }}
        />
      </div>
      {tally.canVote && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => voteMutation.mutate("approve")}
            disabled={voteMutation.isPending}
            className={cn(
              "flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50",
              tally.myVote === "approve" ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
            )}
            data-testid={`button-vote-approve-${loanId}`}
          >
            <ThumbsUp className="w-3.5 h-3.5" /> {tally.myVote === "approve" ? "صوتّ بالموافقة" : "أوافق"}
          </button>
          <button
            onClick={() => voteMutation.mutate("reject")}
            disabled={voteMutation.isPending}
            className={cn(
              "flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50",
              tally.myVote === "reject" ? "bg-red-600 text-white" : "bg-red-100 text-red-700 hover:bg-red-200",
            )}
            data-testid={`button-vote-reject-${loanId}`}
          >
            <ThumbsDown className="w-3.5 h-3.5" /> {tally.myVote === "reject" ? "صوتّ بالرفض" : "أرفض"}
          </button>
        </div>
      )}
      {tally.voters && tally.voters.length > 0 && (
        <p className="text-[9px] text-muted-foreground pt-1">
          {tally.voters.map((v) => `${v.name} (${v.vote === "approve" ? "موافق" : "رافض"})`).join("، ")}
        </p>
      )}
    </div>
  );
}

export default function Loans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isGuardian = user?.role === 'admin';
  const userMemberId = (user as any)?.memberId;
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [repayments, setRepayments] = useState<Record<string, any[]>>({});
  const [payments, setPayments] = useState<Record<string, any[]>>({});
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [loanAmounts, setLoanAmounts] = useState<Record<string, string>>({});
  const [loanMonths, setLoanMonths] = useState<Record<string, string>>({});
  const [loanMembers, setLoanMembers] = useState<Record<string, string>>({});
  const [loanDescriptions, setLoanDescriptions] = useState<Record<string, string>>({});
  const [loanRepaymentTypes, setLoanRepaymentTypes] = useState<Record<string, string>>({});
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [paymentNotes, setPaymentNotes] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<{ title: string; description: string; type: string; amount: string; repaymentMonths: string }>({ title: "", description: "", type: "standard", amount: "", repaymentMonths: "12" });
  
  const { data: allLoans = [], isLoading: loansLoading } = useQuery({
    queryKey: ["loans"],
    queryFn: getLoans,
  });

  const loans = isGuardian ? allLoans : allLoans.filter(l => l.memberId === userMemberId);

  const { data: allMembers = [] } = useQuery({
    queryKey: ["members"],
    queryFn: getMembers,
  });

  const members = isGuardian ? allMembers : allMembers.filter(m => m.id === userMemberId);

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
  });

  const { data: commitmentScores = [] } = useQuery({
    queryKey: ["commitment-scores"],
    queryFn: getCommitmentScores,
    enabled: isGuardian,
  });
  const scoreOf = (memberId: string) => commitmentScores.find((s) => s.memberId === memberId);

  const createMutation = useMutation({
    mutationFn: createLoan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setLoanAmounts({});
      setLoanMonths({});
      setLoanMembers({});
      setLoanDescriptions({});
      setLoanRepaymentTypes({});
      setOpenDialog(null);
      toast({ 
        title: "تم تقديم طلب السلفة",
        description: "بانتظار مراجعة واعتماد الوصي."
      });
    },
    onError: (error) => {
      toast({
        title: "تعذّر تقديم الطلب",
        description: extractErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateLoanStatus(id, status),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: status === "approved" ? "تم اعتماد السلفة بنجاح" : "تم رفض الطلب" });
    },
    onError: (error) => {
      toast({
        title: "حدث خطأ",
        description: extractErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLoan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setDeleteTarget(null);
      toast({ title: "تم حذف سجل السلفة", description: "وُثّق الحذف في سجل التدقيق." });
    },
    onError: (error) => {
      toast({
        title: "حدث خطأ",
        description: extractErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateLoan>[1] }) => updateLoan(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setEditTarget(null);
      toast({ title: "تم تعديل السلفة", description: "وُثّق التعديل في سجل التدقيق." });
    },
    onError: (error) => {
      toast({ title: "تعذّر التعديل", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  const repayMutation = useMutation({
    mutationFn: markRepaymentPaid,
    onSuccess: async (updatedRepayment) => {
      const loanId = updatedRepayment.loanId;
      const freshData = await getLoanRepayments(loanId);
      const freshPayments = await getLoanPayments(loanId);
      setRepayments(prev => ({ ...prev, [loanId]: freshData }));
      setPayments(prev => ({ ...prev, [loanId]: freshPayments }));
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: "تم تسجيل سداد القسط وإرجاع المبلغ للصندوق" });
    },
    onError: (error) => {
      toast({
        title: "حدث خطأ",
        description: extractErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const paymentMutation = useMutation({
    mutationFn: ({ loanId, amount, note }: { loanId: string; amount: string; note?: string }) => createLoanPayment(loanId, { amount, note }),
    onSuccess: async (payment) => {
      const loanId = payment.loanId;
      const freshPayments = await getLoanPayments(loanId);
      setPayments(prev => ({ ...prev, [loanId]: freshPayments }));
      setPaymentAmounts(prev => ({ ...prev, [loanId]: "" }));
      setPaymentNotes(prev => ({ ...prev, [loanId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: "تم تسجيل السداد بنجاح" });
    },
    onError: (error) => {
      toast({
        title: "تعذّر تسجيل السداد",
        description: extractErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const loadRepayments = async (loanId: string) => {
    if (!repayments[loanId]) {
      const data = await getLoanRepayments(loanId);
      setRepayments(prev => ({ ...prev, [loanId]: data }));
    }
    if (!payments[loanId]) {
      const data = await getLoanPayments(loanId);
      setPayments(prev => ({ ...prev, [loanId]: data }));
    }
    setExpandedLoan(expandedLoan === loanId ? null : loanId);
  };

  const getMemberName = (memberId: string) => {
    return members.find(m => m.id === memberId)?.name || "غير معروف";
  };

  const flexibleLayer = summary?.layers?.find(l => l.id === "flexible");
  const availableCapital = (flexibleLayer as any)?.available ?? flexibleLayer?.amount ?? 0;

  // السلف المسددة بالكامل تُفصل عن المنطقة النشطة — تفاصيلها تبقى في التقارير
  const settledLoans = loans.filter(l => l.settled);
  const activeLoans = loans.filter(l => !l.settled);

  const approvedLoans = loans.filter(l => l.status === "approved");
  const approvedActiveLoans = activeLoans.filter(l => l.status === "approved");
  const totalLoanAmount = approvedLoans.reduce((sum, loan) => sum + Number(loan.amount), 0);
  const totalPaidAmount = approvedLoans.reduce((sum, loan) => sum + (loan.totalPaid ?? 0), 0);
  const totalRemainingAmount = approvedLoans.reduce((sum, loan) => sum + (loan.remaining ?? 0), 0);
  const openLoansCount = approvedActiveLoans.filter(loan => loan.repaymentType === "open").length;
  const scheduledLoansCount = approvedActiveLoans.filter(loan => loan.repaymentType !== "open").length;

  useEffect(() => {
    let cancelled = false;
    const approved = loans.filter(loan => loan.status === "approved");
    if (approved.length === 0) {
      setPayments({});
      return;
    }
    (async () => {
      const entries = await Promise.all(approved.map(async (loan) => [loan.id, await getLoanPayments(loan.id)] as const));
      if (!cancelled) setPayments(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [loans]);

  const loanTypes = [
    {
      id: 'urgent',
      title: 'سلفة عاجلة',
      description: 'للمتطلبات السريعة والبسيطة.',
      maxAmount: '10% من الصندوق',
      color: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      icon: Clock,
      features: ['موافقة فورية', 'مراجعة بعد 30 يوم', 'من رأس المال المرن']
    },
    {
      id: 'standard',
      title: 'سلفة غير عاجلة',
      description: 'للمشاريع الشخصية أو التحسينات.',
      maxAmount: '10% من الصندوق',
      color: 'bg-blue-50 border-blue-200 text-blue-800',
      icon: HandCoins,
      features: ['فترة تفكير 48 ساعة', 'تصويت العائلة', 'خطة سداد ميسرة']
    },
    {
      id: 'emergency',
      title: 'قرض طارئ',
      description: 'للأزمات الصحية أو الكوارث فقط.',
      maxAmount: '20% من الصندوق',
      color: 'bg-amber-50 border-amber-200 text-amber-800',
      icon: AlertCircle,
      features: ['موافقة الوصي فقط', 'من احتياطي الطوارئ', 'تسجيل فوري']
    }
  ];

  if (loansLoading) {
    return (
      <MobileLayout title="نظام السلف">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="نظام السلف">
      <div className="space-y-6 pt-2 pb-12">
        <div className="bg-primary text-primary-foreground p-6 rounded-[2rem] relative overflow-hidden shadow-lg shadow-primary/20">
          <div className="relative z-10">
            <h2 className="text-sm font-medium opacity-80 mb-1">المتاح للإقراض الآن</h2>
            <div className="text-4xl font-mono font-bold tracking-tighter" data-testid="text-available-capital">
              {availableCapital.toLocaleString()} <span className="text-lg font-sans font-normal opacity-80 text-white/90">ر.ع</span>
            </div>
            <p className="text-[10px] opacity-70 mt-3 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" />
              يتم الصرف من رأس المال المرن واحتياطي الطوارئ
            </p>
          </div>
          <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border/60 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-muted-foreground">إجمالي السلف</p>
            <p className="text-lg font-mono font-bold text-primary">{totalLoanAmount.toFixed(3)} ر.ع</p>
          </div>
          <div className="bg-card border border-border/60 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-muted-foreground">إجمالي المسدد</p>
            <p className="text-lg font-mono font-bold text-emerald-600">{totalPaidAmount.toFixed(3)} ر.ع</p>
          </div>
          <div className="bg-card border border-border/60 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-muted-foreground">إجمالي المتبقي</p>
            <p className="text-lg font-mono font-bold text-amber-600">{totalRemainingAmount.toFixed(3)} ر.ع</p>
          </div>
          <div className="bg-card border border-border/60 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-muted-foreground">نوع السلف</p>
            <p className="text-xs font-bold text-primary">{scheduledLoansCount} بخطة • {openLoansCount} مفتوحة</p>
          </div>
        </div>

        {members.length === 0 ? (
          <div className="text-center py-12 bg-muted/20 rounded-3xl border border-dashed border-border">
            <p className="text-sm text-muted-foreground font-medium">لا يوجد أعضاء</p>
            <p className="text-xs text-muted-foreground mt-1">يرجى إضافة أعضاء أولاً لتقديم طلبات السلف</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <h3 className="font-bold text-lg text-primary px-1 font-heading">تقديم طلب جديد</h3>
              <div className="grid gap-3">
                {loanTypes.map((loan) => (
                  <Dialog key={loan.id} open={openDialog === loan.id} onOpenChange={(open) => setOpenDialog(open ? loan.id : null)}>
                    <DialogTrigger asChild>
                      <motion.div 
                        whileTap={{ scale: 0.98 }}
                        data-testid={`button-loan-${loan.id}`}
                        className={cn(
                          "p-5 rounded-2xl border flex items-start gap-4 cursor-pointer transition-all hover:shadow-md", 
                          loan.color
                        )}
                      >
                        <div className="bg-white/60 p-3 rounded-xl shrink-0">
                          <loan.icon className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <h4 className="font-bold text-base leading-none mb-1">{loan.title}</h4>
                            <span className="text-[9px] bg-white/80 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                              حتى {loan.maxAmount}
                            </span>
                          </div>
                          <p className="text-xs opacity-80 mt-1 mb-3 leading-relaxed">{loan.description}</p>
                          <ul className="flex flex-wrap gap-2">
                            {loan.features.map((feature, i) => (
                              <li key={i} className="text-[9px] flex items-center gap-1 font-bold opacity-70">
                                <CheckCircle2 className="w-2.5 h-2.5" /> {feature}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </motion.div>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md font-sans" dir="rtl">
                      <DialogHeader>
                        <DialogTitle className="font-heading text-xl font-bold">{loan.title}</DialogTitle>
                        <DialogDescription className="font-medium">
                           يرجى تحديد المبلغ المطلوب. سيتم تسجيل هذا الطلب في السجل الدائم.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-6 space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-bold block text-muted-foreground mr-1">اختر العضو</label>
                          <select 
                            id={`loan-member-${loan.id}`}
                            data-testid={`select-member-${loan.id}`}
                            className="w-full p-4 border-2 border-primary/10 rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                            value={loanMembers[loan.id] ?? (isGuardian ? members[0]?.id ?? "" : userMemberId ?? "")}
                            onChange={(e) => setLoanMembers((prev) => ({ ...prev, [loan.id]: e.target.value }))}
                          >
                            {members.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-bold block text-muted-foreground mr-1">المبلغ المطلوب</label>
                          <div className="relative">
                            <input 
                              type="number" 
                              id={`loan-amount-${loan.id}`}
                              data-testid={`input-amount-${loan.id}`}
                              className="w-full text-4xl font-mono p-6 border-2 border-primary/10 rounded-3xl text-center focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all" 
                              placeholder="000"
                              value={loanAmounts[loan.id] ?? ""}
                              onChange={(e) => setLoanAmounts((prev) => ({ ...prev, [loan.id]: e.target.value }))}
                            />
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-primary font-bold text-lg">ر.ع</div>
                          </div>
                          <p className="text-[10px] text-muted-foreground mr-1">
                            الحد المتاح: <span className="font-mono font-bold text-primary">{availableCapital.toLocaleString()}</span> ر.ع
                          </p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-bold block text-muted-foreground mr-1">ملاحظة / سبب السلفة</label>
                          <textarea
                            id={`loan-description-${loan.id}`}
                            data-testid={`textarea-description-${loan.id}`}
                            className="w-full min-h-24 p-4 border-2 border-primary/10 rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all resize-none"
                            placeholder="اكتب تفاصيل أو سبب طلب السلفة"
                            value={loanDescriptions[loan.id] ?? ""}
                            onChange={(e) => setLoanDescriptions((prev) => ({ ...prev, [loan.id]: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-bold block text-muted-foreground mr-1">طريقة السداد</label>
                          <select
                            id={`loan-repayment-type-${loan.id}`}
                            data-testid={`select-repayment-type-${loan.id}`}
                            className="w-full p-4 border-2 border-primary/10 rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                            value={loanRepaymentTypes[loan.id] ?? "scheduled"}
                            onChange={(e) => setLoanRepaymentTypes((prev) => ({ ...prev, [loan.id]: e.target.value }))}
                          >
                            <option value="scheduled">بخطة سداد</option>
                            <option value="open">مفتوحة بدون خطة تلقائية</option>
                          </select>
                        </div>
                        {(loanRepaymentTypes[loan.id] ?? "scheduled") === "scheduled" && (
                        <div className="space-y-2">
                          <label className="text-sm font-bold block text-muted-foreground mr-1">مدة السداد (بالأشهر)</label>
                          <select 
                            id={`loan-months-${loan.id}`}
                            data-testid={`select-months-${loan.id}`}
                            className="w-full p-4 border-2 border-primary/10 rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                            value={loanMonths[loan.id] ?? "12"}
                            onChange={(e) => setLoanMonths((prev) => ({ ...prev, [loan.id]: e.target.value }))}
                          >
                            <option value="6">6 أشهر</option>
                            <option value="12">12 شهر</option>
                            <option value="18">18 شهر</option>
                            <option value="24">24 شهر</option>
                          </select>
                        </div>
                        )}
                        <div className="bg-muted/30 p-4 rounded-2xl text-xs text-muted-foreground space-y-2 border border-border/50 font-medium">
                          <p>• المال وسيلة لخدمة العائلة، وليس غاية.</p>
                          <p>• بتقديمك لهذا الطلب، أنت تتعهد بالمسؤولية تجاه مستقبل العائلة.</p>
                        </div>
                      </div>
                      <button 
                        data-testid={`button-submit-loan-${loan.id}`}
                        onClick={() => {
                          const memberId = isGuardian
                            ? (loanMembers[loan.id] ?? members[0]?.id ?? "")
                            : (userMemberId ?? loanMembers[loan.id] ?? "");
                          const amount = loanAmounts[loan.id] ?? "";
                          const months = loanMonths[loan.id] ?? "12";
                          const repaymentType = loanRepaymentTypes[loan.id] ?? "scheduled";
                          const description = loanDescriptions[loan.id]?.trim();
                          if (!amount || Number(amount) <= 0) {
                            toast({ title: "يرجى إدخال مبلغ صحيح", variant: "destructive" });
                            return;
                          }
                          if (!memberId) {
                            toast({
                              title: "تعذر تقديم الطلب",
                              description: "حسابك غير مرتبط بعضو في الصندوق. تواصل مع المشرف لربط الحساب.",
                              variant: "destructive",
                            });
                            return;
                          }
                          if (memberId) {
                            createMutation.mutate({
                              memberId,
                              type: loan.id,
                              title: loan.title,
                              amount,
                              description,
                              repaymentType,
                              repaymentMonths: repaymentType === "scheduled" ? Number(months) : null
                            });
                          }
                        }}
                        disabled={createMutation.isPending}
                        className="w-full bg-primary text-primary-foreground py-5 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 text-lg active:scale-95 disabled:opacity-50"
                      >
                        {createMutation.isPending ? "جاري الإرسال..." : "تأكيد وإرسال الطلب"}
                      </button>
                    </DialogContent>
                  </Dialog>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-bold text-lg text-primary font-heading">تاريخ الطلبات</h3>
                <History className="w-5 h-5 text-primary/30" />
              </div>
              
              <div className="space-y-3">
                {activeLoans.length === 0 ? (
                  <div className="text-center py-12 bg-muted/20 rounded-3xl border border-dashed border-border">
                    {settledLoans.length > 0 ? (
                      <div className="space-y-1">
                        <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
                        <p className="text-sm font-bold text-emerald-700">لا توجد سلف قائمة — الذمة صفر ✓</p>
                        <p className="text-[11px] text-muted-foreground">كل السلف السابقة مسددة بالكامل، وتفاصيلها محفوظة في التقارير</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground font-medium">لا توجد طلبات قائمة حالياً</p>
                    )}
                  </div>
                ) : (
                  activeLoans.map((loan) => {
                    const loanPayments = payments[loan.id] || [];
                    const paidTotal = loan.totalPaid ?? loanPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
                    const remainingTotal = loan.remaining ?? Math.max(Number(loan.amount) - paidTotal, 0);
                    return (
                    <motion.div
                      key={loan.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      data-testid={`card-loan-${loan.id}`}
                      className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm space-y-3"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            loan.status === 'approved' ? "bg-emerald-100 text-emerald-600" :
                            loan.status === 'rejected' ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                          )}>
                            <HandCoins className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-sm leading-none">{loan.title}</h4>
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                              {getMemberName(loan.memberId)} • {loan.createdAt ? new Date(loan.createdAt).toLocaleDateString('ar-OM') : ''}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-mono font-bold text-primary">
                            {Number(loan.amount).toLocaleString()} <span className="text-[10px] font-sans">ر.ع</span>
                          </div>
                          <div className={cn(
                            "text-[9px] font-bold px-2 py-0.5 rounded-full inline-block mt-1 uppercase",
                            loan.status === 'approved' ? "bg-emerald-500/10 text-emerald-700" :
                            loan.status === 'rejected' ? "bg-red-500/10 text-red-700" : "bg-amber-500/10 text-amber-700"
                          )}>
                            {loan.status === 'approved' ? 'معتمد' : loan.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
                          </div>
                        </div>
                      </div>

                      {(loan.description || loan.status === 'approved') && (
                        <div className="bg-muted/20 border border-border/40 rounded-xl p-3 space-y-2">
                          {loan.description && (
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                              <span className="font-bold text-foreground">الملاحظة: </span>{loan.description}
                            </p>
                          )}
                          {loan.status === 'approved' && (
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div>
                                <p className="text-[9px] text-muted-foreground font-bold">طريقة السداد</p>
                                <p className="text-[10px] font-bold text-primary">{loan.repaymentType === "open" ? "مفتوحة" : "بخطة"}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-muted-foreground font-bold">المسدد</p>
                                <p className="text-[10px] font-mono font-bold text-emerald-600">{paidTotal.toFixed(3)}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-muted-foreground font-bold">المتبقي</p>
                                <p className="text-[10px] font-mono font-bold text-amber-600">{remainingTotal.toFixed(3)}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {loan.status === 'pending' && Number(loan.amount) > LOAN_VOTE_THRESHOLD && (
                        <LoanVoteBox loanId={loan.id} />
                      )}

                      {isGuardian && loan.status === 'pending' && scoreOf(loan.memberId) && (
                        <div className="flex items-center gap-2 rounded-xl bg-muted/30 border border-border/40 px-3 py-2" data-testid={`score-badge-${loan.id}`}>
                          <Gauge className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-[10px] font-bold text-muted-foreground">درجة التزام الطالب:</span>
                          <span className={cn(
                            "text-sm font-mono font-bold",
                            (scoreOf(loan.memberId)?.score ?? 0) >= 80 ? "text-emerald-600" :
                            (scoreOf(loan.memberId)?.score ?? 0) >= 50 ? "text-amber-600" : "text-red-600",
                          )}>
                            {scoreOf(loan.memberId)?.score}/100
                          </span>
                          {(scoreOf(loan.memberId)?.overdueInstallments ?? 0) > 0 && (
                            <span className="mr-auto text-[9px] font-bold text-red-600">
                              {scoreOf(loan.memberId)?.overdueInstallments} قسط متأخر
                            </span>
                          )}
                        </div>
                      )}

                      {isGuardian && loan.status === 'pending' && (
                        <div className="flex gap-2 pt-1 border-t border-border/40">
                          <button 
                            data-testid={`button-approve-${loan.id}`}
                            onClick={() => statusMutation.mutate({ id: loan.id, status: "approved" })}
                            disabled={statusMutation.isPending}
                            className="flex-1 bg-emerald-600 text-white py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            اعتماد
                          </button>
                          <button 
                            data-testid={`button-reject-${loan.id}`}
                            onClick={() => statusMutation.mutate({ id: loan.id, status: "rejected" })}
                            disabled={statusMutation.isPending}
                            className="flex-1 bg-red-600 text-white py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            رفض
                          </button>
                        </div>
                      )}

                      {loan.status === 'approved' && (
                        <button 
                          data-testid={`button-repayments-${loan.id}`}
                          onClick={() => loadRepayments(loan.id)}
                          className="w-full text-[10px] font-bold text-primary flex items-center justify-center gap-1 pt-2 border-t border-border/40"
                        >
                          <Calendar className="w-3 h-3" />
                          عرض تفاصيل السداد {expandedLoan === loan.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}

                      <AnimatePresence>
                        {expandedLoan === loan.id && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-3 space-y-3">
                              {isGuardian && remainingTotal > 0 && (
                                <div className="bg-primary/5 border border-primary/10 rounded-2xl p-3 space-y-2">
                                  <p className="text-[10px] font-bold text-primary">تسجيل سداد يدوي</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      type="number"
                                      placeholder="المبلغ"
                                      value={paymentAmounts[loan.id] ?? ""}
                                      onChange={(e) => setPaymentAmounts((prev) => ({ ...prev, [loan.id]: e.target.value }))}
                                      className="p-3 border border-primary/10 rounded-xl text-sm font-mono outline-none"
                                      data-testid={`input-payment-amount-${loan.id}`}
                                    />
                                    <input
                                      type="text"
                                      placeholder="ملاحظة السداد"
                                      value={paymentNotes[loan.id] ?? ""}
                                      onChange={(e) => setPaymentNotes((prev) => ({ ...prev, [loan.id]: e.target.value }))}
                                      className="p-3 border border-primary/10 rounded-xl text-sm outline-none"
                                      data-testid={`input-payment-note-${loan.id}`}
                                    />
                                  </div>
                                  <button
                                    onClick={() => {
                                      const amount = paymentAmounts[loan.id] ?? "";
                                      if (!amount || Number(amount) <= 0) {
                                        toast({ title: "يرجى إدخال مبلغ سداد صحيح", variant: "destructive" });
                                        return;
                                      }
                                      paymentMutation.mutate({ loanId: loan.id, amount, note: paymentNotes[loan.id]?.trim() });
                                    }}
                                    disabled={paymentMutation.isPending}
                                    className="w-full bg-primary text-primary-foreground py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                                    data-testid={`button-payment-${loan.id}`}
                                  >
                                    تسجيل سداد
                                  </button>
                                </div>
                              )}

                              {loanPayments.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-[10px] font-bold text-muted-foreground px-1">دفعات السداد</p>
                                  {loanPayments.map((payment) => (
                                    <div key={payment.id} className="p-3 rounded-xl border bg-emerald-50/40 border-emerald-200/50 flex justify-between items-start gap-3">
                                      <div>
                                        <p className="text-xs font-mono font-bold text-emerald-700">{Number(payment.amount).toFixed(3)} ر.ع</p>
                                        {payment.note && <p className="text-[9px] text-muted-foreground mt-1">{payment.note}</p>}
                                      </div>
                                      <span className="text-[8px] text-muted-foreground">{payment.paidAt ? new Date(payment.paidAt).toLocaleDateString('ar-OM') : ""}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {loan.repaymentType !== "open" && repayments[loan.id] && (
                              <>
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-[10px] font-bold text-muted-foreground">جدولة الأقساط ({loan.repaymentMonths} شهر)</span>
                                  <span className="text-[10px] font-bold text-emerald-600">
                                    {repayments[loan.id].filter(r => r.status === 'paid').length}/{repayments[loan.id].length} مدفوع
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  {repayments[loan.id].map((step) => (
                                  <div key={step.id} className={cn(
                                    "p-3 rounded-xl border flex justify-between items-center",
                                    step.status === 'paid' ? "bg-emerald-50/50 border-emerald-200/50" : "bg-muted/30 border-border/30"
                                  )}>
                                    <div className="flex items-center gap-2">
                                      <div className={cn(
                                        "w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold",
                                        step.status === 'paid' ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                                      )}>
                                        {step.installmentNumber}
                                      </div>
                                      <div>
                                        <div className="text-xs font-bold font-mono">{Number(step.amount).toFixed(3)} <span className="text-[9px] font-sans text-muted-foreground">ر.ع</span></div>
                                        <div className="text-[8px] text-muted-foreground">
                                          {step.status === 'paid' && step.paidAt 
                                            ? `مدفوع ${new Date(step.paidAt).toLocaleDateString('ar-OM')}` 
                                            : step.dueDate 
                                              ? `استحقاق ${new Date(step.dueDate).toLocaleDateString('ar-OM')}`
                                              : 'مجدول'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {step.status === 'paid' ? (
                                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-lg flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3" /> مدفوع
                                        </span>
                                      ) : (
                                        isGuardian ? (
                                          <button
                                            onClick={() => repayMutation.mutate(step.id)}
                                            disabled={repayMutation.isPending}
                                            className="text-[9px] font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                                            data-testid={`button-repay-${step.id}`}
                                          >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            تسديد
                                          </button>
                                        ) : (
                                          <span className="text-[9px] font-bold text-amber-600 bg-amber-500/10 px-2 py-1 rounded-lg flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> مجدول
                                          </span>
                                        )
                                      )}
                                    </div>
                                  </div>
                                  ))}
                                </div>
                              </>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {isGuardian && (
                        <div className="flex gap-2 pt-2 border-t border-border/40">
                          <button
                            data-testid={`button-edit-${loan.id}`}
                            onClick={() => {
                              setEditTarget(loan);
                              setEditForm({
                                title: loan.title,
                                description: loan.description ?? "",
                                type: loan.type,
                                amount: String(loan.amount),
                                repaymentMonths: String(loan.repaymentMonths ?? 12),
                              });
                            }}
                            className="flex-1 text-[10px] text-muted-foreground flex items-center justify-center gap-1 py-1 hover:text-primary transition-colors"
                          >
                            <Pencil className="w-3 h-3" /> تعديل
                          </button>
                          <button
                            data-testid={`button-delete-${loan.id}`}
                            onClick={() => setDeleteTarget({ id: loan.id, title: loan.title })}
                            disabled={deleteMutation.isPending}
                            className="flex-1 text-[10px] text-muted-foreground flex items-center justify-center gap-1 py-1 hover:text-red-500 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3 h-3" /> حذف السجل
                          </button>
                        </div>
                      )}
                    </motion.div>
                    );
                  })
                )}
              </div>

              {settledLoans.length > 0 && activeLoans.length > 0 && (
                <Link
                  href="/analytics"
                  className="block bg-emerald-50/60 border border-emerald-200/60 rounded-2xl p-4 hover:border-emerald-300 transition-colors"
                  data-testid="link-settled-loans"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-emerald-800">{settledLoans.length} سلفة مسددة بالكامل</p>
                        <p className="text-[10px] text-emerald-700/70">انتقلت من القائمة النشطة — التفاصيل الكاملة في التقارير</p>
                      </div>
                    </div>
                    <BarChart3 className="w-4 h-4 text-emerald-600/50" />
                  </div>
                </Link>
              )}
            </div>

            {/* تأكيد حذف السلفة */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-heading">حذف سجل السلفة؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم حذف سلفة «{deleteTarget?.title}» مع كل أقساطها ودفعات سدادها نهائياً، وإعادة حساب تخصيص رأس المال. تُوثَّق هذه العملية باسمك في سجل التدقيق.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>تراجع</AlertDialogCancel>
                  <AlertDialogAction
                    data-testid="button-confirm-delete-loan"
                    disabled={deleteMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteMutation.isPending ? "جارٍ الحذف..." : "حذف نهائي"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* تعديل السلفة */}
            <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
              <DialogContent className="sm:max-w-md" dir="rtl">
                <DialogHeader>
                  <DialogTitle className="font-heading">تعديل السلفة</DialogTitle>
                  <DialogDescription>
                    {editTarget?.status === "pending"
                      ? "السلفة معلقة — يمكن تعديل كل الحقول بما فيها المبلغ وخطة السداد."
                      : "السلفة معتمدة — يمكن تعديل العنوان والملاحظة والنوع فقط (المبلغ وخطة السداد مقفلان بعد إنشاء الأقساط)."}
                  </DialogDescription>
                </DialogHeader>
                <div className="py-2 space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold">عنوان السلفة</label>
                    <input
                      value={editForm.title}
                      onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                      className="w-full p-3 border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/40"
                      data-testid="input-edit-title"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold">الملاحظة</label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                      rows={2}
                      className="w-full p-3 border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                      data-testid="input-edit-description"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold">النوع</label>
                    <select
                      value={editForm.type}
                      onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}
                      className="w-full p-3 border border-border rounded-xl text-sm bg-background outline-none"
                    >
                      <option value="urgent">سلفة عاجلة</option>
                      <option value="standard">سلفة غير عاجلة</option>
                      <option value="emergency">قرض طارئ</option>
                    </select>
                  </div>
                  {editTarget?.status === "pending" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold">المبلغ (ر.ع)</label>
                        <input
                          type="number"
                          value={editForm.amount}
                          onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
                          className="w-full p-3 border border-border rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-primary/40"
                          data-testid="input-edit-amount"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold">أشهر السداد</label>
                        <input
                          type="number"
                          value={editForm.repaymentMonths}
                          onChange={(e) => setEditForm((p) => ({ ...p, repaymentMonths: e.target.value }))}
                          className="w-full p-3 border border-border rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (!editTarget) return;
                      const base: Parameters<typeof updateLoan>[1] = {
                        title: editForm.title.trim(),
                        description: editForm.description.trim() || null,
                        type: editForm.type,
                      };
                      if (editTarget.status === "pending") {
                        base.amount = editForm.amount;
                        base.repaymentMonths = editTarget.repaymentType === "scheduled" ? Number(editForm.repaymentMonths) : null;
                      }
                      editMutation.mutate({ id: editTarget.id, data: base });
                    }}
                    disabled={editMutation.isPending || !editForm.title.trim()}
                    className="w-full bg-primary text-primary-foreground py-3 rounded-2xl font-bold text-sm disabled:opacity-50"
                    data-testid="button-save-edit"
                  >
                    {editMutation.isPending ? "جارٍ الحفظ..." : "حفظ التعديلات"}
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </MobileLayout>
  );
}
