import webpush from "web-push";
import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import type { Notification } from "@shared/schema";

/**
 * إرسال إشعارات الدفع.
 *
 * الميزة اختيارية بالكامل: بدون مفاتيح VAPID في البيئة يبقى كل شيء آخر يعمل،
 * وتُرفض نقاط الإشعارات برسالة واضحة بدل أن يتعطل الخادم عند الإقلاع.
 */

const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com";

let configured = false;

if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.error("مفاتيح VAPID غير صالحة — الإشعارات معطّلة:", error);
  }
}

export function isPushConfigured(): boolean {
  return configured;
}

export function pushPublicKey(): string | null {
  return configured ? publicKey! : null;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface DeliveryResult {
  delivered: number;
  failed: number;
}

/** أصحاب الأجهزة المقصودون بهذا الإشعار */
async function resolveAudience(notification: Pick<Notification, "audience" | "targetUserId">): Promise<string[] | undefined> {
  switch (notification.audience) {
    case "all":
      // undefined = كل الاشتراكات، دون الحاجة لقراءة جدول المستخدمين
      return undefined;
    case "user":
      return notification.targetUserId ? [notification.targetUserId] : [];
    case "admins": {
      const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      return rows.map((row) => row.id);
    }
    case "members": {
      const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "user"));
      return rows.map((row) => row.id);
    }
    default:
      return [];
  }
}

/**
 * يرسل الحمولة لكل أجهزة الجمهور المحدد.
 *
 * الاشتراك الذي يرد عليه المتصفح بـ 404 أو 410 يعني جهازاً أزال التطبيق أو
 * ألغى الإذن — يُحذف صفه فوراً حتى لا يُحاول الخادم مخاطبته إلى الأبد.
 */
export async function sendToAudience(
  notification: Pick<Notification, "audience" | "targetUserId" | "title" | "body" | "url">,
): Promise<DeliveryResult> {
  if (!configured) return { delivered: 0, failed: 0 };

  const userIds = await resolveAudience(notification);
  const subscriptions = await storage.getPushSubscriptions(userIds);
  if (subscriptions.length === 0) return { delivered: 0, failed: 0 };

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url: notification.url || "/",
  });

  let delivered = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        );
        delivered += 1;
        await storage.touchPushSubscription(subscription.endpoint);
      } catch (error) {
        failed += 1;
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await storage.deletePushSubscription(subscription.endpoint).catch(() => undefined);
        }
      }
    }),
  );

  return { delivered, failed };
}

/** يرسل إشعاراً مسجَّلاً ويحدّث نتيجته في السجل */
export async function dispatchNotification(notification: Notification): Promise<DeliveryResult> {
  try {
    const result = await sendToAudience(notification);
    await storage.updateNotification(notification.id, {
      status: "sent",
      sentAt: new Date(),
      deliveredCount: result.delivered,
      failedCount: result.failed,
    });
    return result;
  } catch (error) {
    await storage.updateNotification(notification.id, {
      status: "failed",
      error: error instanceof Error ? error.message : "خطأ غير معروف",
    });
    throw error;
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

/**
 * يفحص الإشعارات المجدولة كل دقيقة ويرسل ما حان وقته.
 *
 * دقة الدقيقة كافية لإشعار عائلي، وتوفّر استعلاماً كل ثانية بلا داعٍ.
 */
export function startNotificationScheduler() {
  if (!configured || timer) return;

  timer = setInterval(async () => {
    try {
      const due = await storage.getDueNotifications(new Date());
      for (const notification of due) {
        // الحجز مشروط بأن الإشعار ما زال مجدولاً — أول دورة تحجزه، وما بعدها يتخطاه
        const claimed = await storage.claimScheduledNotification(notification.id);
        if (!claimed) continue;
        await dispatchNotification(claimed).catch((error) =>
          console.error("تعذر إرسال إشعار مجدول:", error),
        );
      }
    } catch (error) {
      console.error("خطأ في جدولة الإشعارات:", error);
    }
  }, 60_000);

  timer.unref?.();
}
