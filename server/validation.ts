import type { z } from "zod";
import { fromZodError } from "zod-validation-error";

// استجابة موحّدة لأخطاء التحقق — رسالة واضحة بدل تفاصيل Zod الخام
export function zodErrorResponse(error: z.ZodError) {
  return {
    message: "البيانات المدخلة غير صحيحة",
    details: fromZodError(error).message,
  };
}
