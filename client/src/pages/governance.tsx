import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getMembers, getSettings, setEmergencyMode, assignCustodian } from "@/lib/api";
import { Shield, ShieldAlert, User, Check, Settings2, Info, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function Governance() {
  const { user } = useAuth();
  const [activeRole, setActiveRole] = useState<'guardian' | 'custodian' | 'member'>(user?.role === 'admin' ? 'guardian' : 'member');
  const isGuardian = activeRole === 'guardian';

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [custodianDialogOpen, setCustodianDialogOpen] = useState(false);
  const [emergencyConfirmOpen, setEmergencyConfirmOpen] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ["members"],
    queryFn: getMembers,
    enabled: isGuardian,
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const emergencyActive = settings?.emergencyMode ?? false;

  const emergencyMutation = useMutation({
    mutationFn: setEmergencyMode,
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setEmergencyConfirmOpen(false);
      toast({
        title: enabled ? "تم تفعيل وضع الطوارئ" : "تم إلغاء وضع الطوارئ",
        description: enabled
          ? "جُمّدت العمليات المالية للأعضاء مؤقتاً"
          : "عادت العمليات المالية للعمل بشكل طبيعي",
      });
    },
    onError: (error) => {
      toast({ title: "حدث خطأ", description: (error as Error)?.message, variant: "destructive" });
    },
  });

  const custodianMutation = useMutation({
    mutationFn: assignCustodian,
    onSuccess: (member) => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      setCustodianDialogOpen(false);
      toast({ title: "تم تعيين الأمين بنجاح", description: `أصبح ${member.name} أمين الصندوق الجديد` });
    },
    onError: (error) => {
      toast({ title: "تعذر تعيين الأمين", description: (error as Error)?.message, variant: "destructive" });
    },
  });

  const guardianPowers = [
    "تعيين أو عزل أمين الصندوق",
    "تحديد حدود الإنفاق الشهرية",
    "تفعيل وضع الطوارئ وتجميد العمليات",
    "تجاوز القواعد المؤقت في الحالات الحرجة",
    "الاطلاع على سجل النزاعات الخاص"
  ];

  return (
    <MobileLayout title="مركز الحوكمة والتحكم">
      <div className="space-y-6 pt-2">
        
        {/* Role Identity Card */}
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-primary" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-heading">{user?.firstName} {user?.lastName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-medium text-primary">وضعية: {isGuardian ? 'الوصي' : 'عضو'}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-fund-in" />
              </div>
            </div>
          </div>
        </div>

        {/* Guardian Powers Section - Only if Guardian */}
        <AnimatePresence>
          {isGuardian && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between px-1">
                <h3 className="font-bold text-lg text-primary">صلاحيات الوصي (الرقابة)</h3>
                <Settings2 className="w-4 h-4 text-muted-foreground" />
              </div>
              
              <div className="grid gap-3">
                {guardianPowers.map((power, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/10 rounded-2xl"
                  >
                    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
                      <Check className="w-3.5 h-3.5 text-primary" strokeWidth={3} />
                    </div>
                    <span className="text-sm font-medium leading-tight">{power}</span>
                  </motion.div>
                ))}
              </div>

              {/* Emergency Mode Banner */}
              {emergencyActive && (
                <div className="bg-destructive/10 border border-destructive/30 p-4 rounded-2xl flex items-center gap-3" data-testid="banner-emergency">
                  <ShieldAlert className="w-5 h-5 text-destructive shrink-0 animate-pulse" />
                  <p className="text-xs text-destructive font-bold leading-relaxed">
                    وضع الطوارئ مفعّل — طلبات السلف والمساهمات الجديدة من الأعضاء مجمّدة مؤقتاً.
                  </p>
                </div>
              )}

              {/* Critical Actions */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                <button
                  onClick={() => setEmergencyConfirmOpen(true)}
                  data-testid="button-emergency-mode"
                  className={cn(
                    "py-4 rounded-2xl flex flex-col items-center gap-2 transition-colors border",
                    emergencyActive
                      ? "bg-destructive text-destructive-foreground border-destructive shadow-lg"
                      : "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20"
                  )}
                >
                  <ShieldAlert className={cn("w-6 h-6", emergencyActive && "animate-pulse")} />
                  <span className="text-xs font-bold">{emergencyActive ? "إلغاء وضع الطوارئ" : "وضع الطوارئ"}</span>
                </button>
                <Dialog open={custodianDialogOpen} onOpenChange={setCustodianDialogOpen}>
                  <DialogTrigger asChild>
                    <button className="bg-primary text-primary-foreground py-4 rounded-2xl flex flex-col items-center gap-2 hover:bg-primary/90 transition-colors shadow-lg">
                      <User className="w-6 h-6" />
                      <span className="text-xs font-bold">تغيير الأمين</span>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md" dir="rtl">
                    <DialogHeader>
                      <DialogTitle className="font-heading">تعيين أمين صندوق جديد</DialogTitle>
                      <DialogDescription>
                        يجب اختيار عضو يتمتع بالثقة والقدرة على إدارة العمليات اليومية.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                      {members.filter(m => m.role !== 'guardian').map(m => (
                        <button
                          key={m.id}
                          disabled={custodianMutation.isPending || m.role === 'custodian'}
                          onClick={() => custodianMutation.mutate(m.id)}
                          className="w-full flex items-center justify-between p-4 border rounded-xl hover:bg-muted/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <span className="font-bold">{m.name}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-2">
                            {custodianMutation.isPending && custodianMutation.variables === m.id && (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            )}
                            {m.role === 'custodian' ? '(الأمين الحالي)' : 'تعيين'}
                          </span>
                        </button>
                      ))}
                      {members.filter(m => m.role !== 'guardian').length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">لا يوجد أعضاء متاحون للتعيين</p>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Emergency Mode Confirmation */}
              <AlertDialog open={emergencyConfirmOpen} onOpenChange={setEmergencyConfirmOpen}>
                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-heading">
                      {emergencyActive ? "إلغاء وضع الطوارئ؟" : "تفعيل وضع الطوارئ؟"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {emergencyActive
                        ? "ستعود العمليات المالية (طلبات السلف والمساهمات) للعمل بشكل طبيعي لجميع الأعضاء."
                        : "سيتم تجميد طلبات السلف والمساهمات الجديدة من الأعضاء حتى إلغاء وضع الطوارئ. ستُوثق هذه العملية في سجل التدقيق."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>تراجع</AlertDialogCancel>
                    <AlertDialogAction
                      data-testid="button-confirm-emergency"
                      disabled={emergencyMutation.isPending}
                      onClick={(e) => {
                        e.preventDefault();
                        emergencyMutation.mutate(!emergencyActive);
                      }}
                      className={cn(!emergencyActive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                    >
                      {emergencyMutation.isPending ? "جارٍ التنفيذ..." : emergencyActive ? "إلغاء التفعيل" : "تفعيل الآن"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info Box */}
        <div className="bg-fund-loan/8 border border-fund-loan/25 p-4 rounded-2xl flex items-start gap-3">
          <Info className="w-5 h-5 text-fund-loan shrink-0" />
          <div className="text-xs text-fund-loan leading-relaxed">
            يتم توثيق كل عملية استخدام لصلاحيات الوصي في سجل الثقة مع "بصمة رقمية" فريدة. لا يمكن حذف أو تعديل أي إجراء يتم اتخاذه.
          </div>
        </div>

        {/* Access Levels for others */}
        {!isGuardian && (
          <div className="bg-card border border-border rounded-3xl p-6 text-center space-y-4">
             <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground">
               <Shield className="w-8 h-8 opacity-40" />
             </div>
             <div>
               <h3 className="font-bold">حساب عضو عائلة</h3>
               <p className="text-sm text-muted-foreground mt-1">
                 لديك صلاحية الاطلاع، التصويت، وطلب السلف. صلاحيات الإدارة محصورة في الوصي.
               </p>
             </div>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
