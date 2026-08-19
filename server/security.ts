import rateLimit from "express-rate-limit";
import type { NextFunction, Request, Response } from "express";

/**
 * ترويسات الأمان وحدّ المعدّل العام.
 *
 * لم يكن للتطبيق ترويسة أمان واحدة: لا `nosniff` ولا سياسة محتوى ولا منع
 * تأطير. وهذا يهمّ هنا بعينه لأن التطبيق **يقدّم ملفات رفعها المستخدمون**
 * على أصله نفسه؛ فبلا `nosniff` يجوز للمتصفح أن يخمّن نوع ملفٍ مزدوج الرأس
 * (بايتات PNG في أوله وHTML بعدها) فيشغّله صفحةً داخل أصل الصندوق.
 *
 * وحدّ المعدّل كان على خمسة مسارات فقط — الدخول والاستعادة وكتابات الوصي —
 * وما عداها مفتوح: التقارير التي تمسح كل الجداول، وقوائم الاقتراحات
 * باستعلاميها لكل اقتراح. حدٌّ عام سخيّ لا يضايق الاستعمال الطبيعي ويقطع
 * الإغراق.
 */

const SELF = "'self'";

/**
 * سياسة المحتوى.
 *
 * `'unsafe-inline'` للأنماط لا مفرّ منه: framer-motion يكتب `style` على
 * العناصر، وTailwind يحقن متغيرات. أما النصوص البرمجية فبناء Vite كله ملفات
 * خارجية بلا سطر مضمّن، فتبقى `script-src` ضيّقة كما ينبغي.
 */
const CSP = [
  `default-src ${SELF}`,
  `script-src ${SELF}`,
  `style-src ${SELF} 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src ${SELF} https://fonts.gstatic.com data:`,
  `img-src ${SELF} data: blob:`,
  `connect-src ${SELF}`,
  `manifest-src ${SELF}`,
  `worker-src ${SELF}`,
  `object-src 'none'`,
  `base-uri ${SELF}`,
  `form-action ${SELF}`,
  `frame-ancestors 'none'`,
].join("; ");

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Content-Security-Policy", CSP);

  // HSTS على الاتصال المؤمَّن وحده — إرسالها على http لا معنى له، وعلى
  // نطاق محلي يحبس المتصفح على https لا يستطيعها
  if (req.secure) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }

  next();
}

/**
 * حدّ عام لكل ما تحت `/api`.
 *
 * سخيّ عمداً: صفحة واحدة قد تطلق عشر نداءات، والعائلة كلها قد تخرج من عنوان
 * واحد. المقصود قطع الإغراق لا مضايقة الاستعمال.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  // فحص الصحة تستدعيه منصّة النشر كل دقيقة — لا يُحسب على أحد
  skip: (req) => req.path === "/health" || req.path === "/api/health",
  message: { message: "طلبات كثيرة خلال فترة قصيرة، يُرجى المهلة قليلاً" },
});

/**
 * مفاتيح لا تُكتب قيمتها في سجل الخادم بحال.
 *
 * `code` أخطرها: مسار إصدار كود الاستعادة يردّ الكود نصاً مرة واحدة، وتعليقه
 * يقول إنه «لا يُخزَّن نصاً في أي مكان» — وكان مسجّل الطلبات يكذّبه ويكتبه في
 * سجل الخادم، صالحاً ثلاثين دقيقة، لمن يقرأ السجل.
 */
const SECRET_KEYS = /^(code|password|newPassword|token|secret|codeHash|vapid|privateKey|auth|p256dh|endpoint)$/i;

/** يستبدل قيم المفاتيح الحسّاسة بعلامة، مهما عمق تداخلها */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));

  // التاريخ والمخزن المؤقت ليسا كائنَي حقول: المشي عليهما يفرّغهما إلى {}
  // فيصير سطر السجل أقلّ نفعاً مما كان
  if (value instanceof Date || Buffer.isBuffer(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEYS.test(key) ? "[محجوب]" : redactSecrets(v, depth + 1);
  }
  return out;
}
