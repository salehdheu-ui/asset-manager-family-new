import webpush from "web-push";
import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { appSecrets } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import type { Notification } from "@shared/schema";

/**
 * إرسال إشعارات الدفع.
 *
 * المفاتيح تأتي من البيئة إن وُضعت فيها، وإلا ولّدها الخادم مرة واحدة وحفظها
 * في قاعدة البيانات. سبب هذا الحفظ أن زوج المفاتيح هوية الخادم عند خدمات
 * الدفع: لو تولّد جديد عند كل إقلاع لبطل كل اشتراك على كل جهاز، ولوجب على
 * العائلة كلها إعادة التفعيل بعد كل نشر. ومتى حُفظ مرة لم يتغيّر أبداً.
 */

const VAPID_PUBLIC = "vapid_public_key";
const VAPID_PRIVATE = "vapid_private_key";

const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com";

let publicKey: string | null = null;
let configured = false;

/** يقرأ الزوج المحفوظ، أو null إن لم يكتمل */
async function storedKeys(): Promise<{ publicKey: string; privateKey: string } | null> {
  const rows = await db
    .select()
    .from(appSecrets)
    .where(inArray(appSecrets.key, [VAPID_PUBLIC, VAPID_PRIVATE]));

  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const found = { publicKey: stored.get(VAPID_PUBLIC), privateKey: stored.get(VAPID_PRIVATE) };
  return found.publicKey && found.privateKey
    ? { publicKey: found.publicKey, privateKey: found.privateKey }
    : null;
}

/**
 * يهيّئ الإشعارات: البيئة أولاً، ثم المحفوظ، ثم توليد جديد يُحفظ.
 *
 * يُستدعى مرة عند الإقلاع. فشله لا يُسقط الخادم — تبقى الإشعارات وحدها معطّلة.
 */
export async function initPush(): Promise<boolean> {
  const fromEnv = {
    publicKey: process.env.VAPID_PUBLIC_KEY?.trim(),
    privateKey: process.env.VAPID_PRIVATE_KEY?.trim(),
  };

  let keys: { publicKey: string; privateKey: string } | null =
    fromEnv.publicKey && fromEnv.privateKey
      ? { publicKey: fromEnv.publicKey, privateKey: fromEnv.privateKey }
      : null;

  try {
    if (!keys) {
      keys = await storedKeys();

      if (!keys) {
        const generated = webpush.generateVAPIDKeys();
        // الإدراج المشروط يحسم السباق بين نسختين تقلعان معاً: الفائز يكتب،
        // والخاسر يقرأ ما كتبه الفائز بدل أن يفرض مفاتيحه
        await db
          .insert(appSecrets)
          .values([
            { key: VAPID_PUBLIC, value: generated.publicKey },
            { key: VAPID_PRIVATE, value: generated.privateKey },
          ])
          .onConflictDoNothing();

        keys = (await storedKeys()) ?? generated;
        console.log("وُلّد زوج مفاتيح VAPID وحُفظ — الإشعارات جاهزة");
      }
    }
  } catch (error) {
    console.error("تعذّر تجهيز مفاتيح الإشعارات:", error);
    return false;
  }

  try {
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    publicKey = keys.publicKey;
    configured = true;
    return true;
  } catch (error) {
    console.error("مفاتيح VAPID غير صالحة — الإشعارات معطّلة:", error);
    return false;
  }
}

export function isPushConfigured(): boolean {
  return configured;
}

export function pushPublicKey(): string | null {
  return configured ? publicKey : null;
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
        } else if (status === 403) {
          // اشتراك عُقد بمفتاح VAPID آخر. لا يُحذف: قد يكون الخلل في إعداد
          // الخادم لا في الاشتراك، وحذف اشتراكات العائلة كلها لخطأ إعداد
          // يعني مطالبتهم جميعاً بإعادة التفعيل. الجهاز يصحّح نفسه عند فتحه.
          console.error("رُفض اشتراك بمفتاح VAPID مختلف — تحقّق من ثبات المفاتيح");
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
