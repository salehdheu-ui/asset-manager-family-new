import type { z } from "zod";
import { fromZodError } from "zod-validation-error";

/**
 * رفض متوقع يقع داخل معاملة قاعدة بيانات.
 *
 * الرد بـ res.status() من داخل المعاملة لا يُلغيها — فتُكتب الخطوات السابقة
 * رغم رفض الطلب. رمي هذا الخطأ بدلاً من ذلك يُرجِع المعاملة كاملة، ثم يُترجم
 * في catch إلى نفس الرد الذي كان سيُرسل.
 */
export class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "RequestError";
  }
}

// استجابة موحّدة لأخطاء التحقق — رسالة واضحة بدل تفاصيل Zod الخام
export function zodErrorResponse(error: z.ZodError) {
  return {
    message: "البيانات المدخلة غير صحيحة",
    details: fromZodError(error).message,
  };
}
