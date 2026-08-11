/**
 * تشخيص التثبيت على الجهاز نفسه.
 *
 * شروط التثبيت تُفحص على الخادم في `script/check-pwa.ts`، لكن أكثر ما يمنع
 * التثبيت لا يظهر هناك أصلاً: متصفح داخل تطبيق آخر لا يثبّت شيئاً، وكروم على
 * الآيفون لا يصنع إلا اختصاراً، وسفاري وحده يثبّت هناك. هذه أحكام تخصّ الجهاز
 * الذي في يد المستخدم، ولا تُعرف إلا من داخله.
 */

import { canInstall, isIos, isIosSafari, isStandalone } from "./pwa";

export type CheckState = "ok" | "warn" | "fail" | "info";

export interface CheckResult {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
}

export interface InstallDiagnosis {
  checks: CheckResult[];
  /** الخلاصة: ما الذي يفعله المستخدم الآن */
  verdict: { state: CheckState; title: string; detail: string };
  /** رابط فتح الصفحة في كروم — لمتصفحات داخل التطبيقات على أندرويد */
  chromeIntent: string | null;
}

const ua = () => navigator.userAgent;

/** متصفح مدمج داخل تطبيق آخر (واتساب، فيسبوك، إنستقرام…) لا يثبّت تطبيقات */
export function isInAppBrowser(): boolean {
  const agent = ua();

  // أندرويد: WebView تعلن عن نفسها بـ wv
  if (/\bwv\b/.test(agent)) return true;

  // بصمات التطبيقات الشائعة على النظامين
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|Twitter|TikTok|MicroMessenger/i.test(agent)) {
    return true;
  }

  // iOS: سفاري الحقيقي يذكر Version/x.y؛ المتصفح المدمج لا يذكرها
  if (isIos() && /Safari/.test(agent) && !/Version\//.test(agent) && !/CriOS|FxiOS|EdgiOS/.test(agent)) {
    return true;
  }

  return false;
}

export function browserName(): string {
  const agent = ua();
  if (/EdgiOS|Edg\//.test(agent)) return "إيدج";
  if (/CriOS/.test(agent)) return "كروم على الآيفون";
  if (/FxiOS|Firefox/.test(agent)) return "فَيرفُكس";
  if (/SamsungBrowser/.test(agent)) return "متصفح سامسونج";
  if (/OPR\/|OPiOS/.test(agent)) return "أوبرا";
  if (/Chrome\//.test(agent)) return "كروم";
  if (/Safari/.test(agent)) return "سفاري";
  return "متصفح غير معروف";
}

async function manifestCheck(): Promise<CheckResult> {
  const link = document.querySelector('link[rel="manifest"]');
  if (!link) {
    return { id: "manifest", label: "بيان التطبيق", state: "fail", detail: "الصفحة لا تشير إلى ملف البيان" };
  }

  try {
    const response = await fetch("/manifest.webmanifest", { cache: "no-store" });
    if (!response.ok) {
      return { id: "manifest", label: "بيان التطبيق", state: "fail", detail: `الملف يرد بالحالة ${response.status}` };
    }

    const manifest = await response.json();
    const standalone = ["standalone", "fullscreen", "minimal-ui"].includes(manifest.display);
    const icons = Array.isArray(manifest.icons) ? manifest.icons.length : 0;

    if (!standalone) {
      return { id: "manifest", label: "بيان التطبيق", state: "fail", detail: `نمط العرض «${manifest.display}» يعني اختصاراً لا تطبيقاً` };
    }

    return { id: "manifest", label: "بيان التطبيق", state: "ok", detail: `${manifest.name} — ${icons} أيقونات، عرض مستقل` };
  } catch (error) {
    return { id: "manifest", label: "بيان التطبيق", state: "fail", detail: "تعذّرت قراءة الملف" };
  }
}

async function serviceWorkerCheck(): Promise<CheckResult> {
  if (!("serviceWorker" in navigator)) {
    return { id: "sw", label: "عامل الخدمة", state: "fail", detail: "هذا المتصفح لا يدعمه — ولا يثبّت تطبيقات" };
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    return { id: "sw", label: "عامل الخدمة", state: "fail", detail: "غير مسجَّل — أعد تحميل الصفحة" };
  }

  const active = Boolean(registration.active);
  return {
    id: "sw",
    label: "عامل الخدمة",
    state: active ? "ok" : "warn",
    detail: active ? "مسجَّل وفعّال" : "مسجَّل وما زال يُنصَّب",
  };
}

/** يفحص كل ما يحكم التثبيت على هذا الجهاز، ويخلص إلى خطوة واحدة */
export async function diagnoseInstall(): Promise<InstallDiagnosis> {
  const checks: CheckResult[] = [];
  const installed = isStandalone();
  const inApp = isInAppBrowser();
  const secure = window.isSecureContext;

  checks.push({
    id: "mode",
    label: "طريقة التشغيل الحالية",
    state: installed ? "ok" : "info",
    detail: installed
      ? "يعمل الآن كتطبيق مثبَّت"
      : inApp
        ? "مفتوح داخل متصفح تطبيق آخر"
        : `مفتوح داخل ${browserName()}`,
  });

  checks.push({
    id: "secure",
    label: "الاتصال المؤمَّن",
    state: secure ? "ok" : "fail",
    detail: secure
      ? location.protocol.replace(":", "")
      : "بدون https لا يقبل أي متصفح تثبيت تطبيق",
  });

  checks.push({
    id: "browser",
    label: "المتصفح",
    state: inApp ? "fail" : isIos() && !isIosSafari() ? "fail" : "ok",
    detail: inApp
      ? "متصفح مدمج داخل تطبيق آخر — لا يثبّت تطبيقات إطلاقاً"
      : isIos() && !isIosSafari()
        ? `${browserName()} على الآيفون لا يصنع إلا اختصاراً — التثبيت من سفاري وحده`
        : browserName(),
  });

  checks.push(await manifestCheck());
  checks.push(await serviceWorkerCheck());

  checks.push({
    id: "prompt",
    label: "عرض التثبيت من المتصفح",
    state: canInstall() ? "ok" : isIos() ? "info" : "warn",
    detail: canInstall()
      ? "جاهز — زر التثبيت يعمل الآن"
      : isIos()
        ? "الآيفون لا يعطي زراً — التثبيت يدوي من قائمة المشاركة"
        : "لم يصل عرض التثبيت بعد",
  });

  const chromeIntent =
    !isIos() && inApp
      ? `intent://${location.host}${location.pathname}#Intent;scheme=${location.protocol.replace(":", "")};package=com.android.chrome;end`
      : null;

  const verdict = ((): InstallDiagnosis["verdict"] => {
    if (installed) {
      return { state: "ok", title: "التطبيق مثبَّت", detail: "أنت تستعمله الآن كتطبيق، لا كصفحة في متصفح." };
    }
    if (!secure) {
      return { state: "fail", title: "الرابط ليس مؤمَّناً", detail: "افتح الموقع برابط https ثم أعد المحاولة." };
    }
    if (inApp) {
      return {
        state: "fail",
        title: "أنت داخل متصفح تطبيق آخر",
        detail:
          "فتح الرابط من واتساب أو غيره يفتحه في متصفح مصغّر لا يثبّت تطبيقات — وما يضعه على الشاشة اختصار لا أكثر. انسخ الرابط وافتحه في كروم أو سفاري.",
      };
    }
    if (isIos() && !isIosSafari()) {
      return {
        state: "fail",
        title: "على الآيفون سفاري وحده يثبّت",
        detail: `${browserName()} يضع اختصاراً يفتح المتصفح. افتح الرابط في سفاري ثم: زر المشاركة ← «إضافة إلى الشاشة الرئيسية».`,
      };
    }
    if (isIos()) {
      return {
        state: "info",
        title: "خطوتان في سفاري",
        detail: "اضغط زر المشاركة في شريط سفاري، ثم «إضافة إلى الشاشة الرئيسية». الأيقونة الناتجة تفتح بلا شريط متصفح.",
      };
    }

    const broken = checks.find((check) => check.state === "fail");
    if (broken) {
      return { state: "fail", title: `يعوق التثبيت: ${broken.label}`, detail: broken.detail };
    }
    if (canInstall()) {
      return { state: "ok", title: "جاهز للتثبيت", detail: "اضغط «تثبيت التطبيق» — يُضاف تطبيقاً كاملاً في قائمة تطبيقات جهازك." };
    }
    return {
      state: "warn",
      title: "الشروط مستوفاة والعرض لم يصل",
      detail:
        "ثبّته من قائمة المتصفح (⋮) ← «تثبيت التطبيق». وإن كنت ثبّتّه سابقاً كاختصار فاحذف الأيقونة القديمة أولاً — أندرويد لا يرقّي اختصاراً قائماً إلى تطبيق.",
    };
  })();

  return { checks, verdict, chromeIntent };
}

/** تقرير نصي مختصر يُنسخ ويُرسل عند طلب المساعدة */
export function diagnosisReport(diagnosis: InstallDiagnosis): string {
  const lines = diagnosis.checks.map((check) => `${check.label}: ${check.state} — ${check.detail}`);
  return [
    `الخلاصة: ${diagnosis.verdict.title}`,
    ...lines,
    `المتصفح: ${navigator.userAgent}`,
    `الرابط: ${location.origin}`,
  ].join("\n");
}
