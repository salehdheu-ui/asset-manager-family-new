/**
 * تسجيل عامل الخدمة وأدوات التثبيت والإشعارات.
 *
 * كل ما يخص PWA مجمّع هنا حتى تبقى المكوّنات معنية بالعرض فقط.
 */

/** حدث Chrome الذي يتيح استدعاء نافذة التثبيت متى شئنا */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa:install-dismissed";
const PUSH_ASKED_KEY = "pwa:push-asked";

/** التطبيق يعمل مثبَّتاً، لا داخل متصفح */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // سفاري على iOS لا يدعم display-mode، وله علمه الخاص
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  const ua = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS يتنكّر في هيئة سطح مكتب منذ الإصدار 13
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** التثبيت على iOS متاح من سفاري وحده — بقية المتصفحات هناك لا زر مشاركة فيها يثبّت */
export function isIosSafari(): boolean {
  if (!isIos()) return false;
  const ua = window.navigator.userAgent;
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function hasDismissedInstall(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    // التصفح الخاص قد يمنع التخزين — الأسلم ألا نلحّ
    return true;
  }
}

export function rememberInstallDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, new Date().toISOString());
  } catch {
    /* لا شيء نفعله — أسوأ ما يحدث ظهور البطاقة مرة أخرى */
  }
}

/** يمسح أثر التجاوز ليعود عرض التثبيت — تستدعيه الإعدادات عند طلب المستخدم */
export function forgetInstallDismissed() {
  try {
    localStorage.removeItem(DISMISSED_KEY);
  } catch {
    /* تجاهل */
  }
}

/**
 * هل عُرض على المستخدم تفعيل الإشعارات من قبل؟
 *
 * العرض مرة واحدة لا غير — بعدها مكانه صفحة «حسابي» متى أرادها. الإلحاح
 * يجعل المستخدم يرفض بلا قراءة، والرفض في المتصفح قرار لا رجعة فيه من داخل
 * الصفحة.
 */
export function hasAskedForPush(): boolean {
  try {
    return localStorage.getItem(PUSH_ASKED_KEY) !== null;
  } catch {
    return true;
  }
}

export function rememberPushAsked() {
  try {
    localStorage.setItem(PUSH_ASKED_KEY, new Date().toISOString());
  } catch {
    /* لا شيء نفعله */
  }
}

// ————— حدث التثبيت —————

/**
 * حدث `beforeinstallprompt` يُطلق مرة واحدة، وغالباً قبل أن يركّب React شيئاً.
 * لذا يُلتقط هنا عند تحميل الوحدة ويُحتفظ به، فتجده المكوّنات جاهزاً متى ركّبت
 * بدل أن تنتظر حدثاً مضى. وهو أيضاً حدث لا يُستهلك إلا مرة، فمكانه الطبيعي
 * موضع واحد يشترك فيه الجميع لا نسخة في كل مكوّن.
 */
let deferredPrompt: InstallPromptEvent | null = null;
const promptWatchers = new Set<(event: InstallPromptEvent | null) => void>();

function announce() {
  // forEach لا for…of: هدف الترجمة الحالي لا يكرّر Set إلا بعلم downlevelIteration
  promptWatchers.forEach((watcher) => watcher(deferredPrompt));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // المنع يوقف شريط المتصفح التلقائي، فيبقى التوقيت بيدنا
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    announce();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    rememberInstallDismissed();
    announce();
  });
}

export function installPrompt(): InstallPromptEvent | null {
  return deferredPrompt;
}

/** يشترك في تغيّر توفر التثبيت، ويعيد دالة إلغاء الاشتراك */
export function watchInstallPrompt(
  watcher: (event: InstallPromptEvent | null) => void,
): () => void {
  promptWatchers.add(watcher);
  return () => promptWatchers.delete(watcher);
}

/** هل يستطيع هذا المتصفح تثبيت التطبيق تثبيتاً حقيقياً بضغطة زر؟ */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/**
 * يفتح نافذة التثبيت. الحدث يُستهلك بالاستدعاء الأول فلا يُعاد استعماله —
 * ننساه بعده حتى لا يظهر زر تثبيت لا يفعل شيئاً.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferredPrompt;
  if (!event) return "unavailable";

  deferredPrompt = null;
  announce();

  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

// ————— عامل الخدمة —————

let waitingWorker: ServiceWorker | null = null;

/**
 * يسجّل عامل الخدمة ويخبر عند توفر نسخة جديدة.
 *
 * لا يفعّل التحديث تلقائياً: `onUpdateReady` تعرض على المستخدم إعادة التحميل،
 * فلا يُقطع إدخال بيانات في منتصفه.
 */
export function registerServiceWorker(options: {
  onUpdateReady?: () => void;
  onNavigate?: (url: string) => void;
} = {}) {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "navigate" && options.onNavigate) {
      options.onNavigate(event.data.url);
    }
  });

  const register = () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            // وجود متحكم حالي يعني أن هذه نسخة أحدث، لا أول تثبيت
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              waitingWorker = installing;
              options.onUpdateReady?.();
            }
          });
        });
      })
      .catch(() => {
        // التطبيق يعمل بلا عامل خدمة — لا داعي لإزعاج المستخدم
      });
  };

  // React يركّب المكوّنات بعد حدث load غالباً، فالانتظار غير المشروط له
  // يعني ألا يُسجَّل عامل الخدمة أبداً. نؤجّل فقط إن كانت الصفحة ما زالت تحمّل.
  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}

/** يطبّق التحديث المنتظر ويعيد تحميل الصفحة عليه */
export function applyUpdate() {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
    once: true,
  });
  waitingWorker.postMessage("skip-waiting");
}

// ————— الإشعارات —————

export type PushSupport = "ready" | "unsupported" | "needs-install";

/**
 * هل يستطيع هذا الجهاز استقبال إشعارات؟
 *
 * على iOS لا تصل الإشعارات إلا بعد تثبيت التطبيق على الشاشة الرئيسية
 * (منذ iOS 16.4)، فيلزم التمييز بين "غير مدعوم" و"يلزمه التثبيت أولاً".
 */
export function pushSupport(): PushSupport {
  // على iOS الحكم للتثبيت لا لوجود الواجهات: النظام لا يوصل إشعاراً لصفحة في
  // المتصفح مهما بدت واجهات الإشعارات متاحة فيها. الفحص قبل بقية الشروط حتى
  // يرى مستخدم الآيفون خطوات التثبيت بدل رسالة "غير مدعوم" التي لا تفيده.
  if (isIos() && !isStandalone()) return "needs-install";

  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  return "ready";
}

export function notificationPermission(): NotificationPermission | "unavailable" {
  return "Notification" in window ? Notification.permission : "unavailable";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** هل عُقد هذا الاشتراك بمفتاح الخادم الحالي؟ */
function sameKey(subscribed: ArrayBuffer | null | undefined, current: Uint8Array): boolean {
  if (!subscribed) return false;
  const bytes = new Uint8Array(subscribed);
  if (bytes.length !== current.length) return false;
  return bytes.every((byte, index) => byte === current[index]);
}

/**
 * يطلب إذن الإشعارات ويسجّل الاشتراك على الخادم.
 *
 * لا يُستدعى إلا من ضغطة صريحة على زر — الطلب التلقائي عند فتح الصفحة يدفع
 * المتصفحات لحجب الطلب نهائياً، فيخسر المستخدم الخيار بلا رجعة.
 */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (pushSupport() !== "ready") {
    return { ok: false, reason: "هذا الجهاز لا يدعم الإشعارات" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "لم يُمنح إذن الإشعارات" };
  }

  const keyResponse = await fetch("/api/push/public-key", { credentials: "include" });
  if (!keyResponse.ok) {
    return { ok: false, reason: "الإشعارات غير مهيأة على الخادم" };
  }
  const { publicKey } = await keyResponse.json();
  if (!publicKey) {
    return { ok: false, reason: "الإشعارات غير مهيأة على الخادم" };
  }

  const registration = await navigator.serviceWorker.ready;
  const serverKey = urlBase64ToUint8Array(publicKey);

  let existing = await registration.pushManager.getSubscription();
  // اشتراك معقود بمفتاح قديم لا يصله شيء، ولا يخبرك المتصفح بذلك. نفضّ الاشتراك
  // القديم ونعقد غيره بالمفتاح الحالي بدل أن يظن المستخدم أن الإشعارات مفعّلة.
  if (existing && !sameKey(existing.options.applicationServerKey, serverKey)) {
    await existing.unsubscribe().catch(() => undefined);
    existing = null;
  }

  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKey as BufferSource,
    }));

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      platform: isIos() ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "desktop",
    }),
  });

  if (!response.ok) {
    return { ok: false, reason: "تعذر حفظ الاشتراك" };
  }

  return { ok: true };
}

/** يلغي اشتراك هذا الجهاز على الخادم وفي المتصفح */
export async function disablePush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await fetch("/api/push/unsubscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);

  await subscription.unsubscribe();
}

/** هل لهذا الجهاز اشتراك فعّال؟ */
export async function isPushEnabled(): Promise<boolean> {
  if (pushSupport() !== "ready" || Notification.permission !== "granted") return false;
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) !== null;
}
