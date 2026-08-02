import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated, isAdmin } from "../auth";
import { zodErrorResponse } from "../validation";

// المرفق يُحفظ في قاعدة البيانات لا على القرص: قرص النشر مؤقت وتضيع الملفات عند إعادة النشر
export const MAX_ATTACHMENT_BYTES = 1024 * 1024; // 1 ميغابايت
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ENTITY_TYPES = ["contribution", "expense", "loan_payment", "investment"] as const;

const uploadSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().refine((t) => ALLOWED_TYPES.includes(t), "نوع الملف غير مدعوم — الصور وملفات PDF فقط"),
  content: z.string().min(1), // base64 بلا ترويسة data:
});

export function registerAttachmentRoutes(app: Express) {
  // قائمة مرفقات كيان معيّن (بلا محتوى — المحتوى يُجلب عند التنزيل فقط).
  // الاستعلام بمعاملات لا بمسار، حتى لا يلتبس بمسار التنزيل /:id/download
  app.get("/api/attachments", isAuthenticated, async (req, res) => {
    try {
      const entityType = String(req.query.entityType ?? "");
      const entityId = String(req.query.entityId ?? "");
      if (!ENTITY_TYPES.includes(entityType as typeof ENTITY_TYPES[number])) {
        return res.status(400).json({ error: "نوع كيان غير معروف" });
      }
      if (!entityId) return res.status(400).json({ error: "معرّف الكيان مطلوب" });
      res.json(await storage.getAttachments(entityType, entityId));
    } catch (error) {
      console.error("List attachments error:", error);
      res.status(500).json({ error: "تعذر جلب المرفقات" });
    }
  });

  app.post("/api/attachments", isAuthenticated, async (req, res) => {
    try {
      const data = uploadSchema.parse(req.body);
      const sizeBytes = Buffer.from(data.content, "base64").length;
      if (sizeBytes > MAX_ATTACHMENT_BYTES) {
        return res.status(400).json({ error: "حجم الملف يتجاوز 1 ميغابايت — اضغط الصورة ثم أعد المحاولة" });
      }

      const created = await storage.createAttachment({
        entityType: data.entityType,
        entityId: data.entityId,
        fileName: data.fileName,
        mimeType: data.mimeType,
        sizeBytes,
        content: data.content,
        createdBy: req.user?.id ?? null,
      });

      await storage.createAuditLog({
        action: "attachment_uploaded",
        entityType: data.entityType,
        entityId: data.entityId,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? "عضو",
        description: `أُرفق مستند (${data.fileName})`,
        metadata: { attachmentId: created.id, sizeBytes },
      });

      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json(zodErrorResponse(error));
      console.error("Upload attachment error:", error);
      res.status(500).json({ error: "تعذر رفع المرفق" });
    }
  });

  app.get("/api/attachments/:id/download", isAuthenticated, async (req, res) => {
    try {
      const attachment = await storage.getAttachment(req.params.id as string);
      if (!attachment) return res.status(404).json({ error: "المرفق غير موجود" });

      res.setHeader("Content-Type", attachment.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(attachment.fileName)}"`);
      res.send(Buffer.from(attachment.content, "base64"));
    } catch (error) {
      console.error("Download attachment error:", error);
      res.status(500).json({ error: "تعذر تنزيل المرفق" });
    }
  });

  app.delete("/api/attachments/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const attachment = await storage.getAttachment(req.params.id as string);
      if (!attachment) return res.status(404).json({ error: "المرفق غير موجود" });

      await storage.deleteAttachment(attachment.id);
      await storage.createAuditLog({
        action: "attachment_deleted",
        entityType: attachment.entityType,
        entityId: attachment.entityId,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? "مشرف",
        description: `حُذف مرفق (${attachment.fileName})`,
        metadata: { attachmentId: attachment.id },
      });

      res.json({ message: "تم حذف المرفق" });
    } catch (error) {
      console.error("Delete attachment error:", error);
      res.status(500).json({ error: "تعذر حذف المرفق" });
    }
  });
}
