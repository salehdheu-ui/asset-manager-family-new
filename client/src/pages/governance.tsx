import { useState } from "react";
import MobileLayout from "@/components/layout/MobileLayout";
import { FAMILY_MEMBERS, FamilyMember } from "@/lib/mock-data";
import { Shield, ShieldAlert, User, Check, Settings2, Info } from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";

export default function Governance() {
  const { user } = useAuth();
  const [activeRole, setActiveRole] = useState<'guardian' | 'custodian' | 'member'>(user?.role === 'admin' ? 'guardian' : 'member');
  const isGuardian = activeRole === 'guardian';

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
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
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

              {/* Critical Actions */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                <button className="bg-destructive/10 text-destructive border border-destructive/20 py-4 rounded-2xl flex flex-col items-center gap-2 hover:bg-destructive/20 transition-colors">
                  <ShieldAlert className="w-6 h-6" />
                  <span className="text-xs font-bold">وضع الطوارئ</span>
                </button>
                <Dialog>
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
                      {FAMILY_MEMBERS.filter(m => m.role !== 'guardian').map(m => (
                        <button key={m.id} className="w-full flex items-center justify-between p-4 border rounded-xl hover:bg-muted/50 transition-colors">
                          <span className="font-bold">{m.name}</span>
                          <span className="text-xs text-muted-foreground">{m.role === 'custodian' ? '(الأمين الحالي)' : ''}</span>
                        </button>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0" />
          <div className="text-xs text-blue-800 leading-relaxed">
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
