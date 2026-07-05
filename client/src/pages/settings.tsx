import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { applyBackupRetention, createBackup, getBackups, getBackupSummary, getMembers, getSettings, importBackup, restoreBackup, updateSettings, type BackupContentSummary, type RestoreResult } from "@/lib/api";
import { Home, Users, ChevronLeft, Shield, Wallet, DatabaseBackup, CalendarClock, Archive, Download, Upload, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import type { FamilySettings as FamilySettingsType, Member, SystemBackup } from "@shared/schema";

const COUNT_LABELS: Record<string, string> = {
  members: "الأعضاء",
  users: "الحسابات",
  contributions: "المساهمات",
  loans: "السلف",
  loanRepayments: "الأقساط",
  loanPayments: "دفعات السداد",
  expenses: "المصروفات",
  fundAdjustments: "الإيداعات المباشرة",
  capitalAllocations: "تخصيصات رأس المال",
  auditLogs: "سجلات التدقيق",
};

const LEVEL_LABELS: Record<string, string> = {
  snapshot: "نسخة",
  "pre-restore": "نسخة أمان",
  imported: "مستوردة",
};

function invalidateEverything(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries();
}

export default function FamilySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [familyName, setFamilyName] = useState(() => localStorage.getItem("familyName") || "عائلة السعيدي");
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupKeepDays, setBackupKeepDays] = useState(7);
  const [backupKeepWeeksPerMonth, setBackupKeepWeeksPerMonth] = useState(4);
  const [backupKeepMonths, setBackupKeepMonths] = useState(12);

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["members"],
    queryFn: getMembers,
  });

  const { data: settings } = useQuery<FamilySettingsType>({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const { data: backups = [] } = useQuery<SystemBackup[]>({
    queryKey: ["backups"],
    queryFn: getBackups,
  });

  useEffect(() => {
    if (!settings) return;
    setFamilyName(settings.familyName || "صندوق العائلة");
    setBackupEnabled(settings.backupEnabled ?? false);
    setBackupKeepDays(settings.backupKeepDays ?? 7);
    setBackupKeepWeeksPerMonth(settings.backupKeepWeeksPerMonth ?? 4);
    setBackupKeepMonths(settings.backupKeepMonths ?? 12);
  }, [settings]);

  useEffect(() => {
    localStorage.setItem("familyName", familyName);
  }, [familyName]);

  const saveSettingsMutation = useMutation<FamilySettingsType, Error>({
    mutationFn: () =>
      updateSettings({
        familyName,
        backupEnabled,
        backupKeepDays,
        backupKeepWeeksPerMonth,
        backupKeepMonths,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "تم حفظ إعدادات النسخ الاحتياطي" });
    },
    onError: (error) => {
      toast({
        title: "تعذر حفظ الإعدادات",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const [restoreTarget, setRestoreTarget] = useState<SystemBackup | null>(null);
  const [restoreSummary, setRestoreSummary] = useState<BackupContentSummary | null>(null);
  const [importPayload, setImportPayload] = useState<{ payload: unknown; fileName: string; counts: Record<string, number> } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const restoreBackupMutation = useMutation<RestoreResult, Error, string>({
    mutationFn: restoreBackup,
    onSuccess: () => {
      invalidateEverything(queryClient);
      setRestoreTarget(null);
      setRestoreSummary(null);
      toast({
        title: "تمت استعادة النسخة الاحتياطية",
        description: "أُنشئت نسخة أمان تلقائية من الوضع السابق قبل الاستعادة — يمكنك التراجع عبرها.",
      });
    },
    onError: (error) => {
      toast({
        title: "تعذر استعادة النسخة الاحتياطية",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const importBackupMutation = useMutation<RestoreResult, Error, unknown>({
    mutationFn: importBackup,
    onSuccess: () => {
      invalidateEverything(queryClient);
      setImportPayload(null);
      toast({
        title: "تمت الاستعادة من الملف المستورد",
        description: "أُنشئت نسخة أمان تلقائية من الوضع السابق، وحُفظ الملف المستورد ضمن سجل النسخ.",
      });
    },
    onError: (error) => {
      toast({
        title: "تعذر استيراد النسخة",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const openRestoreDialog = async (backup: SystemBackup) => {
    setRestoreTarget(backup);
    setRestoreSummary(null);
    try {
      setRestoreSummary(await getBackupSummary(backup.id));
    } catch {
      // الملخص إثرائي — التأكيد يبقى ممكناً بدونه
    }
  };

  const handleImportFile = async (file: File) => {
    if (file.size > 9 * 1024 * 1024) {
      toast({ title: "الملف كبير جداً", description: "الحد الأقصى للاستيراد 9 ميغابايت", variant: "destructive" });
      return;
    }
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload?.metadata?.version || !payload?.data) {
        toast({ title: "الملف ليس نسخة احتياطية صالحة", description: "اختر ملف JSON مُصدَّراً من هذا النظام", variant: "destructive" });
        return;
      }
      const counts: Record<string, number> = {};
      for (const key of Object.keys(COUNT_LABELS)) {
        const value = payload.data[key];
        counts[key] = Array.isArray(value) ? value.length : 0;
      }
      setImportPayload({ payload, fileName: file.name, counts });
    } catch {
      toast({ title: "تعذر قراءة الملف", description: "الملف تالف أو ليس بصيغة JSON", variant: "destructive" });
    }
  };

  const createBackupMutation = useMutation<SystemBackup, Error>({
    mutationFn: createBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "تم إنشاء النسخة الاحتياطية بنجاح" });
    },
    onError: (error) => {
      toast({
        title: "تعذر إنشاء النسخة الاحتياطية",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const retentionMutation = useMutation<{ kept: number; deleted: number }, Error>({
    mutationFn: applyBackupRetention,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast({
        title: "تم تطبيق سياسة الاحتفاظ",
        description: `تم حذف ${result.deleted} نسخة والإبقاء على ${result.kept} نسخة`,
      });
    },
    onError: (error) => {
      toast({
        title: "تعذر تنظيف النسخ القديمة",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const recentBackups = useMemo<SystemBackup[]>(() => backups.slice(0, 6), [backups]);

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
          <Button onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending} className="w-full rounded-xl">
            {saveSettingsMutation.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
          </Button>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-primary">
                <DatabaseBackup className="w-5 h-5" />
                <h3 className="font-bold font-heading">النسخ الاحتياطية</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                نسخ فعلية بصيغة JSON مع سياسة احتفاظ: أسبوعي، شهري، سنوي.
              </p>
            </div>
            <Switch checked={backupEnabled} onCheckedChange={setBackupEnabled} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <CalendarClock className="w-4 h-4 text-primary" />
                أسبوعي
              </div>
              <p className="text-xs text-muted-foreground mt-1">الاحتفاظ بالنسخ الحديثة لمدة أيام</p>
              <input
                type="number"
                min={1}
                value={backupKeepDays}
                onChange={(e) => setBackupKeepDays(Math.max(1, Number(e.target.value) || 1))}
                className="mt-3 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>

            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Archive className="w-4 h-4 text-primary" />
                شهري
              </div>
              <p className="text-xs text-muted-foreground mt-1">الاحتفاظ بآخر نسخة من كل أسبوع في الشهر</p>
              <input
                type="number"
                min={1}
                value={backupKeepWeeksPerMonth}
                onChange={(e) => setBackupKeepWeeksPerMonth(Math.max(1, Number(e.target.value) || 1))}
                className="mt-3 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>

            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <DatabaseBackup className="w-4 h-4 text-primary" />
                سنوي
              </div>
              <p className="text-xs text-muted-foreground mt-1">الاحتفاظ بآخر نسخة من كل شهر</p>
              <input
                type="number"
                min={1}
                value={backupKeepMonths}
                onChange={(e) => setBackupKeepMonths(Math.max(1, Number(e.target.value) || 1))}
                className="mt-3 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button onClick={() => createBackupMutation.mutate()} disabled={createBackupMutation.isPending} className="rounded-xl" data-testid="button-create-backup">
              {createBackupMutation.isPending ? "جاري إنشاء النسخة..." : "إنشاء نسخة الآن"}
            </Button>
            <Button variant="outline" onClick={() => retentionMutation.mutate()} disabled={retentionMutation.isPending || !backupEnabled} className="rounded-xl">
              {retentionMutation.isPending ? "جاري التنظيف..." : "تنظيف النسخ القديمة"}
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            data-testid="input-import-backup"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-xl border border-dashed border-primary/30 bg-primary/5 px-4 py-3 text-sm font-bold text-primary hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
            data-testid="button-import-backup"
          >
            <Upload className="w-4 h-4" />
            استيراد نسخة من ملف (استعادة كاملة)
          </button>
          <p className="text-[11px] text-muted-foreground leading-relaxed -mt-2 px-1">
            نزّل نسخة دورياً واحفظها خارج الخادم (جهازك أو سحابة خاصة). عند أي كارثة تفقد فيها الخادم نفسه، هذا الملف هو طريق الاستعادة الوحيد.
          </p>

          <div className="rounded-xl bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">آخر النسخ المسجلة</span>
              <Badge variant="outline">{backups.length} نسخة</Badge>
            </div>
            <div className="space-y-2">
              {recentBackups.length === 0 ? (
                <div className="text-sm text-muted-foreground">لا توجد نسخ احتياطية بعد.</div>
              ) : (
                recentBackups.map((backup: SystemBackup) => (
                  <div key={backup.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{backup.fileName}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {new Date(backup.backupDate).toLocaleString("ar-OM")}
                        {backup.backupLevel !== "snapshot" && (
                          <span className={backup.backupLevel === "pre-restore" ? "text-amber-600 font-bold" : "text-blue-600 font-bold"}>
                            {LEVEL_LABELS[backup.backupLevel] ?? backup.backupLevel}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge>
                        {Math.max(1, Math.round((backup.sizeBytes ?? 0) / 1024))} ك.ب
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-lg px-2"
                        title="تنزيل النسخة"
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = `/api/backups/${backup.id}/download`;
                          a.download = backup.fileName;
                          a.click();
                        }}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        disabled={restoreBackupMutation.isPending}
                        data-testid={`button-restore-${backup.id}`}
                        onClick={() => openRestoreDialog(backup)}
                      >
                        استعادة
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* حوار تأكيد الاستعادة مع ملخص المحتوى */}
          <AlertDialog open={!!restoreTarget} onOpenChange={(open) => { if (!open) { setRestoreTarget(null); setRestoreSummary(null); } }}>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-heading">استعادة النسخة الاحتياطية؟</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>
                      ستُستبدل كل البيانات الحالية بمحتوى النسخة
                      «{restoreTarget?.fileName}» المؤرخة {restoreTarget ? new Date(restoreTarget.backupDate).toLocaleString("ar-OM") : ""}.
                    </p>
                    {restoreSummary ? (
                      <div className="rounded-xl bg-muted/40 p-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {Object.entries(restoreSummary.counts).map(([key, count]) => (
                          <div key={key} className="flex justify-between gap-2">
                            <span>{COUNT_LABELS[key] ?? key}</span>
                            <span className="font-mono font-bold">{count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs">جارٍ قراءة محتوى النسخة...</p>
                    )}
                    <p className="flex items-center gap-2 text-emerald-700 text-xs font-bold">
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      ستُنشأ نسخة أمان تلقائية من وضعك الحالي قبل الاستعادة — يمكنك التراجع عبرها إن أخطأت.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>تراجع</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="button-confirm-restore"
                  disabled={restoreBackupMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    if (restoreTarget) restoreBackupMutation.mutate(restoreTarget.id);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {restoreBackupMutation.isPending ? "جارٍ الاستعادة..." : "استعادة الآن"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* حوار تأكيد الاستيراد من ملف */}
          <AlertDialog open={!!importPayload} onOpenChange={(open) => !open && setImportPayload(null)}>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-heading">استعادة كاملة من الملف المستورد؟</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>سيحل محتوى الملف «{importPayload?.fileName}» محل كل بيانات النظام الحالية.</p>
                    {importPayload && (
                      <div className="rounded-xl bg-muted/40 p-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {Object.entries(importPayload.counts).map(([key, count]) => (
                          <div key={key} className="flex justify-between gap-2">
                            <span>{COUNT_LABELS[key] ?? key}</span>
                            <span className="font-mono font-bold">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="flex items-center gap-2 text-emerald-700 text-xs font-bold">
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      ستُنشأ نسخة أمان تلقائية من وضعك الحالي، وسيُحفظ الملف المستورد ضمن سجل النسخ للتتبع.
                    </p>
                    <p className="text-xs text-amber-700">
                      تنبيه: إذا كانت حسابات الدخول في الملف مختلفة فستحتاج للدخول من جديد بحساب من داخل النسخة المستعادة.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>تراجع</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="button-confirm-import"
                  disabled={importBackupMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    if (importPayload) importBackupMutation.mutate(importPayload.payload);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {importBackupMutation.isPending ? "جارٍ الاستعادة..." : "استعادة من الملف"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
                  {member.role === "guardian" ? "الوصي" : member.role === "custodian" ? "الأمين" : "عضو"}
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
              href="/audit-log"
              className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-primary/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium">سجل التدقيق</span>
            </Link>
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
          <p className="text-xs text-emerald-800 leading-relaxed">
            * يتم حفظ النسخ الاحتياطية كملفات JSON داخل مجلد منفصل في الخادم، مع سياسة احتفاظ تقلل فقدان البيانات على المدى الطويل.
          </p>
        </div>
      </div>
    </MobileLayout>
  );
}
