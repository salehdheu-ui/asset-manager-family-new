import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getMembersIncludingArchived, createMember, deleteMember, setMemberArchived, MemberHasHistory, updateMember, getContributions, getLoans, setContributionRate, getContributionRates } from "@/lib/api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { UserPlus, Trash2, CreditCard, History, HandCoins, Pencil, Check, X } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function Members() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editExpected, setEditExpected] = useState("");

  const { data: allMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: ["members"],
    queryFn: getMembersIncludingArchived,
  });

  const members = allMembers.filter((m: any) => !m.archivedAt);
  const archivedMembers = allMembers.filter((m: any) => m.archivedAt);

  const { data: contributions = [] } = useQuery({
    queryKey: ["contributions"],
    queryFn: () => getContributions(),
  });

  const { data: loans = [] } = useQuery({
    queryKey: ["loans"],
    queryFn: getLoans,
  });

  const addMemberMutation = useMutation({
    mutationFn: () => createMember({ name: "عضو جديد", role: "member", avatar: "جد" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast({ title: "تمت إضافة عضو جديد" });
    },
    onError: (error) => {
      toast({ title: "حدث خطأ", description: (error as any)?.message || "تعذرت إضافة العضو", variant: "destructive" });
    },
  });

  // العضو بلا سجل مالي يُحذف حقاً؛ ومن له سجل يُعرض على الوصي أن يؤرشفه بدل
  // أن يُمحى تاريخه معه
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string; reason: string } | null>(null);

  const removeMemberMutation = useMutation({
    mutationFn: deleteMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast({ title: "حُذف العضو" });
    },
    onError: (error, id) => {
      if (error instanceof MemberHasHistory) {
        const member = members.find((m: any) => m.id === id);
        setArchiveTarget({ id, name: member?.name ?? "العضو", reason: error.message });
        return;
      }
      toast({ title: "حدث خطأ", description: (error as any)?.message || "تعذر حذف العضو", variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => setMemberArchived(id, archived),
    onSuccess: (_data, { archived }) => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      setArchiveTarget(null);
      toast({ title: archived ? "أُرشِف العضو — سجلّه محفوظ" : "أُعيد العضو إلى القائمة" });
    },
    onError: (error) => {
      toast({ title: "حدث خطأ", description: (error as any)?.message || "تعذرت الأرشفة", variant: "destructive" });
    },
  });

  const { data: rates } = useQuery({ queryKey: ["contribution-rates"], queryFn: getContributionRates });

  const updateMemberMutation = useMutation({
    mutationFn: async ({ id, name, expectedMonthly }: { id: string; name: string; expectedMonthly: string | null }) => {
      const member = await updateMember(id, { name, avatar: name.substring(0, 2) });
      // المبلغ يُسجَّل كسعر يبدأ من الشهر القادم — لا يُعاد حساب أي شهر مضى
      if (expectedMonthly) {
        await setContributionRate({ memberId: id, amount: expectedMonthly });
      }
      return member;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      queryClient.invalidateQueries({ queryKey: ["contribution-rates"] });
      toast({ title: "تم تحديث بيانات العضو" });
      setEditingMember(null);
      setEditName("");
    },
    onError: (error) => {
      toast({ title: "حدث خطأ", description: (error as any)?.message || "تعذر تحديث البيانات", variant: "destructive" });
    },
  });

  const startEditing = (member: { id: string; name: string; expectedMonthly?: string | null }) => {
    setEditingMember(member.id);
    setEditName(member.name);
    setEditExpected(member.expectedMonthly ? String(Number(member.expectedMonthly)) : "");
  };

  const cancelEditing = () => {
    setEditingMember(null);
    setEditName("");
    setEditExpected("");
  };

  const saveEdit = (id: string) => {
    if (editName.trim()) {
      updateMemberMutation.mutate({
        id,
        name: editName.trim(),
        expectedMonthly: editExpected.trim() ? editExpected.trim() : null,
      });
    }
  };

  const getMemberStats = (memberId: string) => {
    const memberContributions = contributions.filter(c => c.memberId === memberId && c.status === "approved");
    const memberLoans = loans.filter(l => l.memberId === memberId && l.status === "approved");
    const pendingContributions = contributions.filter(c => c.memberId === memberId && c.status === "pending_approval");

    return {
      totalApproved: memberContributions.reduce((sum, c) => sum + Number(c.amount), 0),
      totalPending: pendingContributions.reduce((sum, c) => sum + Number(c.amount), 0),
      totalBorrowed: memberLoans.reduce((sum, l) => sum + Number(l.amount), 0),
    };
  };

  if (membersLoading) {
    return (
      <MobileLayout title="إدارة أفراد العائلة">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="إدارة أفراد العائلة">
      <div className="space-y-6 pt-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-bold text-lg text-primary font-heading">قائمة الأعضاء</h3>
          <button 
            onClick={() => addMemberMutation.mutate()}
            disabled={addMemberMutation.isPending}
            className="tap-target flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-50"
            data-testid="button-add-member"
          >
            <UserPlus className="w-4 h-4" />
            <span>إضافة عضو</span>
          </button>
        </div>

        <div className="grid gap-4 pb-12">
          {members.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground font-medium">لا يوجد أعضاء حالياً</p>
              <p className="text-xs text-muted-foreground mt-1">اضغط على "إضافة عضو" للبدء</p>
            </div>
          ) : (
            members.map((member, idx) => {
              const stats = getMemberStats(member.id);
              const isEditing = editingMember === member.id;
              
              return (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4"
                  data-testid={`card-member-${member.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-primary/14 flex items-center justify-center text-lg font-bold text-primary border-2 border-primary/5">
                      {member.avatar || member.name.substring(0, 2)}
                    </div>
                    <div className="flex-1">
                      {isEditing ? (
                        <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 font-bold text-lg bg-muted/50 border border-primary/30 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20"
                            autoFocus
                            data-testid={`input-edit-name-${member.id}`}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(member.id);
                              if (e.key === 'Escape') cancelEditing();
                            }}
                          />
                          <button
                            onClick={() => saveEdit(member.id)}
                            disabled={updateMemberMutation.isPending}
                            className="tap-target p-2 bg-fund-in text-white rounded-lg hover:bg-fund-in transition-colors disabled:opacity-50"
                            data-testid={`button-save-edit-${member.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="tap-target p-2 bg-muted text-muted-foreground rounded-lg hover:bg-destructive hover:text-white transition-colors"
                            data-testid={`button-cancel-edit-${member.id}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold text-muted-foreground shrink-0">الاشتراك الشهري:</label>
                          <input
                            type="number"
                            step="0.001"
                            value={editExpected}
                            onChange={(e) => setEditExpected(e.target.value)}
                            placeholder="الافتراضي العائلي"
                            className="flex-1 text-sm font-mono bg-muted/50 border border-primary/30 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20"
                            data-testid={`input-edit-expected-${member.id}`}
                          />
                          <span className="text-xs text-muted-foreground">ر.ع</span>
                        </div>
                        <div className="text-xs text-muted-foreground leading-relaxed">
                          يسري من {rates ? `${rates.defaultEffective.month}/${rates.defaultEffective.year}` : "الشهر القادم"} — لا يُعاد حساب الأشهر السابقة
                        </div>
                        </div>
                      ) : (
                        <>
                          <h4 className="font-bold text-lg leading-none mb-1">{member.name}</h4>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border",
                              member.role === 'guardian' ? "bg-primary/14 border-primary/30 text-primary" : "bg-muted border-border text-muted-foreground"
                            )}>
                              {member.role === 'guardian' ? 'الوصي' : member.role === 'custodian' ? 'الأمين' : 'عضو'}
                            </span>
                            {stats.totalPending > 0 && (
                              <span className="text-xs bg-fund-out text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                                بانتظار الموافقة
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    {!isEditing && (
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => startEditing(member)}
                          className="tap-target p-2 text-muted-foreground hover:text-primary transition-colors bg-muted/30 rounded-lg"
                          data-testid={`button-edit-member-${member.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => removeMemberMutation.mutate(member.id)}
                          disabled={removeMemberMutation.isPending || members.length <= 1}
                          title="إزالة العضو"
                          className="tap-target p-2 text-muted-foreground hover:text-destructive transition-colors bg-muted/30 rounded-lg disabled:opacity-50"
                          data-testid={`button-delete-member-${member.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/70">
                    <div className="bg-fund-in-bright/20 rounded-lg p-3 border border-fund-in-bright/40">
                      <p className="text-xs text-fund-in font-bold mb-1 flex items-center gap-1">
                        <CreditCard className="w-3 h-3" /> المساهمات
                      </p>
                      <div className="text-base font-bold font-mono text-fund-in">
                        {stats.totalApproved.toLocaleString()} <span className="text-xs font-sans">ر.ع</span>
                      </div>
                    </div>
                    <div className="bg-fund-out-bright/20 rounded-lg p-3 border border-fund-out-bright/40">
                      <p className="text-xs text-fund-out font-bold mb-1 flex items-center gap-1">
                        <History className="w-3 h-3" /> معلق
                      </p>
                      <div className="text-base font-bold font-mono text-fund-out">
                        {stats.totalPending.toLocaleString()} <span className="text-xs font-sans">ر.ع</span>
                      </div>
                    </div>
                    <div className="bg-fund-loan-bright/20 rounded-lg p-3 border border-fund-loan-bright/40">
                      <p className="text-xs text-fund-loan font-bold mb-1 flex items-center gap-1">
                        <HandCoins className="w-3 h-3" /> السلف
                      </p>
                      <div className="text-base font-bold font-mono text-fund-loan">
                        {stats.totalBorrowed.toLocaleString()} <span className="text-xs font-sans">ر.ع</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs text-muted-foreground pt-1">
                    <div className="flex items-center gap-1">
                      <History className="w-3 h-3" />
                      <span>انضم: {member.createdAt ? new Date(member.createdAt).toLocaleDateString('ar-OM') : 'غير محدد'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CreditCard className="w-3 h-3" />
                      <span>عضوية نشطة</span>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* المؤرشفون: خارج القائمة وسجلّهم قائم، ولهم طريق رجوع */}
        {archivedMembers.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-bold text-muted-foreground px-1">
              خارج القائمة ({archivedMembers.length})
            </h3>
            <p className="text-xs text-muted-foreground px-1 pb-1">
              سجلّهم المالي محفوظ ويظهر في التقارير القديمة، ولا يدخلون في النصاب ولا تصلهم تذكيرات.
            </p>
            {archivedMembers.map((member: any) => (
              <div
                key={member.id}
                className="flex items-center justify-between bg-muted/30 rounded-xl p-3 border border-border/70"
                data-testid={`archived-member-${member.id}`}
              >
                <span className="text-sm font-bold text-muted-foreground">{member.name}</span>
                <button
                  onClick={() => archiveMutation.mutate({ id: member.id, archived: false })}
                  disabled={archiveMutation.isPending}
                  className="tap-target text-xs font-bold text-primary px-3 py-2 rounded-lg bg-background disabled:opacity-50"
                  data-testid={`button-restore-member-${member.id}`}
                >
                  إعادة إلى القائمة
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent dir="rtl" className="max-w-sm rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{archiveTarget?.name} له سجل لا يُمحى</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-right">
              <span className="block">{archiveTarget?.reason}</span>
              <span className="block text-xs">
                الأرشفة تُخرجه من قائمة العائلة ومن النصاب ومن التذكيرات، ولا تمسّ مساهماته ولا سلفه —
                تبقى في التقارير وسجل التدقيق كما هي.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="flex-1 mt-0">إبقاؤه</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1"
              onClick={() => archiveTarget && archiveMutation.mutate({ id: archiveTarget.id, archived: true })}
              data-testid="button-confirm-archive"
            >
              أرشفته
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileLayout>
  );
}
