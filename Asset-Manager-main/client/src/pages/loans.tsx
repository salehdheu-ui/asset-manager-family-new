import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getLoans, getMembers, createLoan, updateLoanStatus, deleteLoan, getLoanRepayments, markRepaymentPaid, getDashboardSummary } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { HandCoins, Clock, AlertCircle, CheckCircle2, History, UserCheck, Trash2, X, Calendar, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
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
    try {
      const match = error.message.match(/^\d+:\s*([\s\S]+)$/);
      if (match) {
        const parsed = JSON.parse(match[1]);
        if (parsed.error) return parsed.error;
      }
    } catch {}
    return error.message;
  }
  return "حدث خطأ غير متوقع";
}

export default function Loans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isGuardian = user?.role === 'admin';
  const userMemberId = (user as any)?.memberId;
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [repayments, setRepayments] = useState<Record<string, any[]>>({});
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  
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

  const createMutation = useMutation({
    mutationFn: createLoan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
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
      toast({ title: "تم حذف السجل" });
    },
    onError: (error) => {
      toast({
        title: "حدث خطأ",
        description: extractErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const repayMutation = useMutation({
    mutationFn: markRepaymentPaid,
    onSuccess: async (updatedRepayment) => {
      const loanId = updatedRepayment.loanId;
      const freshData = await getLoanRepayments(loanId);
      setRepayments(prev => ({ ...prev, [loanId]: freshData }));
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

  const loadRepayments = async (loanId: string) => {
    if (!repayments[loanId]) {
      const data = await getLoanRepayments(loanId);
      setRepayments(prev => ({ ...prev, [loanId]: data }));
    }
    setExpandedLoan(expandedLoan === loanId ? null : loanId);
  };

  const getMemberName = (memberId: string) => {
    return members.find(m => m.id === memberId)?.name || "غير معروف";
  };

  const flexibleLayer = summary?.layers?.find(l => l.id === "flexible");
  const availableCapital = (flexibleLayer as any)?.available ?? flexibleLayer?.amount ?? 0;

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
                            defaultValue={members[0]?.id}
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
                            />
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-primary font-bold text-lg">ر.ع</div>
                          </div>
                          <p className="text-[10px] text-muted-foreground mr-1">
                            الحد المتاح: <span className="font-mono font-bold text-primary">{availableCapital.toLocaleString()}</span> ر.ع
                          </p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-bold block text-muted-foreground mr-1">مدة السداد (بالأشهر)</label>
                          <select 
                            id={`loan-months-${loan.id}`}
                            data-testid={`select-months-${loan.id}`}
                            className="w-full p-4 border-2 border-primary/10 rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                            defaultValue="12"
                          >
                            <option value="6">6 أشهر</option>
                            <option value="12">12 شهر</option>
                            <option value="18">18 شهر</option>
                            <option value="24">24 شهر</option>
                          </select>
                        </div>
                        <div className="bg-muted/30 p-4 rounded-2xl text-xs text-muted-foreground space-y-2 border border-border/50 font-medium">
                          <p>• المال وسيلة لخدمة العائلة، وليس غاية.</p>
                          <p>• بتقديمك لهذا الطلب، أنت تتعهد بالمسؤولية تجاه مستقبل العائلة.</p>
                        </div>
                      </div>
                      <button 
                        data-testid={`button-submit-loan-${loan.id}`}
                        onClick={() => {
                          const memberId = (document.getElementById(`loan-member-${loan.id}`) as HTMLSelectElement).value;
                          const amount = (document.getElementById(`loan-amount-${loan.id}`) as HTMLInputElement).value;
                          const months = (document.getElementById(`loan-months-${loan.id}`) as HTMLSelectElement).value;
                          if (!amount || Number(amount) <= 0) {
                            toast({ title: "يرجى إدخال مبلغ صحيح", variant: "destructive" });
                            return;
                          }
                          if (memberId) {
                            createMutation.mutate({
                              memberId,
                              type: loan.id,
                              title: loan.title,
                              amount,
                              repaymentMonths: Number(months)
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
                {loans.length === 0 ? (
                  <div className="text-center py-12 bg-muted/20 rounded-3xl border border-dashed border-border">
                    <p className="text-sm text-muted-foreground font-medium">لا توجد طلبات قائمة حالياً</p>
                  </div>
                ) : (
                  loans.map((loan) => (
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
                          عرض خطة السداد {expandedLoan === loan.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}

                      <AnimatePresence>
                        {expandedLoan === loan.id && repayments[loan.id] && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-3 space-y-3">
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
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {loan.status !== 'pending' && (
                        <button 
                          data-testid={`button-delete-${loan.id}`}
                          onClick={() => deleteMutation.mutate(loan.id)}
                          disabled={deleteMutation.isPending}
                          className="w-full text-[10px] text-muted-foreground flex items-center justify-center gap-1 pt-2 border-t border-border/40 hover:text-red-500 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3" /> حذف السجل
                        </button>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </MobileLayout>
  );
}
