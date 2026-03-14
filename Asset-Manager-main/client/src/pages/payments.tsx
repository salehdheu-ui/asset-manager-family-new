import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getMembers, getContributions, createContribution, approveContribution, deleteContribution } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  UserCheck,
  AlertCircle,
  Calendar,
  TrendingUp,
  Coins,
  Trash2,
  XCircle
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";

export default function YearlyPaymentMatrix() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const { user } = useAuth();
  const isGuardian = user?.role === 'admin';
  const userMemberId = (user as any)?.memberId;

  const { data: allMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: ["members"],
    queryFn: getMembers,
  });

  const members = isGuardian ? allMembers : allMembers.filter(m => m.id === userMemberId);

  const { data: contributions = [], isLoading: contribLoading } = useQuery({
    queryKey: ["contributions", selectedYear],
    queryFn: () => getContributions(selectedYear),
  });

  const createMutation = useMutation({
    mutationFn: createContribution,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contributions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ 
        title: "تم تقديم طلب الدفع",
        description: "بانتظار اعتماد الوصي للمبلغ."
      });
    },
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [openDialogKey, setOpenDialogKey] = useState<string | null>(null);

  const approveMutation = useMutation({
    mutationFn: approveContribution,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contributions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: "تم اعتماد المساهمة بنجاح" });
      setOpenDialogKey(null);
    },
    onError: (error) => {
      toast({ title: "حدث خطأ", description: (error as any)?.message || "تعذر اعتماد المساهمة", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteContribution,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contributions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: "تم حذف المساهمة بنجاح" });
      setConfirmDeleteId(null);
      setOpenDialogKey(null);
    },
    onError: (error) => {
      toast({ title: "حدث خطأ", description: (error as any)?.message || "تعذر حذف المساهمة", variant: "destructive" });
    },
  });

  const months = [
    { id: 1, name: "يناير", short: "01" }, { id: 2, name: "فبراير", short: "02" }, { id: 3, name: "مارس", short: "03" },
    { id: 4, name: "أبريل", short: "04" }, { id: 5, name: "مايو", short: "05" }, { id: 6, name: "يونيو", short: "06" },
    { id: 7, name: "يوليو", short: "07" }, { id: 8, name: "أغسطس", short: "08" }, { id: 9, name: "سبتمبر", short: "09" },
    { id: 10, name: "أكتوبر", short: "10" }, { id: 11, name: "نوفمبر", short: "11" }, { id: 12, name: "ديسمبر", short: "12" }
  ];

  const getContribution = (memberId: string, month: number) => {
    return contributions.find(c => c.memberId === memberId && c.month === month);
  };

  const years = Array.from({ length: 2099 - 2020 + 1 }, (_, i) => 2020 + i);

  const totalAllApproved = contributions.filter(c => c.status === 'approved').reduce((sum, c) => sum + Number(c.amount), 0);
  const totalPending = contributions.filter(c => c.status === 'pending_approval').length;

  if (membersLoading || contribLoading) {
    return (
      <MobileLayout title="سجل المساهمات والاعتمادات">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="سجل المساهمات والاعتمادات">
      <div className="space-y-5 pt-2 pb-16">
        
        {/* Year Selector */}
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/15 rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setSelectedYear(prev => Math.max(2020, prev - 1))}
              className="w-11 h-11 flex items-center justify-center bg-card hover:bg-primary/10 rounded-2xl transition-all border border-border/50 active:scale-90 shadow-sm"
              data-testid="button-prev-year"
            >
              <ChevronRight className="w-5 h-5 text-primary" />
            </button>
            
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary/60" />
                <span className="text-[10px] text-primary/70 uppercase font-bold tracking-[0.2em]">السنة المالية</span>
              </div>
              <div className="relative">
                <select 
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-transparent font-bold text-4xl font-mono focus:outline-none appearance-none text-center cursor-pointer text-primary pr-2 pl-2"
                  data-testid="select-year"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <div className="h-0.5 w-full bg-gradient-to-l from-transparent via-primary/30 to-transparent mt-1 rounded-full" />
              </div>
              {selectedYear === currentYear && (
                <span className="text-[9px] bg-primary/15 text-primary px-3 py-0.5 rounded-full font-bold">السنة الحالية</span>
              )}
            </div>

            <button 
              onClick={() => setSelectedYear(prev => Math.min(2099, prev + 1))}
              className="w-11 h-11 flex items-center justify-center bg-card hover:bg-primary/10 rounded-2xl transition-all border border-border/50 active:scale-90 shadow-sm"
              data-testid="button-next-year"
            >
              <ChevronLeft className="w-5 h-5 text-primary" />
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] text-emerald-600/70 font-bold">إجمالي المعتمد</p>
              <p className="text-lg font-mono font-bold text-emerald-700" data-testid="text-total-approved">{totalAllApproved.toLocaleString()} <span className="text-[10px] font-sans">ر.ع</span></p>
            </div>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.05 }}
            className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-[10px] text-amber-600/70 font-bold">طلبات معلقة</p>
              <p className="text-lg font-mono font-bold text-amber-700" data-testid="text-total-pending">{totalPending}</p>
            </div>
          </motion.div>
        </div>

        {members.length === 0 ? (
          <div className="text-center py-16 bg-muted/10 rounded-3xl border border-dashed border-border/60">
            <Coins className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-bold">لا يوجد أعضاء</p>
            <p className="text-xs text-muted-foreground/70 mt-1">يرجى إضافة أعضاء من صفحة الأعضاء أولاً</p>
          </div>
        ) : (
          <div className="space-y-5">
            {members.map((member, mIdx) => {
              const memberContributions = contributions.filter(c => c.memberId === member.id && c.status === 'approved');
              const memberPending = contributions.filter(c => c.memberId === member.id && c.status === 'pending_approval');
              const totalApproved = memberContributions.reduce((sum, c) => sum + Number(c.amount), 0);
              const paidMonths = memberContributions.length;

              return (
                <motion.div 
                  key={member.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: mIdx * 0.06 }}
                  className="bg-card border border-border/50 rounded-3xl overflow-hidden shadow-sm"
                  data-testid={`card-member-${member.id}`}
                >
                  {/* Member Header */}
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center font-bold text-primary text-lg border border-primary/15">
                        {member.avatar || member.name.substring(0, 2)}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm" data-testid={`text-member-name-${member.id}`}>{member.name}</h4>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-emerald-600 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md">
                            {totalApproved.toLocaleString()} ر.ع
                          </span>
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {paidMonths}/12 شهر
                          </span>
                        </div>
                      </div>
                    </div>
                    {memberPending.length > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200/60">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                        <span className="text-[9px] font-bold text-amber-600">{memberPending.length} معلق</span>
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="px-4 pb-3">
                    <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(paidMonths / 12) * 100}%` }}
                        transition={{ duration: 0.8, delay: mIdx * 0.1 }}
                        className="h-full bg-gradient-to-l from-emerald-400 to-emerald-500 rounded-full"
                      />
                    </div>
                  </div>

                  {/* Months Grid */}
                  <div className="grid grid-cols-4 gap-2 p-3 pt-1">
                    {months.map((month) => {
                      const contribution = getContribution(member.id, month.id);
                      const isPending = contribution?.status === 'pending_approval';
                      const isApproved = contribution?.status === 'approved';
                      const amount = contribution ? Number(contribution.amount) : 0;
                      const isCurrentMonth = selectedYear === currentYear && month.id === currentMonth;

                      const dialogKey = `${member.id}-${month.id}`;

                      return (
                        <Dialog key={month.id} open={openDialogKey === dialogKey} onOpenChange={(open) => {
                          setOpenDialogKey(open ? dialogKey : null);
                          if (!open) setConfirmDeleteId(null);
                        }}>
                          <DialogTrigger asChild>
                            <button 
                              className={cn(
                                "relative flex flex-col items-center justify-center py-3 px-1 gap-0.5 transition-all rounded-2xl border",
                                isApproved 
                                  ? "bg-emerald-500/8 border-emerald-500/20 hover:bg-emerald-500/15" 
                                  : isPending 
                                    ? "bg-amber-500/8 border-amber-400/25 hover:bg-amber-500/15" 
                                    : isCurrentMonth
                                      ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                                      : "bg-muted/20 border-transparent hover:bg-muted/40 hover:border-border/30"
                              )}
                              data-testid={`button-month-${member.id}-${month.id}`}
                            >
                              <span className={cn(
                                "text-[10px] font-bold",
                                isApproved ? "text-emerald-600" : isPending ? "text-amber-600" : isCurrentMonth ? "text-primary" : "text-muted-foreground/70"
                              )}>
                                {month.name}
                              </span>
                              
                              {isApproved ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                              ) : isPending ? (
                                <Clock className="w-5 h-5 text-amber-500 mt-0.5 animate-pulse" />
                              ) : (
                                <span className="text-[11px] font-mono text-muted-foreground/40 mt-0.5">---</span>
                              )}

                              {amount > 0 && (
                                <span className={cn(
                                  "text-[9px] font-mono font-bold mt-0.5",
                                  isApproved ? "text-emerald-700" : "text-amber-700"
                                )}>
                                  {amount.toLocaleString()}
                                </span>
                              )}

                              {isCurrentMonth && !isApproved && !isPending && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full border-2 border-card" />
                              )}
                            </button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md font-sans" dir="rtl">
                            <DialogHeader>
                              <DialogTitle className="font-heading text-xl font-bold">
                                {isApproved ? "تم تأكيد المساهمة" : isPending ? "طلب قيد الانتظار" : "تقديم طلب مساهمة"}
                              </DialogTitle>
                              <DialogDescription className="font-medium">
                                العضو: {member.name} - {month.name} {selectedYear}
                              </DialogDescription>
                            </DialogHeader>

                            <div className="py-6 space-y-4">
                              {isApproved ? (
                                <div className="space-y-4">
                                  <div className="bg-emerald-50 text-emerald-800 p-8 rounded-[2rem] flex flex-col items-center gap-3 text-center border border-emerald-100">
                                    <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                                    <div className="text-4xl font-mono font-bold tracking-tighter">{amount.toLocaleString()} <span className="text-base font-sans font-normal">ر.ع</span></div>
                                    <p className="text-sm font-bold opacity-80">تم الاعتماد والتوثيق</p>
                                  </div>

                                  {isGuardian && contribution && (
                                    <>
                                      {confirmDeleteId === contribution.id ? (
                                        <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-5 space-y-4">
                                          <div className="flex items-center gap-2 text-destructive">
                                            <AlertCircle className="w-5 h-5" />
                                            <p className="text-sm font-bold">هل أنت متأكد من حذف هذه المساهمة؟</p>
                                          </div>
                                          <p className="text-xs text-muted-foreground leading-relaxed">سيتم حذف المبلغ المعتمد ({amount.toLocaleString()} ر.ع) نهائياً وإزالته من السجل.</p>
                                          <div className="flex gap-3">
                                            <button
                                              onClick={() => deleteMutation.mutate(contribution.id)}
                                              disabled={deleteMutation.isPending}
                                              className="flex-1 bg-destructive text-destructive-foreground py-3 rounded-xl font-bold hover:bg-destructive/90 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                                              data-testid="button-confirm-delete-contribution"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                              {deleteMutation.isPending ? "جاري الحذف..." : "تأكيد الحذف"}
                                            </button>
                                            <button
                                              onClick={() => setConfirmDeleteId(null)}
                                              className="flex-1 bg-muted py-3 rounded-xl font-bold hover:bg-muted/80 transition-all active:scale-95"
                                              data-testid="button-cancel-delete"
                                            >
                                              تراجع
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <button 
                                          onClick={() => setConfirmDeleteId(contribution.id)}
                                          className="w-full bg-destructive/10 text-destructive py-4 rounded-2xl font-bold hover:bg-destructive/20 transition-all flex items-center justify-center gap-2 text-base active:scale-95"
                                          data-testid="button-delete-contribution"
                                        >
                                          <Trash2 className="w-5 h-5" />
                                          حذف المبلغ المعتمد
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              ) : isPending ? (
                                <div className="space-y-4">
                                  <div className="bg-amber-50 text-amber-800 p-8 rounded-[2rem] flex flex-col items-center gap-3 text-center border border-amber-100">
                                    <Clock className="w-16 h-16 text-amber-500" />
                                    <div className="text-4xl font-mono font-bold tracking-tighter">{amount.toLocaleString()} <span className="text-base font-sans font-normal">ر.ع</span></div>
                                    <p className="text-sm font-bold opacity-80">بانتظار تأكيد الوصي</p>
                                  </div>
                                  
                                  {isGuardian && contribution && (
                                    <div className="space-y-3">
                                      <button 
                                        onClick={() => approveMutation.mutate(contribution.id)}
                                        disabled={approveMutation.isPending}
                                        className="w-full bg-primary text-primary-foreground py-5 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 text-lg active:scale-95 disabled:opacity-50"
                                        data-testid="button-approve-contribution"
                                      >
                                        <UserCheck className="w-6 h-6" />
                                        اعتماد استلام المبلغ
                                      </button>

                                      {confirmDeleteId === contribution.id ? (
                                        <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-5 space-y-4">
                                          <div className="flex items-center gap-2 text-destructive">
                                            <AlertCircle className="w-5 h-5" />
                                            <p className="text-sm font-bold">هل أنت متأكد من إلغاء هذا الطلب؟</p>
                                          </div>
                                          <div className="flex gap-3">
                                            <button
                                              onClick={() => deleteMutation.mutate(contribution.id)}
                                              disabled={deleteMutation.isPending}
                                              className="flex-1 bg-destructive text-destructive-foreground py-3 rounded-xl font-bold hover:bg-destructive/90 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                                              data-testid="button-confirm-cancel-contribution"
                                            >
                                              <XCircle className="w-4 h-4" />
                                              {deleteMutation.isPending ? "جاري الإلغاء..." : "تأكيد الإلغاء"}
                                            </button>
                                            <button
                                              onClick={() => setConfirmDeleteId(null)}
                                              className="flex-1 bg-muted py-3 rounded-xl font-bold hover:bg-muted/80 transition-all active:scale-95"
                                              data-testid="button-keep-contribution"
                                            >
                                              تراجع
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <button 
                                          onClick={() => setConfirmDeleteId(contribution.id)}
                                          className="w-full bg-destructive/10 text-destructive py-4 rounded-2xl font-bold hover:bg-destructive/20 transition-all flex items-center justify-center gap-2 text-base active:scale-95"
                                          data-testid="button-cancel-contribution"
                                        >
                                          <XCircle className="w-5 h-5" />
                                          إلغاء الطلب
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-6">
                                  <div className="space-y-3">
                                    <label className="text-sm font-bold block text-muted-foreground mr-1">المبلغ المراد دفعه</label>
                                    <div className="relative">
                                       <input 
                                        type="number" 
                                        defaultValue={100}
                                        id={`amount-${member.id}-${month.id}`}
                                        className="w-full text-4xl font-mono p-6 border-2 border-primary/10 rounded-3xl text-center focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all" 
                                        placeholder="0"
                                        data-testid="input-amount"
                                      />
                                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-primary font-bold text-lg">ر.ع</div>
                                    </div>
                                  </div>
                                  <div className="bg-primary/5 p-5 rounded-2xl text-xs flex gap-3 items-start border border-primary/10">
                                    <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                    <p className="leading-relaxed font-medium">سيتم إرسال طلب للوصي لتأكيد وصول المبلغ. لن يظهر المبلغ في الرصيد الإجمالي إلا بعد الموافقة الرسمية.</p>
                                  </div>
                                  <button 
                                    onClick={() => {
                                      const val = (document.getElementById(`amount-${member.id}-${month.id}`) as HTMLInputElement).value;
                                      if (val) {
                                        createMutation.mutate({
                                          memberId: member.id,
                                          year: selectedYear,
                                          month: month.id,
                                          amount: val,
                                          status: "pending_approval"
                                        });
                                      }
                                    }}
                                    disabled={createMutation.isPending}
                                    className="w-full bg-primary text-primary-foreground py-5 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 text-lg active:scale-95 disabled:opacity-50"
                                    data-testid="button-submit-payment"
                                  >
                                    تقديم طلب دفع
                                  </button>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
