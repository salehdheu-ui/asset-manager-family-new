import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getMembers, getContributions, getLoans, getExpenses, getLoanRepayments } from "@/lib/api";
import { 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  User,
  ChevronDown,
  ChevronUp,
  CreditCard,
  HandCoins,
  Wallet
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function Reports() {
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [repayments, setRepayments] = useState<Record<string, any[]>>({});

  const { data: members = [] } = useQuery({
    queryKey: ["members"],
    queryFn: getMembers,
  });

  const { data: contributions = [] } = useQuery({
    queryKey: ["contributions"],
    queryFn: () => getContributions(),
  });

  const { data: loans = [] } = useQuery({
    queryKey: ["loans"],
    queryFn: getLoans,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: getExpenses,
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

  // Create transactions list
  const transactions = [
    ...contributions.filter(c => c.status === 'approved').map(c => ({
      id: c.id,
      type: 'contribution' as const,
      title: `مساهمة شهر ${c.month}/${c.year}`,
      amount: Number(c.amount),
      date: c.createdAt ? new Date(c.createdAt).toLocaleDateString('ar-OM') : '',
      memberName: getMemberName(c.memberId),
      status: 'معتمد'
    })),
    ...expenses.map(e => ({
      id: e.id,
      type: 'expense' as const,
      title: e.title,
      amount: Number(e.amount),
      date: e.createdAt ? new Date(e.createdAt).toLocaleDateString('ar-OM') : '',
      memberName: 'النظام',
      status: 'منفذ'
    })),
    ...loans.filter(l => l.status === 'approved').map(l => ({
      id: l.id,
      type: 'loan' as const,
      title: l.title,
      amount: Number(l.amount),
      date: l.createdAt ? new Date(l.createdAt).toLocaleDateString('ar-OM') : '',
      memberName: getMemberName(l.memberId),
      status: 'معتمد',
      repaymentMonths: l.repaymentMonths
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const [allRepaymentsTotals, setAllRepaymentsTotals] = useState(0);
  const [memberRepayments, setMemberRepayments] = useState<Record<string, number>>({});

  useEffect(() => {
    const approvedLoans = loans.filter(l => l.status === 'approved');
    if (approvedLoans.length === 0) {
      setAllRepaymentsTotals(0);
      setMemberRepayments({});
      return;
    }
    let cancelled = false;
    (async () => {
      let total = 0;
      const perMember: Record<string, number> = {};
      for (const loan of approvedLoans) {
        const reps = await getLoanRepayments(loan.id);
        const paidSum = reps.filter(r => r.status === 'paid').reduce((sum, r) => sum + Number(r.amount), 0);
        total += paidSum;
        perMember[loan.memberId] = (perMember[loan.memberId] || 0) + paidSum;
      }
      if (!cancelled) {
        setAllRepaymentsTotals(total);
        setMemberRepayments(perMember);
      }
    })();
    return () => { cancelled = true; };
  }, [loans]);

  // Member stats
  const memberStats = members.map(m => {
    const memberContributions = contributions.filter(c => c.memberId === m.id && c.status === 'approved');
    const memberLoans = loans.filter(l => l.memberId === m.id && l.status === 'approved');
    
    return {
      ...m,
      totalPaid: memberContributions.reduce((sum, c) => sum + Number(c.amount), 0),
      totalBorrowed: memberLoans.reduce((sum, l) => sum + Number(l.amount), 0) - (memberRepayments[m.id] || 0),
      loanCount: memberLoans.length
    };
  });

  const totalContributions = contributions.filter(c => c.status === 'approved').reduce((sum, c) => sum + Number(c.amount), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalLoans = loans.filter(l => l.status === 'approved').reduce((sum, l) => sum + Number(l.amount), 0);

  return (
    <MobileLayout title="الكشوفات والتقارير">
      <div className="space-y-8 pt-2 pb-12">
        
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 mb-3">
              <TrendingUp className="w-6 h-6" />
            </div>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">إجمالي الإيداعات</p>
            <h4 className="text-xl font-bold font-mono text-primary mt-1">
              {totalContributions.toLocaleString()} <span className="text-xs font-sans">ر.ع</span>
            </h4>
          </div>
          <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 mb-3">
              <TrendingDown className="w-6 h-6" />
            </div>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">إجمالي المنصرف</p>
            <h4 className="text-xl font-bold font-mono text-primary mt-1">
              {(totalExpenses + totalLoans - allRepaymentsTotals).toLocaleString()} <span className="text-xs font-sans">ر.ع</span>
            </h4>
          </div>
        </div>

        {/* Members Statements */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg text-primary px-1 flex items-center gap-2 font-heading">
            <User className="w-5 h-5" /> كشف الأعضاء
          </h3>
          {memberStats.length === 0 ? (
            <div className="text-center py-8 bg-muted/20 rounded-3xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground font-medium">لا يوجد أعضاء</p>
            </div>
          ) : (
            <div className="space-y-3">
              {memberStats.map((m, idx) => (
                <motion.div 
                  key={m.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-card border border-border/60 rounded-[1.5rem] p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary border border-primary/5">
                        {m.avatar || m.name.substring(0, 2)}
                      </div>
                      <h4 className="font-bold text-sm">{m.name}</h4>
                    </div>
                    <span className="text-[9px] bg-muted px-2 py-0.5 rounded-full font-bold uppercase tracking-widest text-muted-foreground">
                      {m.role === 'guardian' ? 'الوصي' : 'عضو'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-2xl p-3">
                      <p className="text-[9px] text-emerald-700 font-bold mb-1">دفع إجمالي</p>
                      <div className="text-base font-bold font-mono text-emerald-600">{m.totalPaid.toLocaleString()} ر.ع</div>
                    </div>
                    <div className="bg-amber-50/50 border border-amber-100/50 rounded-2xl p-3">
                      <p className="text-[9px] text-amber-700 font-bold mb-1">تسلف إجمالي</p>
                      <div className="text-base font-bold font-mono text-amber-600">{m.totalBorrowed.toLocaleString()} ر.ع</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* All Transactions Ledger */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg text-primary px-1 flex items-center gap-2 font-heading">
            <FileText className="w-5 h-5" /> السجل العام للمحررات
          </h3>
          {transactions.length === 0 ? (
            <div className="text-center py-8 bg-muted/20 rounded-3xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground font-medium">لا توجد محررات حتى الآن</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((t, idx) => (
                <motion.div 
                  key={t.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        t.type === 'contribution' ? "bg-emerald-100 text-emerald-600" :
                        t.type === 'loan' ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"
                      )}>
                        {t.type === 'contribution' ? <CreditCard className="w-5 h-5" /> :
                         t.type === 'loan' ? <HandCoins className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                      </div>
                      <div>
                        <h5 className="text-sm font-bold leading-tight">{t.title}</h5>
                        <p className="text-[10px] text-muted-foreground font-medium mt-1">{t.memberName} • {t.date}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn(
                        "text-base font-bold font-mono tracking-tighter",
                        t.type === 'contribution' ? "text-emerald-600" : "text-primary"
                      )}>
                        {t.type === 'contribution' ? '+' : '-'}{t.amount.toLocaleString()} <span className="text-[10px] font-sans">ر.ع</span>
                      </div>
                      {t.type === 'loan' && (
                        <button 
                          onClick={() => loadRepayments(t.id)}
                          className="text-[9px] font-bold text-primary flex items-center gap-1 mt-1 mr-auto"
                        >
                          خطة السداد {expandedLoan === t.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Repayment Plan Detail */}
                  <AnimatePresence>
                    {expandedLoan === t.id && repayments[t.id] && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-bold text-muted-foreground">جدولة الأقساط ({(t as any).repaymentMonths || 12} شهر)</span>
                            <Calendar className="w-3 h-3 text-muted-foreground" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {repayments[t.id].slice(0, 4).map((step) => (
                              <div key={step.id} className="bg-muted/30 p-2 rounded-xl border border-border/30 flex justify-between items-center">
                                <div>
                                  <div className="text-[8px] text-muted-foreground font-bold uppercase">القسط {step.installmentNumber}</div>
                                  <div className="text-xs font-bold font-mono">{Number(step.amount).toFixed(3)} ر.ع</div>
                                </div>
                                <span className={cn(
                                  "text-[7px] font-bold px-1.5 py-0.5 rounded-full",
                                  step.status === 'paid' ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                                )}>
                                  {step.status === 'paid' ? 'مدفوع' : 'مجدول'}
                                </span>
                              </div>
                            ))}
                          </div>
                          {repayments[t.id].length > 4 && (
                            <p className="text-[8px] text-muted-foreground text-center italic">
                              تم عرض أول 4 أقساط • الإجمالي {repayments[t.id].length} قسطاً
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
