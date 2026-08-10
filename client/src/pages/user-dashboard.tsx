import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getUserProfile, updateUserProfile, getContributions, getLoans } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { User, Settings, CreditCard, HandCoins, History, Save, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import NotificationSettings from "@/components/NotificationSettings";

export default function UserDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["user-profile"],
    queryFn: getUserProfile,
    enabled: !!user,
    retry: false,
  });

  const { data: contributions = [] } = useQuery({
    queryKey: ["contributions"],
    queryFn: () => getContributions(),
    enabled: !!profile?.memberId,
  });

  const { data: loans = [] } = useQuery({
    queryKey: ["loans"],
    queryFn: getLoans,
    enabled: !!profile?.memberId,
  });

  const updateProfileMutation = useMutation({
    mutationFn: updateUserProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "تم تحديث الملف الشخصي بنجاح" });
    },
    onError: () => {
      toast({ title: "فشل تحديث الملف الشخصي", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/");
    }
  }, [authLoading, user, setLocation]);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || "");
      setLastName(profile.lastName || "");
    }
  }, [profile]);

  if (authLoading || profileLoading) {
    return (
      <MobileLayout title="حسابي">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </MobileLayout>
    );
  }

  if (!profile) {
    return (
      <MobileLayout title="حسابي">
        <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border">
          <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground font-medium">لم يتم العثور على الملف الشخصي</p>
        </div>
      </MobileLayout>
    );
  }

  // Get member-specific data
  const memberContributions = profile.memberId 
    ? contributions.filter(c => c.memberId === profile.memberId && c.status === 'approved')
    : [];
  const memberLoans = profile.memberId 
    ? loans.filter(l => l.memberId === profile.memberId && l.status === 'approved')
    : [];

  const totalContributed = memberContributions.reduce((sum, c) => sum + Number(c.amount), 0);
  // المعروض هو المتبقي فعلياً — من سدّد سلفه بالكامل يرى صفراً
  const totalBorrowed = memberLoans.reduce((sum, l) => sum + ((l as any).remaining ?? Number(l.amount)), 0);

  return (
    <MobileLayout title="حسابي">
      <div className="space-y-6 pt-2 pb-12">
        
        {/* Profile Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 py-8 bg-card border border-border/70 rounded-xl shadow-sm relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          
          {profile.profileImageUrl ? (
            <img 
              src={profile.profileImageUrl} 
              alt={profile.firstName || "User"} 
              className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-primary/22 shadow-lg"
            />
          ) : (
            <div className="w-24 h-24 rounded-full mx-auto bg-primary/14 flex items-center justify-center text-3xl font-bold text-primary border-4 border-primary/5">
              {(profile.firstName?.[0] || profile.email?.[0] || "U").toUpperCase()}
            </div>
          )}
          
          <div>
            <h2 className="text-2xl font-bold">{profile.firstName} {profile.lastName}</h2>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className={cn(
                "text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border",
                profile.role === 'admin' ? "bg-primary/14 border-primary/30 text-primary" : "bg-muted border-border text-muted-foreground"
              )}>
                {profile.role === 'admin' ? 'مشرف' : 'مستخدم'}
              </span>
              {profile.member && (
                <span className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-fund-in-bright/20 border border-fund-in-bright/40 text-fund-in">
                  عضو: {profile.member.name}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        {profile.memberId && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-fund-in-bright/20 border border-fund-in-bright/40 rounded-xl p-5 flex flex-col gap-1 relative overflow-hidden">
              <div className="absolute -right-2 -bottom-2 opacity-5">
                <CreditCard className="w-16 h-16" />
              </div>
              <span className="text-xs text-fund-in font-bold uppercase tracking-wider flex items-center gap-1">
                <CreditCard className="w-3 h-3" /> المساهمات
              </span>
              <span className="text-2xl font-bold font-mono text-fund-in">
                {totalContributed.toLocaleString()} <span className="text-xs">ر.ع</span>
              </span>
            </div>
            <div className="bg-fund-loan-bright/20 border border-fund-loan-bright/40 rounded-xl p-5 flex flex-col gap-1 relative overflow-hidden">
              <div className="absolute -right-2 -bottom-2 opacity-5">
                <HandCoins className="w-16 h-16" />
              </div>
              <span className="text-xs text-fund-loan font-bold uppercase tracking-wider flex items-center gap-1">
                <HandCoins className="w-3 h-3" /> المتبقي من السلف
              </span>
              <span className="text-2xl font-bold font-mono text-fund-loan">
                {totalBorrowed.toLocaleString()} <span className="text-xs">ر.ع</span>
              </span>
              {totalBorrowed === 0 && memberLoans.length > 0 && (
                <span className="text-xs font-bold text-fund-in">الذمة صفر — كل السلف مسددة ✓</span>
              )}
            </div>
          </div>
        )}

        {!profile.memberId && (
          <div className="bg-fund-out-bright/20 border border-fund-out-bright/40 rounded-lg p-4 text-center">
            <p className="text-fund-out text-sm font-medium">حسابك غير مرتبط بعضو في الصندوق</p>
            <p className="text-fund-out text-xs mt-1">تواصل مع المشرف لربط حسابك</p>
          </div>
        )}

        {/* Edit Profile */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-lg text-primary font-heading flex items-center gap-2">
              <Settings className="w-5 h-5" /> إعدادات الحساب
            </h3>
          </div>

          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-muted-foreground">الاسم الأول</label>
              <input 
                type="text" 
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full p-3 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                placeholder="أدخل اسمك الأول"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-muted-foreground">الاسم الأخير</label>
              <input 
                type="text" 
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full p-3 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                placeholder="أدخل اسمك الأخير"
              />
            </div>
            <button
              onClick={() => updateProfileMutation.mutate({ firstName, lastName })}
              disabled={updateProfileMutation.isPending}
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              حفظ التغييرات
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        {profile.memberId && memberContributions.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-bold text-lg text-primary font-heading flex items-center gap-2">
                <History className="w-5 h-5" /> آخر المساهمات
              </h3>
            </div>
            <div className="space-y-2">
              {memberContributions.slice(0, 5).map((c) => (
                <div key={c.id} className="bg-card border border-border/80 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">مساهمة شهر {c.month}/{c.year}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString('ar-OM') : ''}
                    </p>
                  </div>
                  <span className="text-sm font-bold font-mono text-fund-in">
                    +{Number(c.amount).toLocaleString()} ر.ع
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <NotificationSettings />

        {/* Logout Button */}
        <button
          onClick={async () => {
            try {
              await logout();
            } finally {
              setLocation("/");
            }
          }}
          className="w-full bg-fund-due text-white py-4 rounded-lg font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <LogOut className="w-5 h-5" />
          تسجيل الخروج
        </button>
      </div>
    </MobileLayout>
  );
}
