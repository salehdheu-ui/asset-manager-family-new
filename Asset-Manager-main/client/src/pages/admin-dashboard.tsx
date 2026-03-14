import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getAdminUsers, getMembers, updateUserRole, linkUserToMember, deleteUser, createUser, updateUserPassword, updateUser, getFundAdjustments, createFundAdjustment, deleteFundAdjustment, resetSystem, lockYearAllocation, resetYearAllocation } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Shield, Users, Trash2, UserCheck, Link, Crown, User as UserIcon, Plus, Key, Edit2, Eye, EyeOff, Wallet, ArrowUpCircle, ArrowDownCircle, RotateCcw, AlertTriangle, Lock } from "lucide-react";
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
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  
  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [newUserPassword, setNewUserPassword] = useState("");
  const [showChangePassword, setShowChangePassword] = useState(false);

  const [adjustType, setAdjustType] = useState<"deposit" | "withdrawal">("deposit");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [adjustMemberId, setAdjustMemberId] = useState("");
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");

  const { data: allUsers = [], isLoading: usersLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: getAdminUsers,
    enabled: !!user,
    retry: false,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members"],
    queryFn: getMembers,
  });

  const { data: adjustments = [] } = useQuery({
    queryKey: ["fund-adjustments"],
    queryFn: getFundAdjustments,
    enabled: !!user,
  });

  const createAdjustmentMutation = useMutation({
    mutationFn: createFundAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fund-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: adjustType === "deposit" ? "تم إيداع المبلغ بنجاح" : "تم سحب المبلغ بنجاح" });
      setAdjustAmount("");
      setAdjustDescription("");
      setAdjustMemberId("");
      setAdjustDialogOpen(false);
    },
    onError: () => {
      toast({ title: "فشلت العملية", variant: "destructive" });
    },
  });

  const deleteAdjustmentMutation = useMutation({
    mutationFn: deleteFundAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fund-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: "تم حذف العملية" });
    },
    onError: () => {
      toast({ title: "فشل حذف العملية", variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "تم إنشاء المستخدم بنجاح" });
      setNewUsername("");
      setNewPassword("");
      setNewFirstName("");
      setNewLastName("");
      setAddDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: err.message || "فشل إنشاء المستخدم", variant: "destructive" });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => updateUserPassword(id, password),
    onSuccess: () => {
      toast({ title: "تم تحديث كلمة المرور بنجاح" });
      setPasswordUserId(null);
      setNewUserPassword("");
    },
    onError: () => {
      toast({ title: "فشل تحديث كلمة المرور", variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => updateUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "تم تحديث الدور بنجاح" });
    },
    onError: () => {
      toast({ title: "فشل تحديث الدور", variant: "destructive" });
    },
  });

  const linkMemberMutation = useMutation({
    mutationFn: ({ id, memberId }: { id: string; memberId: string }) => linkUserToMember(id, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "تم ربط العضو بنجاح" });
    },
    onError: () => {
      toast({ title: "فشل ربط العضو", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "تم حذف المستخدم" });
    },
    onError: () => {
      toast({ title: "فشل حذف المستخدم", variant: "destructive" });
    },
  });

  const currentYear = new Date().getFullYear();

  const lockAllocationMutation = useMutation({
    mutationFn: () => lockYearAllocation(currentYear),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: `تم قفل تخصيص رأس المال لسنة ${currentYear} بنجاح` });
    },
    onError: () => {
      toast({ title: "فشل في قفل التخصيص", variant: "destructive" });
    },
  });

  const resetAllocationMutation = useMutation({
    mutationFn: () => resetYearAllocation(currentYear),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: `تم إعادة ضبط تخصيص رأس المال لسنة ${currentYear} بنجاح` });
    },
    onError: () => {
      toast({ title: "فشل في إعادة ضبط التخصيص", variant: "destructive" });
    },
  });

  const resetSystemMutation = useMutation({
    mutationFn: resetSystem,
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: "تم تصفير النظام بنجاح - النظام جاهز للبدء من جديد" });
      setResetDialogOpen(false);
      setResetConfirmText("");
    },
    onError: () => {
      toast({ title: "فشل في تصفير النظام", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/");
    }
  }, [authLoading, user, setLocation]);

  if (authLoading || usersLoading) {
    return (
      <MobileLayout title="لوحة الإدارة">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </MobileLayout>
    );
  }

  if (error) {
    return (
      <MobileLayout title="لوحة الإدارة">
        <div className="text-center py-12 bg-red-50 rounded-3xl border border-red-200">
          <Shield className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <p className="text-red-700 font-bold">غير مصرح لك بالوصول</p>
          <p className="text-red-600 text-sm mt-2">يجب أن تكون مشرفاً للوصول لهذه الصفحة</p>
        </div>
      </MobileLayout>
    );
  }

  const getMemberName = (memberId: string | null) => {
    if (!memberId) return "غير مرتبط";
    return members.find(m => m.id === memberId)?.name || "غير معروف";
  };

  return (
    <MobileLayout title="لوحة الإدارة">
      <div className="space-y-6 pt-2 pb-12">
        
        {/* Header */}
        <div className="bg-primary text-primary-foreground p-6 rounded-[2rem] relative overflow-hidden shadow-lg shadow-primary/20">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-8 h-8" />
              <h2 className="text-xl font-bold">إدارة المستخدمين</h2>
            </div>
            <p className="text-sm opacity-80">عرض وتعديل وحذف المستخدمين المسجلين</p>
            <p className="text-xs opacity-60 mt-2">إجمالي المستخدمين: {allUsers.length}</p>
          </div>
          <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        </div>

        {/* Add User Button */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <button 
              className="w-full bg-green-600 text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-green-600/20"
              data-testid="button-add-user"
            >
              <Plus className="w-5 h-5" />
              إضافة مستخدم جديد
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md font-sans" dir="rtl">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">إضافة مستخدم جديد</DialogTitle>
              <DialogDescription>أدخل بيانات المستخدم الجديد لإنشاء حسابه</DialogDescription>
            </DialogHeader>
            <form 
              className="py-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (newUsername && newPassword) {
                  createUserMutation.mutate({
                    username: newUsername,
                    password: newPassword,
                    firstName: newFirstName || undefined,
                    lastName: newLastName || undefined,
                  });
                }
              }}
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">اسم المستخدم *</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="أدخل اسم المستخدم"
                  required
                  data-testid="input-new-username"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">كلمة المرور *</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="أدخل كلمة المرور"
                    required
                    data-testid="input-new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">الاسم الأول</label>
                  <input
                    type="text"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="الاسم"
                    data-testid="input-new-firstname"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">اسم العائلة</label>
                  <input
                    type="text"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="العائلة"
                    data-testid="input-new-lastname"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={createUserMutation.isPending || !newUsername || !newPassword}
                className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                data-testid="button-submit-new-user"
              >
                {createUserMutation.isPending ? (
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    إنشاء المستخدم
                  </>
                )}
              </button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Fund Adjustments Section */}
        <div className="bg-amber-600 text-white p-6 rounded-[2rem] relative overflow-hidden shadow-lg shadow-amber-600/20">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <Wallet className="w-8 h-8" />
              <h2 className="text-xl font-bold">التحكم المباشر بالصندوق</h2>
            </div>
            <p className="text-sm opacity-80">إيداع أو سحب أي مبلغ بصلاحية مطلقة</p>
          </div>
          <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { setAdjustType("deposit"); setAdjustDialogOpen(true); }}
            className="flex-1 bg-green-600 text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-green-600/20"
            data-testid="button-fund-deposit"
          >
            <ArrowDownCircle className="w-5 h-5" />
            إيداع مبلغ
          </button>
          <button
            onClick={() => { setAdjustType("withdrawal"); setAdjustDialogOpen(true); }}
            className="flex-1 bg-red-600 text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-red-600/20"
            data-testid="button-fund-withdrawal"
          >
            <ArrowUpCircle className="w-5 h-5" />
            سحب مبلغ
          </button>
        </div>

        <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
          <DialogContent className="sm:max-w-md font-sans" dir="rtl">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">
                {adjustType === "deposit" ? "إيداع مبلغ للصندوق" : "سحب مبلغ من الصندوق"}
              </DialogTitle>
              <DialogDescription>
                {adjustType === "deposit" ? "أدخل المبلغ المراد إضافته للصندوق" : "أدخل المبلغ المراد سحبه من الصندوق"}
              </DialogDescription>
            </DialogHeader>
            <form
              className="py-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (adjustAmount && Number(adjustAmount) > 0) {
                  createAdjustmentMutation.mutate({
                    type: adjustType,
                    amount: adjustAmount,
                    description: adjustDescription || undefined,
                    memberId: adjustMemberId || undefined,
                  });
                }
              }}
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">العضو *</label>
                <select
                  value={adjustMemberId}
                  onChange={(e) => setAdjustMemberId(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                  data-testid="select-adjust-member"
                >
                  <option value="">اختر العضو...</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">المبلغ (ر.ع) *</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="0.000"
                  required
                  data-testid="input-adjust-amount"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">الوصف (اختياري)</label>
                <input
                  type="text"
                  value={adjustDescription}
                  onChange={(e) => setAdjustDescription(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="سبب العملية..."
                  data-testid="input-adjust-description"
                />
              </div>
              <button
                type="submit"
                disabled={createAdjustmentMutation.isPending || !adjustAmount || Number(adjustAmount) <= 0 || !adjustMemberId}
                className={cn(
                  "w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 text-white",
                  adjustType === "deposit" ? "bg-green-600" : "bg-red-600"
                )}
                data-testid="button-submit-adjustment"
              >
                {createAdjustmentMutation.isPending ? (
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    {adjustType === "deposit" ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
                    {adjustType === "deposit" ? "تأكيد الإيداع" : "تأكيد السحب"}
                  </>
                )}
              </button>
            </form>
          </DialogContent>
        </Dialog>

        {adjustments.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg text-amber-700 font-heading px-1">سجل العمليات المباشرة</h3>
            {adjustments.map((adj, idx) => (
              <motion.div
                key={adj.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3"
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  adj.type === "deposit" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                )}>
                  {adj.type === "deposit" ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded-full",
                      adj.type === "deposit" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                      {adj.type === "deposit" ? "إيداع" : "سحب"}
                    </span>
                    <span className="font-bold text-sm">{Number(adj.amount).toFixed(3)} ر.ع</span>
                  </div>
                  {adj.memberId && (
                    <p className="text-xs text-primary font-bold mt-1">
                      {adj.type === "deposit" ? "إيداع لـ" : "سحب من"}: {getMemberName(adj.memberId)}
                    </p>
                  )}
                  {adj.description && (
                    <p className="text-xs text-muted-foreground mt-1">{adj.description}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {adj.createdAt ? new Date(adj.createdAt).toLocaleDateString("ar-OM", { year: "numeric", month: "short", day: "numeric" }) : ""}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (confirm("هل أنت متأكد من حذف هذه العملية؟")) {
                      deleteAdjustmentMutation.mutate(adj.id);
                    }
                  }}
                  disabled={deleteAdjustmentMutation.isPending}
                  className="p-2 bg-red-100 text-red-600 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                  data-testid={`button-delete-adjustment-${adj.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-border/40 my-2" />

        {/* Users List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-lg text-primary font-heading">قائمة المستخدمين</h3>
            <Users className="w-5 h-5 text-primary/30" />
          </div>

          {allUsers.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-3xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground font-medium">لا يوجد مستخدمين مسجلين</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allUsers.map((u, idx) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-card border border-border/60 rounded-[1.5rem] p-4 shadow-sm space-y-4"
                >
                  <div className="flex items-center gap-4">
                    {u.profileImageUrl ? (
                      <img 
                        src={u.profileImageUrl} 
                        alt={u.firstName || "User"} 
                        className="w-12 h-12 rounded-full object-cover border-2 border-primary/10"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {(u.firstName?.[0] || (u as any).username?.[0] || "U").toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <h4 className="font-bold text-sm leading-none">
                        {u.firstName || (u as any).username} {u.lastName}
                      </h4>
                      <p className="text-[10px] text-muted-foreground mt-1">@{(u as any).username}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={cn(
                          "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border flex items-center gap-1",
                          u.role === 'admin' ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted border-border text-muted-foreground"
                        )}>
                          {u.role === 'admin' ? <Crown className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                          {u.role === 'admin' ? 'مشرف' : 'مستخدم'}
                        </span>
                        <span className="text-[8px] text-muted-foreground">
                          العضو: {getMemberName(u.memberId)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-border/40">
                    {/* Change Role */}
                    <button
                      onClick={() => updateRoleMutation.mutate({ 
                        id: u.id, 
                        role: u.role === 'admin' ? 'user' : 'admin' 
                      })}
                      disabled={updateRoleMutation.isPending}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50",
                        u.role === 'admin' ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
                      )}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      {u.role === 'admin' ? 'إزالة الإدارة' : 'ترقية لمشرف'}
                    </button>

                    {/* Link to Member */}
                    <Dialog>
                      <DialogTrigger asChild>
                        <button className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform">
                          <Link className="w-3.5 h-3.5" />
                          ربط بعضو
                        </button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md font-sans" dir="rtl">
                        <DialogHeader>
                          <DialogTitle className="font-heading text-xl">ربط المستخدم بعضو</DialogTitle>
                          <DialogDescription>اختر العضو المراد ربطه بهذا الحساب</DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                          <p className="text-sm text-muted-foreground">
                            اختر العضو لربطه مع {u.firstName} {u.lastName}
                          </p>
                          <div className="space-y-2">
                            {members.map(m => (
                              <button
                                key={m.id}
                                onClick={() => linkMemberMutation.mutate({ id: u.id, memberId: m.id })}
                                disabled={linkMemberMutation.isPending}
                                className="w-full p-3 bg-muted/30 hover:bg-muted rounded-xl text-right flex items-center gap-3 transition-colors"
                              >
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                  {m.avatar || m.name.substring(0, 2)}
                                </div>
                                <span className="font-medium">{m.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    {/* Change Password */}
                    <Dialog open={passwordUserId === u.id} onOpenChange={(open) => {
                      if (!open) {
                        setPasswordUserId(null);
                        setNewUserPassword("");
                      }
                    }}>
                      <DialogTrigger asChild>
                        <button 
                          onClick={() => setPasswordUserId(u.id)}
                          className="p-2 bg-amber-600 text-white rounded-xl flex items-center justify-center active:scale-95 transition-transform"
                          data-testid={`button-change-password-${u.id}`}
                        >
                          <Key className="w-4 h-4" />
                        </button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md font-sans" dir="rtl">
                        <DialogHeader>
                          <DialogTitle className="font-heading text-xl">تغيير كلمة المرور</DialogTitle>
                          <DialogDescription>أدخل كلمة المرور الجديدة للمستخدم</DialogDescription>
                        </DialogHeader>
                        <form 
                          className="py-4 space-y-4"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (newUserPassword) {
                              updatePasswordMutation.mutate({ id: u.id, password: newUserPassword });
                            }
                          }}
                        >
                          <p className="text-sm text-muted-foreground">
                            تغيير كلمة المرور للمستخدم: <strong>{(u as any).username}</strong>
                          </p>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">كلمة المرور الجديدة</label>
                            <div className="relative">
                              <input
                                type={showChangePassword ? "text" : "password"}
                                value={newUserPassword}
                                onChange={(e) => setNewUserPassword(e.target.value)}
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="أدخل كلمة المرور الجديدة"
                                required
                                data-testid="input-change-password"
                              />
                              <button
                                type="button"
                                onClick={() => setShowChangePassword(!showChangePassword)}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                              >
                                {showChangePassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                              </button>
                            </div>
                          </div>
                          <button
                            type="submit"
                            disabled={updatePasswordMutation.isPending || !newUserPassword}
                            className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                            data-testid="button-submit-password"
                          >
                            {updatePasswordMutation.isPending ? (
                              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                            ) : (
                              <>
                                <Key className="w-5 h-5" />
                                تحديث كلمة المرور
                              </>
                            )}
                          </button>
                        </form>
                      </DialogContent>
                    </Dialog>

                    {/* Delete User */}
                    <button
                      onClick={() => {
                        if (confirm("هل أنت متأكد من حذف هذا المستخدم؟")) {
                          deleteUserMutation.mutate(u.id);
                        }
                      }}
                      disabled={deleteUserMutation.isPending || u.id === user?.id}
                      className="p-2 bg-red-600 text-white rounded-xl flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Capital Allocation Lock Section */}
        <div className="border-t border-border/40 my-2" />

        <div className="bg-emerald-700 text-white p-6 rounded-[2rem] relative overflow-hidden shadow-lg shadow-emerald-700/20">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <Lock className="w-8 h-8" />
              <h2 className="text-xl font-bold">تخصيص رأس المال السنوي</h2>
            </div>
            <p className="text-sm opacity-80">يُحسب صافي الأصول ويُقفل التخصيص بنسب محددة في بداية كل سنة</p>
          </div>
          <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => lockAllocationMutation.mutate()}
            disabled={lockAllocationMutation.isPending}
            className="flex-1 bg-emerald-700 text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-emerald-700/20 disabled:opacity-50"
            data-testid="button-lock-allocation"
          >
            {lockAllocationMutation.isPending ? (
              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <>
                <Lock className="w-5 h-5" />
                إعادة قفل التخصيص {currentYear}
              </>
            )}
          </button>
          <button
            onClick={() => resetAllocationMutation.mutate()}
            disabled={resetAllocationMutation.isPending}
            className="flex-1 bg-amber-600 text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-amber-600/20 disabled:opacity-50"
            data-testid="button-reset-allocation"
          >
            {resetAllocationMutation.isPending ? (
              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <>
                <RotateCcw className="w-5 h-5" />
                صفّر المستخدَم {currentYear}
              </>
            )}
          </button>
        </div>

        {/* System Reset Section */}
        <div className="border-t border-border/40 my-2" />
        
        <div className="bg-red-600 text-white p-6 rounded-[2rem] relative overflow-hidden shadow-lg shadow-red-600/20">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <RotateCcw className="w-8 h-8" />
              <h2 className="text-xl font-bold">إعادة تصفير النظام</h2>
            </div>
            <p className="text-sm opacity-80">حذف جميع البيانات وإعادة النظام للوضع الابتدائي</p>
          </div>
          <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        </div>

        <Dialog open={resetDialogOpen} onOpenChange={(open) => { setResetDialogOpen(open); if (!open) setResetConfirmText(""); }}>
          <DialogTrigger asChild>
            <button
              className="w-full bg-red-600 text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-red-600/20"
              data-testid="button-system-reset"
            >
              <AlertTriangle className="w-5 h-5" />
              تصفير النظام بالكامل
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md font-sans" dir="rtl">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6" />
                تحذير: تصفير النظام
              </DialogTitle>
              <DialogDescription>
                هذا الإجراء سيحذف جميع البيانات نهائياً بما فيها: الأعضاء، المساهمات، السلف، المصروفات، والإعدادات. لن يتم حذف حسابات المستخدمين.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-sm text-red-700 font-bold mb-2">للتأكيد، اكتب "تصفير" في الحقل أدناه</p>
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  className="w-full bg-white border border-red-300 rounded-xl px-4 py-3 text-center focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder='اكتب "تصفير" هنا'
                  data-testid="input-reset-confirm"
                />
              </div>
              <button
                onClick={() => resetSystemMutation.mutate()}
                disabled={resetConfirmText !== "تصفير" || resetSystemMutation.isPending}
                className="w-full bg-red-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                data-testid="button-confirm-reset"
              >
                {resetSystemMutation.isPending ? (
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    <RotateCcw className="w-5 h-5" />
                    تأكيد تصفير النظام
                  </>
                )}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MobileLayout>
  );
}
