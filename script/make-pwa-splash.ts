/**
 * يولّد شاشات الإقلاع لتطبيق iOS المثبَّت.
 *
 * أندرويد يبني شاشة إقلاعه وحده من البيان (الأيقونة + `background_color`)، أما
 * iOS فلا يعرف إلا صوراً جاهزة بمقاس الجهاز بالضبط عبر `apple-touch-startup-image`.
 * بدونها يفتح التطبيق على شاشة بيضاء فارغة — وهذه أول ما يميّز الاختصار عن
 * التطبيق في عين المستخدم.
 *
 * يُشغَّل يدوياً عند تغيّر الشعار أو الألوان: `npx tsx script/make-pwa-splash.ts`.
 * الناتج محفوظ في المستودع، والوسوم المقابلة له في `client/index.html`.
 */
import { mkdirSync, readdirSync, rmSync } from "fs";
import path from "path";
import { drawInto, resize, solid, writePng, type Raster } from "./png.ts";
import { BACKGROUND, BRAND, loadBrandMark } from "./brand-mark.ts";

const OUT_DIR = path.resolve(import.meta.dirname, "../client/public/splash");

/**
 * مقاسات الشاشات التي يغطيها الملف.
 *
 * `width`/`height` بوحدات CSS كما يراها استعلام الوسائط، و`scale` نسبة البكسلات.
 * المقاس المفقود لا يكسر شيئاً: يعود iOS حينها إلى شاشة بلون الخلفية.
 */
const DEVICES = [
  { width: 320, height: 568, scale: 2 },   // SE الأول
  { width: 375, height: 667, scale: 2 },   // 8 / SE 2 و3
  { width: 375, height: 812, scale: 3 },   // X / XS / 11 Pro
  { width: 390, height: 844, scale: 3 },   // 12 / 13 / 14
  { width: 393, height: 852, scale: 3 },   // 14 Pro / 15 / 16
  { width: 402, height: 874, scale: 3 },   // 16 Pro
  { width: 414, height: 736, scale: 3 },   // 8 Plus
  { width: 414, height: 896, scale: 2 },   // XR / 11
  { width: 414, height: 896, scale: 3 },   // XS Max / 11 Pro Max
  { width: 428, height: 926, scale: 3 },   // 12 / 13 Pro Max
  { width: 430, height: 932, scale: 3 },   // 14 Pro Max / 15 Pro Max / 16 Plus
  { width: 440, height: 956, scale: 3 },   // 16 Pro Max
  { width: 768, height: 1024, scale: 2 },  // iPad
  { width: 820, height: 1180, scale: 2 },  // iPad Air
  { width: 834, height: 1194, scale: 2 },  // iPad Pro ١١
  { width: 1024, height: 1366, scale: 2 }, // iPad Pro ١٢٫٩
];

/** نصف قطر الزوايا نسبةً إلى ضلع المربع — يقارب شكل أيقونة iOS */
const CORNER = 0.225;

/** يقصّ زوايا المربع بحواف ناعمة ليبدو بلاطة تطبيق لا مربعاً حاداً */
function roundCorners(tile: Raster) {
  const radius = tile.width * CORNER;
  for (let y = 0; y < tile.height; y++) {
    for (let x = 0; x < tile.width; x++) {
      // أقرب مركز دائرة زاوية: خارج المربع الداخلي فقط تُحسب المسافة
      const dx = Math.max(radius - x - 0.5, x + 0.5 - (tile.width - radius), 0);
      const dy = Math.max(radius - y - 0.5, y + 0.5 - (tile.height - radius), 0);
      if (dx === 0 || dy === 0) continue;

      const distance = Math.hypot(dx, dy);
      // شريط بعرض بكسل واحد حول الحافة يتدرّج بدل أن يتسنّن
      const alpha = Math.min(Math.max(radius + 0.5 - distance, 0), 1);
      tile.data[(y * tile.width + x) * 4 + 3] = Math.round(alpha * 255);
    }
  }
}

const mark = loadBrandMark();

/** بلاطة التطبيق: الرمز داخل مربع بلون الهوية بزوايا مستديرة */
function appTile(size: number): Raster {
  const tile = solid(size, size, BRAND);
  const inner = Math.round(size * 0.62);
  drawInto(tile, resize(mark, inner, inner), Math.round((size - inner) / 2), Math.round((size - inner) / 2));
  roundCorners(tile);
  return tile;
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

for (const device of DEVICES) {
  const width = device.width * device.scale;
  const height = device.height * device.scale;

  const canvas = solid(width, height, BACKGROUND);
  // البلاطة بسدس عرض الشاشة تقريباً، وأعلى المنتصف قليلاً كما تفعل التطبيقات
  const tile = appTile(Math.round(Math.min(width, height) * 0.28));
  drawInto(canvas, tile, Math.round((width - tile.width) / 2), Math.round(height * 0.42 - tile.height / 2));

  const file = `splash-${width}x${height}.png`;
  writePng(path.join(OUT_DIR, file), canvas);
  console.log("✓", file);
}

const total = readdirSync(OUT_DIR).length;
console.log(`\n${total} شاشة إقلاع في client/public/splash`);
console.log("لا تنسَ مطابقة وسوم apple-touch-startup-image في client/index.html");
