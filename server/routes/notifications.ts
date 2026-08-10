import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated, isAdmin } from "../auth";
import { insertNotificationSchema } from "@shared/schema";
import { zodErrorResponse } from "../validation";
import { dispatchNotification, isPushConfigured, pushPublicKey } from "../services/push";

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  platform: z.enum(["android", "ios", "desktop"]).nullable().optional(),
});

export function registerNotificationRoutes(app: Express) {
  // ————— اشتراك الأجهزة —————

  // المفتاح العام ليس سراً — المتصفح يحتاجه ليبني اشتراكاً موجّهاً لخادمنا وحده
  app.get("/api/push/public-key", isAuthenticated, (_req, res) => {
    res.json({ publicKey: pushPublicKey(), configured: isPushConfigured() });
  });

  app.post("/api/push/subscribe", isAuthenticated, async (req, res) => {
    try {
      if (!isPushConfigured()) {
        return res.status(503).json({ error: "الإشعارات غير مهيأة على الخادم" });
      }

      const data = subscribeSchema.parse(req.body);
      const saved = await storage.savePushSubscription({
        userId: req.user!.id,
        endpoint: data.subscription.endpoint,
        p256dh: data.subscription.keys.p256dh,
        auth: data.subscription.keys.auth,
        platform: data.platform ?? null,
        userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
      });

      res.status(201).json({ id: saved.id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json(zodErrorResponse(error));
      }
      console.error("Push subscribe error:", error);
      res.status(500).json({ error: "تعذر حفظ الاشتراك" });
    }
  });

  app.post("/api/push/unsubscribe", isAuthenticated, async (req, res) => {
    try {
      const endpoint = z.string().url().parse(req.body?.endpoint);
      const owned = await storage.getPushSubscriptions([req.user!.id]);

      // إلغاء اشتراك جهاز شخص آخر ممنوع، حتى لو عُرف عنوانه
      if (!owned.some((subscription) => subscription.endpoint === endpoint)) {
        return res.status(204).send();
      }

      await storage.deletePushSubscription(endpoint);
      res.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "عنوان اشتراك غير صالح" });
      }
      res.status(500).json({ error: "تعذر إلغاء الاشتراك" });
    }
  });

  /** حالة الإشعارات لهذا المستخدم — تستخدمها الإعدادات لعرض الوضع الصحيح */
  app.get("/api/push/status", isAuthenticated, async (req, res) => {
    try {
      const devices = await storage.getPushSubscriptions([req.user!.id]);
      res.json({
        configured: isPushConfigured(),
        devices: devices.map((device) => ({
          id: device.id,
          platform: device.platform,
          createdAt: device.createdAt,
          lastUsedAt: device.lastUsedAt,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: "تعذر جلب حالة الإشعارات" });
    }
  });

  // ————— إدارة الإشعارات (الوصي) —————

  app.get("/api/notifications", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const [log, subscriptions] = await Promise.all([
        storage.getNotifications(100),
        storage.getPushSubscriptions(),
      ]);
      res.json({
        configured: isPushConfigured(),
        subscribedDevices: subscriptions.length,
        notifications: log,
      });
    } catch (error) {
      res.status(500).json({ error: "تعذر جلب سجل الإشعارات" });
    }
  });

  app.post("/api/notifications", isAuthenticated, isAdmin, async (req, res) => {
    try {
      if (!isPushConfigured()) {
        return res.status(503).json({
          error: "الإشعارات غير مهيأة — أضف VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY في بيئة الخادم",
        });
      }

      const data = insertNotificationSchema.parse(req.body);

      // وقت في الماضي يعني "الآن" — تجنّباً لإشعار يعلق في الجدولة إلى الأبد
      const scheduledAt =
        data.scheduledAt && data.scheduledAt.getTime() > Date.now() ? data.scheduledAt : null;

      const created = await storage.createNotification({
        ...data,
        scheduledAt,
        status: scheduledAt ? "scheduled" : "sending",
        createdBy: req.user?.id ?? null,
        createdByName: req.user?.username ?? req.user?.firstName ?? "مشرف",
      });

      if (scheduledAt) {
        return res.status(201).json({ notification: created, scheduled: true });
      }

      const result = await dispatchNotification(created);
      const sent = await storage.getNotification(created.id);
      res.status(201).json({ notification: sent ?? created, scheduled: false, ...result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json(zodErrorResponse(error));
      }
      console.error("Send notification error:", error);
      res.status(500).json({ error: "تعذر إرسال الإشعار" });
    }
  });

  /** إلغاء إشعار مجدول لم يُرسل بعد — المرسَل لا يُلغى، فالأجهزة استلمته */
  app.delete("/api/notifications/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const notification = await storage.getNotification(req.params.id as string);
      if (!notification) {
        return res.status(404).json({ error: "الإشعار غير موجود" });
      }
      if (notification.status !== "scheduled") {
        return res.status(400).json({ error: "لا يمكن إلغاء إشعار أُرسل بالفعل" });
      }

      await storage.updateNotification(notification.id, { status: "cancelled" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "تعذر إلغاء الإشعار" });
    }
  });
}
