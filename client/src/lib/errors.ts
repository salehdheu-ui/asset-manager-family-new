// استخراج رسالة خطأ مفهومة من استجابات الخادم أو أخطاء الشبكة
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "تعذر الاتصال بالخادم. حاول تحديث الصفحة ثم أعد المحاولة.";
    }
    try {
      const match = error.message.match(/^\d+:\s*([\s\S]+)$/);
      if (match) {
        const parsed = JSON.parse(match[1]);
        if (typeof parsed.error === "string") return parsed.error;
        if (Array.isArray(parsed.error) && parsed.error[0]?.message) return parsed.error[0].message;
        if (typeof parsed.message === "string") return parsed.message;
        if (typeof parsed.details === "string") return parsed.details;
      }
    } catch {}
    return error.message;
  }
  return "حدث خطأ غير متوقع";
}
