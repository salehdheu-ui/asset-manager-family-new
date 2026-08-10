/**
 * عامل الخدمة — التخزين المؤقت والإشعارات.
 *
 * قاعدة تحكم كل شيء هنا: **لا يُخزَّن أي رد من /api مؤقتاً إطلاقاً.** أرقام
 * الصندوق يجب أن تكون الأحدث دائماً؛ رصيدٌ قديم معروض بثقة أسوأ من رسالة
 * "لا اتصال". المخزَّن هو قشرة التطبيق وملفاته الثابتة فقط.
 *
 * ارفع رقم النسخة عند تغيير منطق هذا الملف — يُنظَّف كل ما قبله عند التفعيل.
 */
const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

// أقل ما يلزم لفتح التطبيق بلا شبكة. ملفات البناء مجزّأة بصمات فريدة
// فتُخزَّن عند أول طلب لها بدل سردها هنا.
const SHELL_FILES = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== SHELL_CACHE && name !== ASSET_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// الصفحة تطلب تفعيل النسخة الجديدة بعد موافقة المستخدم، لا قبلها —
// التحديث في منتصف إدخال بيانات يفقد ما كُتب
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // بيانات الصندوق لا تُخزَّن ولا تُعترض
  if (url.pathname.startsWith("/api/")) return;

  // التنقّل: الشبكة أولاً ليصل أحدث بناء، والقشرة المخزَّنة عند انقطاعها
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // صفحة خطأ لا تصلح قشرةً احتياطية — لو خزّناها لبقي المستخدم عالقاً فيها
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put("/", response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match("/", { cacheName: SHELL_CACHE });
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // ملفات البناء تحمل بصمة محتواها في اسمها، والأيقونات ثابتة —
  // هذه وحدها تؤخذ من المخزن مباشرة، وما عداها يبقى للشبكة الكلمة الأولى
  const isImmutable = url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/");

  event.respondWith(
    (async () => {
      if (isImmutable) {
        const cached = await caches.match(request, { cacheName: ASSET_CACHE });
        if (cached) return cached;
      }

      try {
        const response = await fetch(request);
        if (isImmutable && response.ok && response.type === "basic") {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw error;
      }
    })(),
  );
});

// ————— الإشعارات —————

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "صندوق العائلة";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      dir: "rtl",
      lang: "ar",
      // نفس الوسم يستبدل الإشعار السابق بدل تكديس نسخ منه
      tag: payload.tag || "family-fund",
      renotify: Boolean(payload.tag),
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // التطبيق مفتوح: انقله للصفحة المقصودة بدل فتح نافذة ثانية
      for (const client of windows) {
        if (new URL(client.url).origin === target.origin) {
          await client.focus();
          client.postMessage({ type: "navigate", url: target.pathname + target.search });
          return;
        }
      }

      await self.clients.openWindow(target.href);
    })(),
  );
});
