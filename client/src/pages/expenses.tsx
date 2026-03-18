import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getExpenses, createExpense, deleteExpense, getDashboardSummary } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Wallet, Heart, Scale, ArrowUpRight, TrendingDown, History, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";

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
  return "حدث خطأ غير معروف";
}

export default function Expenses() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState<string | null>(null);

  if (!isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses"],
    queryFn: getExpenses,
  });

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
  });

  const createMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setOpenDialog(null);
      toast({ title: "تم توثيق العملية بنجاح" });
    },
    onError: (error) => {
      toast({
        title: "تعذر تسجيل المصروف",
        description: extractErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: "تم حذف السجل" });
    },
    onError: (error) => {
      toast({
        title: "حدث خطأ",
        description: (error as any)?.message || "تعذر حذف السجل",
        variant: "destructive",
      });
    },
  });

  const flexibleLayer = summary?.layers?.find((l: any) => l.id === "flexible");
  const emergencyLayer = summary?.layers?.find((l: any) => l.id === "emergency");
  const availableFlexible = (flexibleLayer as any)?.available ?? flexibleLayer?.amount ?? 0;
  const availableEmergency = (emergencyLayer as any)?.available ?? emergencyLayer?.amount ?? 0;

  const sections = [
    {
      id: 'zakat',
      title: 'الزكاة',
      subtitle: 'الفريضة والمطهرة',
      description: 'حساب وإخراج الزكاة السنوية (2.5%) على الأصول الزكوية.',
      icon: Scale,
      color: 'bg-primary text-primary-foreground',
      details: 'الزكاة حق معلوم للسائل والمحروم. يتم حسابها يدوياً وتوثيقها في السجل.',
      category: 'zakat',
      available: availableFlexible,
    },
    {
      id: 'charity',
      title: 'أعمال خيرية',
      subtitle: 'الصدقة والبر',
      description: 'مساهمات تطوعية لدعم المجتمع والمحتاجين.',
      icon: Heart,
      color: 'bg-emerald-600 text-white',
      details: 'بحد أقصى 3% من إجمالي الصندوق سنوياً للحفاظ على الاستدامة.',
      category: 'charity',
      available: availableFlexible,
    },
    {
      id: 'spending',
      title: 'المصروفات',
      subtitle: 'إدارة النفقات',
      description: 'تتبع مصروفات الصندوق الإدارية والتشغيلية.',
      icon: Wallet,
      color: 'bg-amber-600 text-white',
      details: 'مرتبطة بأهداف العائلة السنوية المعتمدة.',
      category: 'general',
      available: availableFlexible,
    }
  ];

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'zakat': return 'زكاة';
      case 'charity': return 'صدقة';
      case 'general': return 'مصروفات';
      case 'emergency': return 'طوارئ';
      default: return category;
    }
  };

  if (isLoading) {
    return (
      <MobileLayout title="الإنفاق والمبرات">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="الإنفاق والمبرات">
      <div className="space-y-6 pt-2 pb-12">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 bg-card border border-border rounded-2xl p-4 flex justify-between items-center shadow-sm">
            <div>
              <p className="text-xs text-muted-foreground">الرصيد القابل للإنفاق (مرن)</p>
              <h3 className="text-2xl font-bold font-mono text-primary" data-testid="text-available-flexible">{availableFlexible.toLocaleString()} ر.ع</h3>
              <p className="text-[10px] text-muted-foreground mt-1">
                رصيد الطوارئ: <span className="font-mono font-bold">{availableEmergency.toLocaleString()}</span> ر.ع
              </p>
            </div>
            <TrendingDown className="text-primary/20 w-12 h-12" />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-lg text-primary px-1 font-heading">تسجيل إنفاق جديد</h3>
          {sections.map((section, idx) => (
            <Dialog key={section.id} open={openDialog === section.id} onOpenChange={(open) => setOpenDialog(open ? section.id : null)}>
              <DialogTrigger asChild>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                  data-testid={`card-expense-${section.id}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={cn("p-3 rounded-xl", section.color)}>
                      <section.icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-lg">{section.title}</h4>
                        <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <p className="text-xs font-medium text-primary/70 mb-1">{section.subtitle}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{section.description}</p>
                    </div>
                  </div>
                </motion.div>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md font-sans" dir="rtl">
                <DialogHeader>
                  <DialogTitle className="font-heading text-xl">{section.title}</DialogTitle>
                  <DialogDescription>{section.details}</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <div className="bg-muted/30 p-3 rounded-xl text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">الحد المتاح</p>
                    <p className="text-lg font-mono font-bold text-primary">{section.available.toLocaleString()} ر.ع</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">المبلغ (ر.ع)</label>
                    <input 
                      type="number" 
                      id={`expense-amount-${section.id}`}
                      className="w-full text-2xl font-mono p-3 border rounded-xl text-center focus:ring-2 focus:ring-primary/20 outline-none" 
                      placeholder="0.00"
                      data-testid={`input-expense-amount-${section.id}`}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">الغرض / الملاحظات</label>
                    <textarea 
                      id={`expense-desc-${section.id}`}
                      className="w-full text-sm p-3 border rounded-xl h-24 focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                      placeholder="اكتب التفاصيل هنا لتوثيقها في السجل..."
                      data-testid={`input-expense-desc-${section.id}`}
                    />
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const amount = (document.getElementById(`expense-amount-${section.id}`) as HTMLInputElement).value;
                    const description = (document.getElementById(`expense-desc-${section.id}`) as HTMLTextAreaElement).value;
                    if (amount) {
                      createMutation.mutate({
                        title: section.title,
                        amount,
                        category: section.category,
                        description
                      });
                    }
                  }}
                  disabled={createMutation.isPending}
                  className={cn("w-full py-3 rounded-xl font-bold transition-colors disabled:opacity-50", section.id === 'zakat' ? 'bg-primary text-primary-foreground' : 'bg-primary/90 text-white')}
                  data-testid={`button-submit-expense-${section.id}`}
                >
                  {createMutation.isPending ? (
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mx-auto" />
                  ) : (
                    "اعتماد العملية وتوثيقها"
                  )}
                </button>
              </DialogContent>
            </Dialog>
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-lg text-primary font-heading">سجل المصروفات</h3>
            <History className="w-5 h-5 text-primary/30" />
          </div>
          
          {expenses.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-3xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground font-medium">لا توجد مصروفات مسجلة</p>
            </div>
          ) : (
            <div className="space-y-3">
              {expenses.map((expense) => (
                <motion.div
                  key={expense.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm"
                  data-testid={`card-expense-record-${expense.id}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        expense.category === 'zakat' ? "bg-primary/10 text-primary" :
                        expense.category === 'charity' ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                      )}>
                        {expense.category === 'zakat' ? <Scale className="w-5 h-5" /> :
                         expense.category === 'charity' ? <Heart className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm leading-none">{expense.title}</h4>
                        <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                          {getCategoryLabel(expense.category)} • {expense.createdAt ? new Date(expense.createdAt).toLocaleDateString('ar-OM') : ''}
                        </p>
                        {expense.description && (
                          <p className="text-[10px] text-muted-foreground mt-1">{expense.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-mono font-bold text-amber-600">
                        -{Number(expense.amount).toLocaleString()} <span className="text-[10px] font-sans">ر.ع</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => deleteMutation.mutate(expense.id)}
                    disabled={deleteMutation.isPending}
                    className="w-full text-[10px] text-muted-foreground flex items-center justify-center gap-1 pt-3 mt-3 border-t border-border/40 hover:text-red-500 transition-colors disabled:opacity-50"
                    data-testid={`button-delete-expense-${expense.id}`}
                  >
                    <Trash2 className="w-3 h-3" /> حذف السجل
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-muted/30 p-4 rounded-xl text-center">
          <p className="text-xs text-muted-foreground">
            جميع العمليات تخضع لرقابة السجل الدائم وتتطلب موافقة الوصي.
          </p>
        </div>
      </div>
    </MobileLayout>
  );
}
