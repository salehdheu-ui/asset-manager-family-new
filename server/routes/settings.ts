import type { Express } from "express";
import { storage } from "../storage";
import { insertFamilySettingsSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { zodErrorResponse } from "../validation";

export function registerSettingsRoutes(app: Express) {
  app.get("/api/settings", isAuthenticated, async (req, res) => {
    try {
      let settings = await storage.getFamilySettings();
      if (!settings) {
        settings = await storage.updateFamilySettings({
          familyName: "صندوق العائلة",
          currency: "ر.ع"
        });
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const data = insertFamilySettingsSchema.partial().parse(req.body);
      const previousSettings = await storage.getFamilySettings();

      // التحقق أن مجموع نسب التوزيع = 100 إذا تم تعديل أي نسبة
      if (data.protectedPercent !== undefined || data.emergencyPercent !== undefined || data.flexiblePercent !== undefined || data.growthPercent !== undefined) {
        const p = data.protectedPercent ?? previousSettings?.protectedPercent ?? 45;
        const e = data.emergencyPercent ?? previousSettings?.emergencyPercent ?? 15;
        const f = data.flexiblePercent ?? previousSettings?.flexiblePercent ?? 20;
        const g = data.growthPercent ?? previousSettings?.growthPercent ?? 20;
        if (p + e + f + g !== 100) {
          return res.status(400).json({ message: `مجموع نسب التوزيع يجب أن يساوي 100% (الحالي: ${p + e + f + g}%)` });
        }
      }

      const settings = await storage.updateFamilySettings(data);

      await storage.createAuditLog({
        action: "settings_updated",
        entityType: "family_settings",
        entityId: settings.id,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
        description: "تم تعديل إعدادات العائلة",
        metadata: {
          changedFields: Object.keys(data),
          before: previousSettings ?? null,
          after: settings,
        },
      });

      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json(zodErrorResponse(error));
      }
      res.status(500).json({ message: "تعذر تحديث الإعدادات حاليًا" });
    }
  });

  app.post("/api/settings/emergency", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
      const settings = await storage.updateFamilySettings({ emergencyMode: enabled });

      await storage.createAuditLog({
        action: enabled ? "emergency_mode_enabled" : "emergency_mode_disabled",
        entityType: "family_settings",
        entityId: settings.id,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
        description: enabled
          ? "تم تفعيل وضع الطوارئ — جُمّدت العمليات المالية للأعضاء"
          : "تم إلغاء وضع الطوارئ — عادت العمليات المالية للعمل",
        metadata: { emergencyMode: enabled },
      });

      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "قيمة غير صحيحة لوضع الطوارئ" });
      }
      res.status(500).json({ message: "تعذر تغيير وضع الطوارئ حاليًا" });
    }
  });
}
