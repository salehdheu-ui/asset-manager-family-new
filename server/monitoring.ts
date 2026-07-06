import { storage } from "./storage";

// مراقبة أخطاء ذاتية: كل خطأ غير متوقع يُسجل في سجل التدقيق
// ويظهر للوصي في بطاقة «يحتاج انتباهك» — بلا خدمات خارجية
let lastRecordedAt = 0;

export function recordSystemError(error: unknown, context: string) {
  // كابح بسيط حتى لا يُغرق خطأ متكرر السجل
  const now = Date.now();
  if (now - lastRecordedAt < 5000) return;
  lastRecordedAt = now;

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? "").slice(0, 800) : null;

  storage.createAuditLog({
    action: "system_error",
    entityType: "system",
    entityId: null,
    actorUserId: null,
    actorName: "النظام",
    description: `خطأ نظام في ${context}: ${message}`.slice(0, 500),
    metadata: { context, stack },
  }).catch(() => {
    // فشل التسجيل نفسه لا يجب أن يُسقط العملية
  });
}

export function installProcessErrorHandlers() {
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason);
    recordSystemError(reason, "unhandledRejection");
  });
  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    recordSystemError(error, "uncaughtException");
  });
}
