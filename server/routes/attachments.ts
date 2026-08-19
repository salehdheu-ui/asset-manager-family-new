import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated, isAdmin } from "../auth";
import { zodErrorResponse } from "../validation";
import { getAttachmentObject, putAttachmentObject } from "../services/attachment-storage";

// المرفق يُحفظ في Object Storage عند تفعيل ATTACHMENT_STORAGE_MODE=s3، مع fallback legacy أثناء الترحيل
export const MAX_ATTACHMENT_BYTES = 1024 * 1024; // 1 ميغابايت
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ENTITY_TYPES = ["contribution", "expense", "loan_payment", "investment"] as const;
type AttachmentEntityType = (typeof ENTITY_TYPES)[number];

function hasValidSignature(mimeType: string, body: Buffer) {
  if (mimeType === "application/pdf") return body.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mimeType === "image/png") return body.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  if (mimeType === "image/jpeg") return body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mimeType === "image/webp") return body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

type AuthenticatedRequest = Request & {
  user?: { id: string; role?: string; memberId?: string | null; username?: string | null };
};

const uploadSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().trim().min(1).max(128),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().refine((t) => ALLOWED_TYPES.includes(t), "نوع الملف غير مدعوم — الصور وملفات PDF فقط"),
  content: z.string().min(1), // base64 بلا ترويسة data:
});

/**
 * التفويض هنا على مستوى السجل المرتبط بالمرفق، لا على مستوى تسجيل الدخول فقط.
 * المشرف يرى كل موارد العائلة، والعضو يرى مساهماته وسداداته فقط.
 */
async function canAccessEntity(req: AuthenticatedRequest, entityType: AttachmentEntityType, entityId: string): Promise<boolean> {
  if (req.user?.role === "admin") return true;

  const memberId = req.user?.memberId;
  if (!memberId) return false;

  if (entityType === "contribution") {
    const contribution = await storage.getContribution(entityId);
    return contribution?.memberId === memberId;
  }

  if (entityType === "loan_payment") {
    const payment = await storage.getLoanPayment(entityId);
    if (!payment) return false;
    const loan = await storage.getLoan(payment.loanId);
    return loan?.memberId === memberId;
  }

  // المصروفات والاستثمارات لا تظهر في واجهة العضو، لذلك تبقى إدارية بالكامل.
  return false;
}

async function requireEntityAccess(
  req: AuthenticatedRequest,
  res: Response,
  entityType: AttachmentEntityType,
  entityId: string,
) {
  const allowed = await canAccessEntity(req, entityType, entityId);
  if (!allowed) {
    res.status(403).json({ error: "غير مسموح بالوصول إلى مرفقات هذا السجل" });
    return false;
  }
  return true;
}

export function registerAttachmentRoutes(app: Express) {
  // قائمة مرفقات كيان معيّن (بلا محتوى — المحتوى يُجلب عند التنزيل فقط).
  // الاستعلام بمعاملات لا بمسار، حتى لا يلتبس بمسار التنزيل /:id/download
  app.get("/api/attachments", isAuthenticated, async (req, res) => {
    try {
      const entityType = String(req.query.entityType ?? "");
      const entityId = String(req.query.entityId ?? "");
      if (!ENTITY_TYPES.includes(entityType as AttachmentEntityType)) {
        return res.status(400).json({ error: "نوع كيان غير معروف" });
      }
      if (!entityId) return res.status(400).json({ error: "معرّف الكيان مطلوب" });

      if (!(await requireEntityAccess(req as AuthenticatedRequest, res, entityType as AttachmentEntityType, entityId))) {
        return;
      }

      res.json(await storage.getAttachments(entityType, entityId));
    } catch (error) {
      console.error("List attachments error:", error);
      res.status(500).json({ error: "تعذر جلب المرفقات" });
    }
  });

  app.post("/api/attachments", isAuthenticated, async (req, res) => {
    try {
      const data = uploadSchema.parse(req.body);
      if (!(await requireEntityAccess(req as AuthenticatedRequest, res, data.entityType, data.entityId))) {
        return;
      }

      const body = Buffer.from(data.content, "base64");
      const sizeBytes = body.length;
      if (sizeBytes === 0) {
        return res.status(400).json({ error: "الملف فارغ أو مشفّر بصيغة غير صالحة" });
      }
      if (sizeBytes > MAX_ATTACHMENT_BYTES) {
        return res.status(400).json({ error: "حجم الملف يتجاوز 1 ميغابايت — اضغط الصورة ثم أعد المحاولة" });
      }
      if (!hasValidSignature(data.mimeType, body)) {
        return res.status(400).json({ error: "محتوى الملف لا يطابق نوعه المعلن" });
      }

      // في الإنتاج يفضّل ATTACHMENT_STORAGE_MODE=s3؛ fallback يحافظ على تشغيل النسخ القديمة أثناء الترحيل.
      const externalObject = await putAttachmentObject({
        entityType: data.entityType,
        entityId: data.entityId,
        fileName: data.fileName,
        mimeType: data.mimeType,
        body,
      });
      const created = await storage.createAttachment({
        entityType: data.entityType,
        entityId: data.entityId,
        fileName: data.fileName,
        mimeType: data.mimeType,
        sizeBytes,
        storageKey: externalObject?.key ?? null,
        storageUrl: null,
        content: externalObject ? null : data.content,
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

      if (!(await requireEntityAccess(req as AuthenticatedRequest, res, attachment.entityType as AttachmentEntityType, attachment.entityId))) {
        return;
      }

      const body = attachment.storageKey
        ? await getAttachmentObject(attachment.storageKey)
        : attachment.content
          ? Buffer.from(attachment.content, "base64")
          : null;
      if (!body) return res.status(404).json({ error: "محتوى المرفق غير متاح" });

      /**
       * ملفٌ رفعه مستخدم يُقدَّم من أصل الصندوق نفسه، فيُقيَّد بأضيق ما يمكن:
       * لا تخمين للنوع، ولا نصّ برمجي، ولا شيء يُحمَّل معه. وPDF ينزل تنزيلاً
       * لا يُفتح في الصفحة — قارئ PDF يشغّل ما فيه من نصوص برمجية.
       *
       * فحص البصمة عند الرفع يمنع ملفاً يدّعي نوعاً ليس له، لكن ملفاً مزدوج
       * الرأس (بايتات PNG صحيحة ثم HTML) يمرّ منه — و`nosniff` هو ما يقطع
       * على المتصفح أن يخمّنه صفحة.
       */
      res.setHeader("Content-Type", attachment.mimeType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      const disposition = attachment.mimeType === "application/pdf" ? "attachment" : "inline";
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      );
      res.send(body);
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
