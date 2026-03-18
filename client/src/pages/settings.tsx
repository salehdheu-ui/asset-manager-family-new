import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { applyBackupRetention, createBackup, getBackups, getMembers, getSettings, updateSettings } from "@/lib/api";
import { Home, Users, ChevronLeft, Shield, Wallet, DatabaseBackup, CalendarClock, Archive } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { FamilySettings as FamilySettingsType, Member, SystemBackup } from "@shared/schema";

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
            <Button onClick={() => createBackupMutation.mutate()} disabled={createBackupMutation.isPending || !backupEnabled} className="rounded-xl">
              {createBackupMutation.isPending ? "جاري إنشاء النسخة..." : "إنشاء نسخة الآن"}
            </Button>
            <Button variant="outline" onClick={() => retentionMutation.mutate()} disabled={retentionMutation.isPending || !backupEnabled} className="rounded-xl">
              {retentionMutation.isPending ? "جاري التنظيف..." : "تنظيف النسخ القديمة"}
            </Button>
          </div>

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
                      <div className="text-xs text-muted-foreground">
                        {new Date(backup.backupDate).toLocaleString("ar-OM")}
                      </div>
                    </div>
                    <Badge variant="secondary">
                      {Math.max(1, Math.round((backup.sizeBytes ?? 0) / 1024))} ك.ب
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
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
            * يتم حفظ النسخ الاحتياطية كملفات JSON داخل مجلد منفصل في الخادم، مع سياسة احتفاظ تقلل فقدان البيانات على المدى الطويل.
          </p>
        </div>
      </div>
    </MobileLayout>
  );
}
