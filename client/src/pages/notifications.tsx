import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Bell, Clock, Send, Smartphone, Trash2, TriangleAlert } from "lucide-react";
import MobileLayout from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  cancelNotification,
  getAdminUsers,
  getNotifications,
  runReminders,
  sendNotification,
  type NotificationRow,
} from "@/lib/api";

type Audience = "all" | "admins" | "members" | "user";

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: "كل الأجهزة المشتركة",
  admins: "المشرفون فقط",
  members: "الأعضاء فقط",
  user: "مستخدم واحد",
};

// وجهات جاهزة تغني عن كتابة المسار يدوياً وتمنع الأخطاء الإملائية فيه
const DESTINATIONS = [
  { value: "/dashboard", label: "لوحة الصندوق" },
  { value: "/payments", label: "المساهمات" },
  { value: "/loans", label: "السلف" },
  { value: "/proposals", label: "قرارات العائلة" },
  { value: "/analytics", label: "التحليلات" },
];

const STATUS_LABEL: Record<NotificationRow["status"], string> = {
  scheduled: "مجدول",
  sending: "قيد الإرسال",
  sent: "أُرسل",
  cancelled: "أُلغي",
  failed: "فشل",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-OM", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** أقرب وقت يمكن جدولة إشعار فيه، بصيغة حقل datetime-local */
function localDateTimeMin() {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
}

export default function NotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/dashboard");
  const [audience, setAudience] = useState<Audience>("all");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/notifications"],
    queryFn: getNotifications,
  });

  const { data: users } = useQuery({
    queryKey: ["/api/admin/users"],
    queryFn: getAdminUsers,
    enabled: audience === "user",
  });

  function resetForm() {
    setTitle("");
    setBody("");
    setScheduledAt("");
  }

  const send = useMutation({
    mutationFn: () =>
      sendNotification({
        title: title.trim(),
        body: body.trim(),
        url,
        audience,
        targetUserId: audience === "user" ? targetUserId : null,
        // الحقل محلي التوقيت — تحويله لـ ISO يجعل الخادم يفهمه كما قصده المرسل
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      resetForm();
      toast({
        title: result.scheduled ? "جُدول الإشعار" : "أُرسل الإشعار",
        description: result.scheduled
          ? `سيُرسل في ${formatDate(result.notification.scheduledAt)}`
          : `وصل ${result.delivered ?? 0} جهازاً${result.failed ? ` — تعذّر ${result.failed}` : ""}`,
      });
    },
    onError: (error: Error) =>
      toast({ title: "تعذر الإرسال", description: error.message, variant: "destructive" }),
  });

  // التذكيرات تعمل من تلقائها كل ست ساعات — هذا الزر لتجربتها فوراً
  const reminders = useMutation({
    mutationFn: runReminders,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: result.sent > 0 ? `أُرسل ${result.sent} تذكيراً` : "لا تذكيرات مستحقة الآن",
        description: result.skipped > 0 ? `${result.skipped} أُرسلت من قبل ولم تتكرر` : undefined,
      });
    },
    onError: (error: Error) =>
      toast({ title: "تعذر تشغيل التذكيرات", description: error.message, variant: "destructive" }),
  });

  const cancel = useMutation({
    mutationFn: cancelNotification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "أُلغي الإشعار المجدول" });
    },
    onError: (error: Error) =>
      toast({ title: "تعذر الإلغاء", description: error.message, variant: "destructive" }),
  });

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (audience !== "user" || targetUserId.length > 0) &&
    !send.isPending;

  return (
    <MobileLayout title="الإشعارات">
      <div className="space-y-4 p-4">
        {data && !data.configured && (
          <div className="flex items-start gap-3 rounded-xl border border-fund-due/30 bg-fund-due/5 p-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-fund-due" />
            <div className="text-sm">
              <p className="font-bold text-foreground">الإشعارات غير مهيأة</p>
              <p className="mt-1 text-muted-foreground">
                أضف <code className="font-mono text-xs">VAPID_PUBLIC_KEY</code> و
                <code className="mx-1 font-mono text-xs">VAPID_PRIVATE_KEY</code>
                في متغيرات بيئة الخادم ثم أعد النشر. وُلّدهما بأمر{" "}
                <code className="font-mono text-xs">npx web-push generate-vapid-keys</code>.
              </p>
            </div>
          </div>
        )}

        {data && (
          <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-card p-3 text-sm">
            <Smartphone className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">
              {data.subscribedDevices === 0
                ? "لا يوجد جهاز مشترك بعد — يفعّل كل فرد الإشعارات من صفحة «حسابي»"
                : `${data.subscribedDevices} جهازاً مشتركاً`}
            </span>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-primary" />
              إشعار جديد
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="notif-title">العنوان</Label>
              <Input
                id="notif-title"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="تذكير بقسط مستحق"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notif-body">النص</Label>
              <Textarea
                id="notif-body"
                value={body}
                maxLength={500}
                rows={3}
                onChange={(event) => setBody(event.target.value)}
                placeholder="يستحق قسط هذا الشهر خلال ثلاثة أيام"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>المستلمون</Label>
                <Select value={audience} onValueChange={(value) => setAudience(value as Audience)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {AUDIENCE_LABEL[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>يفتح صفحة</Label>
                <Select value={url} onValueChange={setUrl}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DESTINATIONS.map((destination) => (
                      <SelectItem key={destination.value} value={destination.value}>
                        {destination.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {audience === "user" && (
              <div className="space-y-1.5">
                <Label>المستخدم</Label>
                <Select value={targetUserId} onValueChange={setTargetUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر مستخدماً" />
                  </SelectTrigger>
                  <SelectContent>
                    {(users ?? []).map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.firstName || user.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="notif-when">وقت الإرسال</Label>
              <Input
                id="notif-when"
                type="datetime-local"
                value={scheduledAt}
                min={localDateTimeMin()}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                اتركه فارغاً للإرسال الفوري.
              </p>
            </div>

            <Button onClick={() => send.mutate()} disabled={!canSend} className="w-full">
              <Send className="ml-2 h-4 w-4" />
              {send.isPending ? "جارٍ…" : scheduledAt ? "جدولة الإشعار" : "إرسال الآن"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlarmClock className="h-4 w-4 text-primary" />
              التذكيرات التلقائية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              يذكّر النظام كل عضو بقسطه المستحق ومساهمة شهره — لصاحب الالتزام وحده، ومرة واحدة لكل التزام.
              يعمل تلقائياً كل ست ساعات.
            </p>
            <Button
              onClick={() => reminders.mutate()}
              disabled={reminders.isPending || !data?.configured}
              variant="outline"
              size="sm"
            >
              <AlarmClock className="ml-2 h-4 w-4" />
              {reminders.isPending ? "جارٍ الفحص…" : "شغّل الجولة الآن"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-primary" />
              السجل
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-2">
            {isLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
            ) : (data?.notifications.length ?? 0) === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">لم يُرسل أي إشعار بعد</p>
            ) : (
              data!.notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="rounded-xl border border-border/80 bg-card p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-foreground">{notification.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {notification.body}
                      </p>
                    </div>

                    {notification.status === "scheduled" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancel.mutate(notification.id)}
                        disabled={cancel.isPending}
                        aria-label="إلغاء الإشعار المجدول"
                      >
                        <Trash2 className="h-4 w-4 text-fund-due" />
                      </Button>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {STATUS_LABEL[notification.status]}
                    </span>
                    <span>{AUDIENCE_LABEL[notification.audience]}</span>
                    <span>
                      {notification.status === "scheduled"
                        ? formatDate(notification.scheduledAt)
                        : formatDate(notification.sentAt ?? notification.createdAt)}
                    </span>
                    {notification.status === "sent" && (
                      <span>
                        وصل {notification.deliveredCount}
                        {notification.failedCount > 0 && ` · تعذّر ${notification.failedCount}`}
                      </span>
                    )}
                  </div>

                  {notification.error && (
                    <p className="mt-1 text-xs text-fund-due">{notification.error}</p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </MobileLayout>
  );
}
