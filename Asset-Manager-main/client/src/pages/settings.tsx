import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getMembers } from "@/lib/api";
import { Home, Users, ChevronLeft, Shield, Wallet } from "lucide-react";
import { motion } from "framer-motion";

export default function FamilySettings() {
  const [familyName, setFamilyName] = useState(() => localStorage.getItem("familyName") || "عائلة السعيدي");

  const { data: members = [] } = useQuery({
    queryKey: ["members"],
    queryFn: getMembers,
  });

  useEffect(() => {
    localStorage.setItem("familyName", familyName);
  }, [familyName]);

  return (
    <MobileLayout title="إعدادات العائلة">
      <div className="space-y-6 pt-2">
        
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-primary mb-2">
            <Home className="w-5 h-5" />
            <h3 className="font-bold font-heading">اسم العائلة / الصندوق</h3>
          </div>
          <input
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            className="w-full text-lg font-bold p-3 border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none bg-background"
            placeholder="مثال: عائلة السعيدي"
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-lg font-heading text-primary">إدارة الأعضاء</h3>
            <Link 
              href="/members"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <span>عرض الكل</span>
              <ChevronLeft className="w-4 h-4" />
            </Link>
          </div>

          <Link 
            href="/members"
            className="block bg-card border border-border rounded-2xl p-4 shadow-sm hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="font-bold">أفراد العائلة</div>
                  <div className="text-sm text-muted-foreground">{members.length} عضو مسجل</div>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </div>
          </Link>

          <div className="grid grid-cols-3 gap-2">
            {members.slice(0, 6).map((member) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-muted/30 rounded-xl p-3 text-center"
              >
                <div className="w-10 h-10 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary mb-1">
                  {member.name.substring(0, 2)}
                </div>
                <div className="text-xs font-medium truncate">{member.name}</div>
                <div className="text-[9px] text-muted-foreground">
                  {member.role === 'guardian' ? 'الوصي' : member.role === 'custodian' ? 'الأمين' : 'عضو'}
                </div>
              </motion.div>
            ))}
          </div>

          {members.length > 6 && (
            <Link 
              href="/members"
              className="block text-center text-sm text-primary hover:underline py-2"
            >
              + {members.length - 6} أعضاء آخرين
            </Link>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="font-bold text-lg font-heading text-primary px-1">روابط سريعة</h3>
          <div className="grid grid-cols-2 gap-3">
            <Link 
              href="/governance"
              className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-primary/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-sm font-medium">الحوكمة</span>
            </Link>
            <Link 
              href="/ledger"
              className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-primary/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium">السجل</span>
            </Link>
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
          <p className="text-xs text-emerald-800 leading-relaxed">
            * لإضافة أو تعديل أعضاء العائلة، انتقل إلى صفحة "الأعضاء" من القائمة السفلية أو اضغط على زر "عرض الكل" أعلاه.
          </p>
        </div>
      </div>
    </MobileLayout>
  );
}
