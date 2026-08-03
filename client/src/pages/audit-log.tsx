import { useQuery } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getAuditLogsPublic } from "@/lib/api";
import { History, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

const actionLabels: Record<string, string> = {
  contribution_approved: "اعتماد مساهمة",
  contribution_deleted: "حذف مساهمة",
  settings_updated: "تعديل الإعدادات",
  loan_approved: "اعتماد سلفة",
  loan_rejected: "رفض سلفة",
  expense_created: "تسجيل مصروف",
  user_created: "إنشاء مستخدم",
  user_deleted: "حذف مستخدم",
  system_reset: "تصفير النظام",
};

function getActionLabel(action: string): string {
  return actionLabels[action] || "عملية إدارية";
}

export default function AuditLog() {
  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ["audit-logs-public"],
    queryFn: getAuditLogsPublic,
  });

  return (
    <MobileLayout title="سجل التدقيق">
      <div className="space-y-6 pt-2 pb-12">

        <div className="bg-primary text-primary-foreground p-6 rounded-xl relative overflow-hidden shadow-lg shadow-primary/20">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <ShieldCheck className="w-8 h-8" />
              <h2 className="text-xl font-bold">سجل التدقيق</h2>
            </div>
            <p className="text-sm opacity-80">جميع العمليات الحساسة المسجلة في النظام</p>
            <p className="text-xs opacity-60 mt-1">إجمالي السجلات: {logs.length}</p>
          </div>
          <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm font-medium text-muted-foreground">جاري تحميل السجل...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-fund-due-bright/40 bg-fund-due-bright/20 p-8 text-center">
            <History className="mx-auto mb-3 h-10 w-10 text-fund-due" />
            <p className="font-bold text-fund-due">تعذر تحميل سجل التدقيق</p>
            <p className="mt-1 text-sm text-fund-due">حاول تحديث الصفحة أو إعادة المحاولة لاحقاً.</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center">
            <History className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">لا توجد عمليات مسجلة بعد.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log, idx) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="rounded-xl border border-border/60 bg-card p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/14 text-primary">
                    <History className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="rounded-full bg-primary/14 px-2.5 py-0.5 text-xs font-bold text-primary">
                        {getActionLabel(log.action)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString("ar-OM") : ""}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-foreground leading-snug">{log.description}</p>
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
    </MobileLayout>
  );
}
