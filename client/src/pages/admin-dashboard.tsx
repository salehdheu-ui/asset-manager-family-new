import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getAdminUsers, getMembers, updateUserRole, linkUserToMember, deleteUser, createUser, updateUserPassword, updateUser, getFundAdjustments, createFundAdjustment, resetSystem, lockYearAllocation, resetYearAllocation, getAuditLogs, createLoan, createExpense, getDashboardSummary } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Shield, Users, Trash2, UserCheck, Link, Crown, User as UserIcon, Plus, Key, Eye, EyeOff, Wallet, ArrowDownCircle, RotateCcw, AlertTriangle, Lock, History, HandCoins, ReceiptText } from "lucide-react";
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

  const [depositAmount, setDepositAmount] = useState("");
  const [depositDescription, setDepositDescription] = useState("");
  const [depositSourceType, setDepositSourceType] = useState<"known" | "unknown">("unknown");
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [adminLoanMemberId, setAdminLoanMemberId] = useState("");
  const [adminLoanType, setAdminLoanType] = useState<"urgent" | "standard" | "emergency">("standard");
  const [adminLoanAmount, setAdminLoanAmount] = useState("");
  const [adminLoanDescription, setAdminLoanDescription] = useState("");
  const [adminLoanRepaymentType, setAdminLoanRepaymentType] = useState<"scheduled" | "open">("scheduled");
  const [adminLoanMonths, setAdminLoanMonths] = useState("12");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<"general" | "emergency" | "charity" | "zakat">("general");
  const [expenseTitle, setExpenseTitle] = useState("مصروف إداري");
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

  const { data: auditLogs = [], isLoading: auditLogsLoading, error: auditLogsError } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: getAuditLogs,
    enabled: !!user,
  });

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
    enabled: !!user,
  });

  const createAdjustmentMutation = useMutation({
    mutationFn: createFundAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fund-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: "تم تسجيل الإيداع في السجل العام بنجاح" });
      setDepositAmount("");
      setDepositDescription("");
      setDepositSourceType("unknown");
      setDepositDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "فشلت العملية", description: error?.message || "تعذر تنفيذ العملية", variant: "destructive" });
    },
  });

  const createAdminLoanMutation = useMutation({
    mutationFn: createLoan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: "تمت إضافة السلفة واعتمادها بنجاح" });
      setAdminLoanMemberId("");
      setAdminLoanType("standard");
      setAdminLoanAmount("");
      setAdminLoanDescription("");
      setAdminLoanRepaymentType("scheduled");
      setAdminLoanMonths("12");
      setLoanDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "تعذر إضافة السلفة", description: error?.message || "تعذر تنفيذ العملية", variant: "destructive" });
    },
  });

  const createAdminExpenseMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: "تم تسجيل المصروف بنجاح" });
      setExpenseAmount("");
      setExpenseDescription("");
      setExpenseCategory("general");
      setExpenseTitle("مصروف إداري");
      setExpenseDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "تعذر تسجيل المصروف", description: error?.message || "تعذر تنفيذ العملية", variant: "destructive" });
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
    onError: (error: any) => {
      toast({ title: "فشل في تصفير النظام", description: error?.message || "تعذر تصفير النظام", variant: "destructive" });
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

  const getAuditActionLabel = (action: string) => {
    if (action === "contribution_approved") return "اعتماد مساهمة";
    if (action === "contribution_deleted") return "حذف مساهمة";
    if (action === "settings_updated") return "تعديل الإعدادات";
    return "عملية إدارية";
  };

  const flexibleLayer = summary?.layers?.find((layer: any) => layer.id === "flexible");
  const emergencyLayer = summary?.layers?.find((layer: any) => layer.id === "emergency");
  const availableFlexible = Number((flexibleLayer as any)?.available ?? flexibleLayer?.amount ?? 0);
  const availableEmergency = Number((emergencyLayer as any)?.available ?? emergencyLayer?.amount ?? 0);
  const depositRecords = adjustments.filter((adjustment) => adjustment.type === "deposit");
  const loanTypeOptions = {
    urgent: "سلفة عاجلة",
    standard: "سلفة غير عاجلة",
    emergency: "سلفة طارئة",
  };
  const selectedLoanTitle = loanTypeOptions[adminLoanType];
  const selectedLoanAvailable = adminLoanType === "emergency" ? availableEmergency : availableFlexible;

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

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/80 p-4">
            <div className="mb-2 flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-bold">تنبيه أمني</span>
            </div>
            <p className="text-sm font-bold text-amber-900">تأكد من تغيير كلمة مرور المدير الافتراضية قبل اعتماد النظام.</p>
            <p className="mt-1 text-xs leading-6 text-amber-700">يوصى بإعداد كلمة مرور قوية ومراجعة الحسابات الإدارية قبل التشغيل الفعلي.</p>
          </div>
          <div className="rounded-[1.5rem] border border-blue-200 bg-blue-50/80 p-4">
            <div className="mb-2 flex items-center gap-2 text-blue-700">
              <Lock className="h-4 w-4" />
              <span className="text-xs font-bold">إجراءات حساسة</span>
            </div>
            <p className="text-sm font-bold text-blue-900">الحذف، التصفير، وتعديل الصلاحيات تؤثر مباشرة على النظام.</p>
            <p className="mt-1 text-xs leading-6 text-blue-700">نفّذ العمليات الحساسة بعد مراجعة مزدوجة وتأكيد واضح قبل الإرسال.</p>
          </div>
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

        <div className="bg-amber-600 text-white p-6 rounded-[2rem] relative overflow-hidden shadow-lg shadow-amber-600/20">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <Wallet className="w-8 h-8" />
              <h2 className="text-xl font-bold">إجراءات الصندوق للأدمن</h2>
            </div>
            <p className="text-sm opacity-80">سلفة مباشرة، مصروف، أو إيداع عام بدون حذف السجلات السابقة</p>
          </div>
          <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <button
            onClick={() => setLoanDialogOpen(true)}
            className="w-full bg-primary text-primary-foreground py-3 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-primary/20"
            data-testid="button-admin-add-loan"
          >
            <HandCoins className="w-5 h-5" />
            إضافة سلفة مباشرة
          </button>
          <button
            onClick={() => setExpenseDialogOpen(true)}
            className="w-full bg-red-600 text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-red-600/20"
            data-testid="button-admin-add-expense"
          >
            <ReceiptText className="w-5 h-5" />
            إضافة مصروف
          </button>
          <button
            onClick={() => setDepositDialogOpen(true)}
            className="w-full bg-green-600 text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-green-600/20"
            data-testid="button-admin-add-deposit"
          >
            <ArrowDownCircle className="w-5 h-5" />
            إضافة مبلغ وارد
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border/60 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-muted-foreground">المتاح للسلف</p>
            <p className="text-lg font-mono font-bold text-primary">{availableFlexible.toFixed(3)} ر.ع</p>
          </div>
          <div className="bg-card border border-border/60 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-muted-foreground">المتاح للطوارئ</p>
            <p className="text-lg font-mono font-bold text-amber-600">{availableEmergency.toFixed(3)} ر.ع</p>
          </div>
        </div>

        <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
          <DialogContent className="sm:max-w-md font-sans" dir="rtl">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">إضافة سلفة مباشرة</DialogTitle>
              <DialogDescription>سيتم تسجيل السلفة في قائمة السلف واعتمادها مباشرة بعد التحقق من الرصيد.</DialogDescription>
            </DialogHeader>
            <form
              className="py-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (adminLoanMemberId && adminLoanAmount && Number(adminLoanAmount) > 0) {
                  createAdminLoanMutation.mutate({
                    memberId: adminLoanMemberId,
                    type: adminLoanType,
                    title: selectedLoanTitle,
                    amount: adminLoanAmount,
                    description: adminLoanDescription || undefined,
                    repaymentType: adminLoanRepaymentType,
                    repaymentMonths: adminLoanRepaymentType === "scheduled" ? Number(adminLoanMonths) : null,
                    status: "approved",
                  });
                }
              }}
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">العضو *</label>
                <select
                  value={adminLoanMemberId}
                  onChange={(e) => setAdminLoanMemberId(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                  data-testid="select-admin-loan-member"
                >
                  <option value="">اختر العضو...</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">نوع السلفة *</label>
                <select
                  value={adminLoanType}
                  onChange={(e) => setAdminLoanType(e.target.value as "urgent" | "standard" | "emergency")}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  data-testid="select-admin-loan-type"
                >
                  <option value="urgent">سلفة عاجلة</option>
                  <option value="standard">سلفة غير عاجلة</option>
                  <option value="emergency">سلفة طارئة</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">المبلغ (ر.ع) *</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={adminLoanAmount}
                  onChange={(e) => setAdminLoanAmount(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="0.000"
                  required
                  data-testid="input-admin-loan-amount"
                />
                <p className="text-[11px] text-muted-foreground">الرصيد المتاح لهذا النوع: {selectedLoanAvailable.toFixed(3)} ر.ع</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">طريقة السداد</label>
                <select
                  value={adminLoanRepaymentType}
                  onChange={(e) => setAdminLoanRepaymentType(e.target.value as "scheduled" | "open")}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  data-testid="select-admin-loan-repayment-type"
                >
                  <option value="scheduled">بخطة سداد</option>
                  <option value="open">مفتوحة بدون خطة</option>
                </select>
              </div>
              {adminLoanRepaymentType === "scheduled" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">مدة السداد بالأشهر</label>
                  <select
                    value={adminLoanMonths}
                    onChange={(e) => setAdminLoanMonths(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    data-testid="select-admin-loan-months"
                  >
                    <option value="6">6 أشهر</option>
                    <option value="12">12 شهر</option>
                    <option value="18">18 شهر</option>
                    <option value="24">24 شهر</option>
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">الملاحظة (اختياري)</label>
                <input
                  type="text"
                  value={adminLoanDescription}
                  onChange={(e) => setAdminLoanDescription(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="سبب السلفة أو أي توضيح إضافي"
                  data-testid="input-admin-loan-description"
                />
              </div>
              <button
                type="submit"
                disabled={createAdminLoanMutation.isPending || !adminLoanAmount || Number(adminLoanAmount) <= 0 || !adminLoanMemberId}
                className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 text-white bg-primary"
                data-testid="button-submit-admin-loan"
              >
                {createAdminLoanMutation.isPending ? (
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    <HandCoins className="w-5 h-5" />
                    اعتماد السلفة وإضافتها
                  </>
                )}
              </button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
          <DialogContent className="sm:max-w-md font-sans" dir="rtl">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">إضافة مصروف</DialogTitle>
              <DialogDescription>سيتم تسجيل المصروف مباشرة ضمن قائمة المصروفات مع بقاء فحص الرصيد المتاح.</DialogDescription>
            </DialogHeader>
            <form
              className="py-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (expenseAmount && Number(expenseAmount) > 0) {
                  createAdminExpenseMutation.mutate({
                    title: expenseTitle,
                    amount: expenseAmount,
                    category: expenseCategory,
                    description: expenseDescription || undefined,
                  });
                }
              }}
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">نوع المصروف *</label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value as "general" | "emergency" | "charity" | "zakat")}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  data-testid="select-admin-expense-category"
                >
                  <option value="general">مصروفات عامة</option>
                  <option value="emergency">طوارئ</option>
                  <option value="charity">أعمال خيرية</option>
                  <option value="zakat">زكاة</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">عنوان العملية *</label>
                <input
                  type="text"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="مثال: مصروف تشغيل أو دعم طارئ"
                  required
                  data-testid="input-admin-expense-title"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">المبلغ (ر.ع) *</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="0.000"
                  required
                  data-testid="input-admin-expense-amount"
                />
                <p className="text-[11px] text-muted-foreground">الرصيد المتاح: {(expenseCategory === "emergency" ? availableEmergency : availableFlexible).toFixed(3)} ر.ع</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">الملاحظة (اختياري)</label>
                <input
                  type="text"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="سبب المصروف أو أي توضيح إضافي"
                  data-testid="input-admin-expense-description"
                />
              </div>
              <button
                type="submit"
                disabled={createAdminExpenseMutation.isPending || !expenseTitle || !expenseAmount || Number(expenseAmount) <= 0}
                className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 text-white bg-red-600"
                data-testid="button-submit-admin-expense"
              >
                {createAdminExpenseMutation.isPending ? (
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    <ReceiptText className="w-5 h-5" />
                    تسجيل المصروف
                  </>
                )}
              </button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
          <DialogContent className="sm:max-w-md font-sans" dir="rtl">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">إضافة مبلغ وارد</DialogTitle>
              <DialogDescription>سيتم تسجيل المبلغ في السجل العام كإيداع دون المساس بأي بيانات سابقة.</DialogDescription>
            </DialogHeader>
            <form
              className="py-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (depositAmount && Number(depositAmount) > 0) {
                  const normalizedDescription = depositDescription.trim();
                  const defaultDescription = depositSourceType === "unknown" ? "إيداع من مصدر غير معروف" : "إيداع عام";
                  createAdjustmentMutation.mutate({
                    type: "deposit",
                    amount: depositAmount,
                    description: normalizedDescription ? `${depositSourceType === "unknown" ? "إيداع من مصدر غير معروف" : "إيداع عام"} - ${normalizedDescription}` : defaultDescription,
                  });
                }
              }}
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">نوع المصدر *</label>
                <select
                  value={depositSourceType}
                  onChange={(e) => setDepositSourceType(e.target.value as "known" | "unknown")}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  data-testid="select-admin-deposit-source-type"
                >
                  <option value="unknown">غير معروف</option>
                  <option value="known">معلوم</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">المبلغ (ر.ع) *</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="0.000"
                  required
                  data-testid="input-admin-deposit-amount"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">ملاحظة (اختياري)</label>
                <input
                  type="text"
                  value={depositDescription}
                  onChange={(e) => setDepositDescription(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="مثال: تسوية يدوية أو مبلغ نقدي"
                  data-testid="input-admin-deposit-description"
                />
              </div>
              <button
                type="submit"
                disabled={createAdjustmentMutation.isPending || !depositAmount || Number(depositAmount) <= 0}
                className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 text-white bg-green-600"
                data-testid="button-submit-admin-deposit"
              >
                {createAdjustmentMutation.isPending ? (
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    <ArrowDownCircle className="w-5 h-5" />
                    تسجيل الإيداع
                  </>
                )}
              </button>
            </form>
          </DialogContent>
        </Dialog>

        {depositRecords.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg text-amber-700 font-heading px-1">السجل العام للإيداعات</h3>
            {depositRecords.map((adj, idx) => (
              <motion.div
                key={adj.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-green-100 text-green-600">
                  <ArrowDownCircle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      إيداع
                    </span>
                    <span className="font-bold text-sm">{Number(adj.amount).toFixed(3)} ر.ع</span>
                  </div>
                  {adj.description && (
                    <p className="text-xs text-muted-foreground mt-1">{adj.description}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {adj.createdAt ? new Date(adj.createdAt).toLocaleDateString("ar-OM", { year: "numeric", month: "short", day: "numeric" }) : ""}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-lg text-primary font-heading flex items-center gap-2">
              <History className="w-5 h-5" /> سجل التدقيق
            </h3>
            <span className="text-[11px] text-muted-foreground">آخر العمليات الحساسة في النظام</span>
          </div>

          {auditLogsLoading ? (
            <div className="rounded-3xl border border-border/60 bg-card p-6 text-center">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm font-medium text-muted-foreground">جاري تحميل سجل التدقيق...</p>
            </div>
          ) : auditLogsError ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center">
              <History className="mx-auto mb-3 h-10 w-10 text-red-500" />
              <p className="font-bold text-red-700">تعذر تحميل سجل التدقيق</p>
              <p className="mt-1 text-sm text-red-600">حاول تحديث الصفحة أو إعادة المحاولة لاحقًا.</p>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-muted/20 p-6 text-center">
              <p className="text-sm font-medium text-muted-foreground">لا توجد عمليات مسجلة بعد في سجل التدقيق.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {auditLogs.slice(0, 10).map((log, idx) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="rounded-[1.5rem] border border-border/60 bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">
                          {getAuditActionLabel(log.action)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString("ar-OM") : ""}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-bold text-foreground">{log.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        بواسطة: {log.actorName || "مستخدم إداري"}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

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
                إعادة ضبط التخصيص {currentYear}
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
