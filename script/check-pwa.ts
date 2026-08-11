/**
 * يفحص شروط تثبيت التطبيق على خادم يعمل.
 *
 * السبب: الفرق بين «تطبيق مثبَّت» و«اختصار على الشاشة» ليس إعداداً واحداً بل
 * قائمة شروط يتحقق منها المتصفح بصمت — يسقط شرط واحد فيهبط التثبيت إلى اختصار
 * بلا رسالة خطأ في أي مكان. هذا الملف يفحصها شرطاً شرطاً ويقول أيها سقط.
 *
 *   npx tsx script/check-pwa.ts [http://127.0.0.1:5000]
 *
 * بلا اعتماديات: طلبات HTTP وقارئ ترويسة PNG المحلي فقط، فيصلح للتشغيل على
 * الخادم الحقيقي بعد النشر كما يصلح محلياً.
 */
import { pngSizeOf } from "./png.ts";

const ORIGIN = (process.argv[2] ?? "http://127.0.0.1:5000").replace(/\/$/, "");

let failures = 0;

function pass(label: string, detail = "") {
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label: string, detail: string) {
  failures += 1;
  console.log(`  ✗ ${label} — ${detail}`);
}

function check(label: string, condition: boolean, detail: string) {
  if (condition) pass(label);
  else fail(label, detail);
}

async function get(path: string): Promise<{ status: number; body: Buffer; type: string }> {
  const response = await fetch(ORIGIN + path, { redirect: "manual" });
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, body, type: response.headers.get("content-type") ?? "" };
}

/** يتحقق أن الملف موجود وأن أبعاده الحقيقية تطابق المعلن عنها */
async function checkImage(src: string, declared: string, label: string) {
  const response = await get(src);
  if (response.status !== 200) return fail(label, `${src} ← ${response.status}`);

  try {
    const { width, height } = pngSizeOf(response.body);
    const actual = `${width}x${height}`;
    if (actual !== declared) fail(label, `${src} أبعاده ${actual} والمعلن ${declared}`);
    else pass(label, `${src} (${actual})`);
  } catch (error) {
    fail(label, `${src} ليس PNG صالحاً`);
  }
}

console.log(`فحص شروط التثبيت على ${ORIGIN}\n`);

// ————— الصفحة —————
console.log("الصفحة:");
const page = await get("/");
check("الصفحة تُقدَّم", page.status === 200, `الحالة ${page.status}`);
const html = page.body.toString("utf8");
check("رابط البيان موجود", /rel="manifest"/.test(html), "لا وسم <link rel=manifest>");
check(
  "وسوم iOS موجودة",
  /apple-mobile-web-app-capable/.test(html) && /rel="apple-touch-icon"/.test(html),
  "ينقص apple-mobile-web-app-capable أو apple-touch-icon",
);

const splashTags = [...html.matchAll(/rel="apple-touch-startup-image"[^>]*href="([^"]+)"/g)].map(
  (match) => match[1],
);
check("شاشات إقلاع iOS معلنة", splashTags.length > 0, "لا وسم apple-touch-startup-image");

// ————— البيان —————
console.log("\nالبيان:");
const manifestResponse = await get("/manifest.webmanifest");
check("البيان يُقدَّم", manifestResponse.status === 200, `الحالة ${manifestResponse.status}`);

let manifest: any = {};
try {
  manifest = JSON.parse(manifestResponse.body.toString("utf8"));
  pass("البيان JSON صالح");
} catch {
  fail("البيان JSON صالح", "تعذّر تحليل الملف");
}

for (const field of ["name", "short_name", "start_url", "scope", "id", "description"]) {
  check(`الحقل ${field}`, Boolean(manifest[field]), "مفقود");
}

check(
  "نمط العرض مستقل",
  ["standalone", "fullscreen", "minimal-ui"].includes(manifest.display),
  `display = ${manifest.display} — «browser» يعني اختصاراً لا تطبيقاً`,
);
check("لون الخلفية معلن", Boolean(manifest.background_color), "بدونه تومض شاشة بيضاء عند الإقلاع");
check("لون السمة معلن", Boolean(manifest.theme_color), "مفقود");
check(
  "لا إحالة لتطبيق متجر",
  manifest.prefer_related_applications !== true,
  "prefer_related_applications=true يمنع التثبيت",
);

// ————— الأيقونات —————
console.log("\nالأيقونات:");
const icons: any[] = Array.isArray(manifest.icons) ? manifest.icons : [];
const purposeOf = (icon: any) => String(icon.purpose ?? "any").split(/\s+/);

for (const size of ["192x192", "512x512"]) {
  check(
    `أيقونة ${size} للاستعمال العام`,
    icons.some((icon) => icon.sizes === size && purposeOf(icon).includes("any")),
    "شرط إلزامي لبناء تطبيق حقيقي على أندرويد",
  );
}
check(
  "أيقونة قابلة للقص",
  icons.some((icon) => purposeOf(icon).includes("maskable")),
  "بدونها تُحاط الأيقونة بمربع أبيض على أندرويد",
);

for (const icon of icons) await checkImage(icon.src, icon.sizes, "ملف الأيقونة");

// ————— اللقطات —————
console.log("\nلقطات نافذة التثبيت:");
const shots: any[] = Array.isArray(manifest.screenshots) ? manifest.screenshots : [];
const narrow = shots.filter((shot) => shot.form_factor === "narrow");
check("لقطة واحدة للجوال على الأقل", narrow.length > 0, "بدونها يظهر شريط تثبيت مصغّر بدل نافذة التطبيق");

const ratios = new Set<string>();
for (const shot of shots) {
  const [width, height] = String(shot.sizes).split("x").map(Number);
  const ratio = Math.max(width, height) / Math.min(width, height);
  if (shot.form_factor === "narrow") ratios.add(ratio.toFixed(3));
  check(
    `نسبة ${shot.src}`,
    ratio <= 2.3 && Math.min(width, height) >= 320 && Math.max(width, height) <= 3840,
    `الأبعاد ${shot.sizes} خارج ما يقبله كروم`,
  );
  await checkImage(shot.src, shot.sizes, "ملف اللقطة");
}
check("لقطات الجوال بنسبة واحدة", ratios.size <= 1, `نسب مختلفة: ${[...ratios].join("، ")}`);

// ————— عامل الخدمة —————
console.log("\nعامل الخدمة:");
const sw = await get("/sw.js");
check("الملف يُقدَّم", sw.status === 200, `الحالة ${sw.status}`);
const swSource = sw.body.toString("utf8");
check(
  "فيه معالج fetch",
  /addEventListener\(\s*["']fetch["']/.test(swSource),
  "بلا معالج fetch لا يعتبره كروم تطبيقاً قابلاً للتثبيت",
);
check(
  "بيانات /api غير مخزَّنة",
  /pathname\.startsWith\(\s*["']\/api\//.test(swSource),
  "يجب أن يمرّ /api إلى الشبكة دائماً",
);
check("فيه معالج push", /addEventListener\(\s*["']push["']/.test(swSource), "مفقود");

// ————— نقطة البدء وشاشات الإقلاع —————
console.log("\nالملفات المرتبطة:");
const startUrl = new URL(manifest.start_url ?? "/", ORIGIN);
const start = await get(startUrl.pathname + startUrl.search);
check("start_url يستجيب", start.status === 200, `الحالة ${start.status}`);

for (const src of splashTags) {
  const declared = /splash-(\d+x\d+)\.png$/.exec(src)?.[1];
  if (!declared) {
    fail("ملف شاشة الإقلاع", `${src} لا يحمل مقاسه في اسمه`);
    continue;
  }
  await checkImage(src, declared, "ملف شاشة الإقلاع");
}

console.log(
  failures === 0
    ? "\nكل الشروط مستوفاة — التثبيت يبني تطبيقاً لا اختصاراً."
    : `\n${failures} شرط لم يُستوفَ.`,
);
process.exit(failures === 0 ? 0 : 1);
