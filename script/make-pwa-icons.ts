/**
 * يولّد أيقونات التطبيق من شعار الهوية.
 *
 * يُشغَّل يدوياً عند تغيّر الشعار فقط (`npx tsx script/make-pwa-icons.ts`)، لا في
 * كل بناء — الأيقونات الناتجة محفوظة في المستودع.
 */
import path from "path";
import { drawInto, resize, solid, writePng, type Raster } from "./png.ts";
import { BRAND, loadBrandMark } from "./brand-mark.ts";

const OUT_DIR = path.resolve(import.meta.dirname, "../client/public/icons");

/** يركّب الرمز في مربع بخلفية الهوية، بنسبة تشغل `coverage` من الضلع */
function compose(mark: Raster, size: number, coverage: number): Raster {
  const canvas = solid(size, size, BRAND);
  const inner = Math.round(size * coverage);
  drawInto(canvas, resize(mark, inner, inner), Math.round((size - inner) / 2), Math.round((size - inner) / 2));
  return canvas;
}

const mark = loadBrandMark();

const targets = [
  // الأيقونة العادية: هامش معتدل حول الرمز
  { file: "icon-192.png", size: 192, coverage: 0.78 },
  { file: "icon-512.png", size: 512, coverage: 0.78 },
  // القابلة للقص: النظام قد يقتطع حتى 20% من كل جهة، فالرمز داخل المنطقة الآمنة
  { file: "icon-maskable-192.png", size: 192, coverage: 0.56 },
  { file: "icon-maskable-512.png", size: 512, coverage: 0.56 },
  // أيقونة iOS: تُقص زواياها تلقائياً ولا تدعم الشفافية
  { file: "apple-touch-icon.png", size: 180, coverage: 0.72 },
];

for (const target of targets) {
  writePng(path.join(OUT_DIR, target.file), compose(mark, target.size, target.coverage));
  console.log("✓", target.file, `${target.size}×${target.size}`);
}

/**
 * شارة الإشعار: أندرويد يرسمها من قناة الشفافية وحدها ويصبغها بلون النظام،
 * فأي أيقونة بخلفية مصمتة تظهر مربعاً أبيض. لذا الرمز أبيض على شفافية تامة،
 * وتُشدّ شفافية الحواف قليلاً حتى لا تذوب خطوط الشعار الرفيعة عند ٢٤dp.
 */
function badge(mark: Raster, size: number, coverage: number): Raster {
  const inner = Math.round(size * coverage);
  const scaled = resize(mark, inner, inner);
  const offset = Math.round((size - inner) / 2);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      const s = (y * inner + x) * 4;
      const d = ((y + offset) * size + (x + offset)) * 4;
      data[d] = data[d + 1] = data[d + 2] = 255;
      data[d + 3] = Math.min(255, Math.round(scaled.data[s + 3] * 1.6));
    }
  }
  return { width: size, height: size, data };
}

writePng(path.join(OUT_DIR, "badge-96.png"), badge(mark, 96, 0.92));
console.log("✓", "badge-96.png", "96×96");
