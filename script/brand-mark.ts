/**
 * شعار الهوية مهيّأً للتركيب: بلا خلفية بيضاء وبلا هوامش.
 *
 * مشترك بين مولّد الأيقونات ومولّد شاشات الإقلاع حتى يخرج الاثنان من مصدر
 * واحد، فلا ينحرف شكل أحدهما عن الآخر عند تغيير الشعار.
 */
import path from "path";
import { readPng, type Raster, type Rgb } from "./png.ts";

const SOURCE = path.resolve(
  import.meta.dirname,
  "../attached_assets/generated_images/minimalist_family_fund_logo_symbol.png",
);

/** أخضر الهوية (--primary: 152 72% 26%) بعد التحويل إلى RGB */
export const BRAND: Rgb = [18, 114, 71];

/** خلفية شاشة الإقلاع — نفس `background_color` في البيان */
export const BACKGROUND: Rgb = [231, 238, 235];

/** يجعل الخلفية البيضاء شفافة ليبقى الرمز وحده */
function dropWhiteBackground(src: Raster): Raster {
  const data = new Uint8Array(src.data);
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const lightness = Math.min(r, g, b);
    // الأبيض التام شفاف تماماً، والدرجات القريبة تتدرج فتبقى الحواف ناعمة
    if (lightness >= 250) data[i + 3] = 0;
    else if (lightness > 215) data[i + 3] = Math.round(((250 - lightness) / 35) * 255);
  }
  return { ...src, data };
}

/**
 * يقتطع الهامش الشفاف حول الرمز ويعيده في مربع.
 * الشعار المصدر يشغل نصف اللوحة تقريباً، ولولا هذا لبدت الأيقونة ضائعة في فراغها.
 */
function cropToContent(src: Raster): Raster {
  let minX = src.width, minY = src.height, maxX = -1, maxY = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (src.data[(y * src.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return src;

  // مربع حول المحتوى مع إبقائه في المنتصف
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const side = Math.max(w, h);
  const originX = minX - Math.floor((side - w) / 2);
  const originY = minY - Math.floor((side - h) / 2);

  const data = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++) {
    const sy = originY + y;
    if (sy < 0 || sy >= src.height) continue;
    for (let x = 0; x < side; x++) {
      const sx = originX + x;
      if (sx < 0 || sx >= src.width) continue;
      const s = (sy * src.width + sx) * 4;
      const d = (y * side + x) * 4;
      data[d] = src.data[s];
      data[d + 1] = src.data[s + 1];
      data[d + 2] = src.data[s + 2];
      data[d + 3] = src.data[s + 3];
    }
  }

  return { width: side, height: side, data };
}

export function loadBrandMark(): Raster {
  return cropToContent(dropWhiteBackground(readPng(SOURCE)));
}
