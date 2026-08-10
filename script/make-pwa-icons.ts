/**
 * يولّد أيقونات التطبيق من شعار الهوية.
 *
 * يُشغَّل يدوياً عند تغيّر الشعار فقط (`npx tsx script/make-pwa-icons.ts`)، لا في
 * كل بناء — الأيقونات الناتجة محفوظة في المستودع. مكتوب بـ zlib المدمجة في Node
 * حتى لا يضيف المشروع اعتماداً على مكتبة صور لأجل خطوة تُنفَّذ مرة كل عام.
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import zlib from "zlib";

const SOURCE = path.resolve(
  import.meta.dirname,
  "../attached_assets/generated_images/minimalist_family_fund_logo_symbol.png",
);
const OUT_DIR = path.resolve(import.meta.dirname, "../client/public/icons");

// أخضر الهوية (--primary: 152 72% 26%) بعد التحويل إلى RGB
const BRAND: [number, number, number] = [18, 114, 71];

interface Raster {
  width: number;
  height: number;
  /** RGBA متسلسلة */
  data: Uint8Array;
}

// ————— قراءة PNG —————

function readPng(file: string): Raster {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("ليس ملف PNG");

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const body = buf.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const bitDepth = body[8];
      colorType = body[9];
      if (bitDepth !== 8) throw new Error(`عمق البت ${bitDepth} غير مدعوم`);
      if (colorType !== 2 && colorType !== 6) throw new Error(`نوع اللون ${colorType} غير مدعوم`);
      if (body[12] !== 0) throw new Error("الصور المتشابكة غير مدعومة");
    } else if (type === "IDAT") {
      idat.push(Buffer.from(body));
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length;
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);

  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let value: number;
      switch (filter) {
        case 0: value = x; break;
        case 1: value = x + a; break;
        case 2: value = x + b; break;
        case 3: value = x + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`مرشّح غير معروف: ${filter}`);
      }
      line[i] = value & 0xff;
    }
    src += stride;

    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      out[d] = line[s];
      out[d + 1] = line[s + 1];
      out[d + 2] = line[s + 2];
      out[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev.set(line);
  }

  return { width, height, data: out };
}

// ————— كتابة PNG —————

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function writePng(file: string, raster: Raster) {
  const { width, height, data } = raster;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // بلا مرشّح — الضغط كافٍ لأيقونة مسطّحة
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // عمق البت
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

// ————— المعالجة —————

/** يجعل الخلفية البيضاء شفافة ليبقى الرمز الذهبي وحده */
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

/** تصغير بمرشّح صندوقي — المصدر أكبر من الهدف دائماً هنا */
function resize(src: Raster, size: number): Raster {
  const out = new Uint8Array(size * size * 4);
  const scaleX = src.width / size;
  const scaleY = src.height / size;

  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scaleX));

      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const s = (sy * src.width + sx) * 4;
          const alpha = src.data[s + 3] / 255;
          // المتوسط مرجّح بالشفافية حتى لا تتسرب ألوان البكسلات الشفافة
          r += src.data[s] * alpha;
          g += src.data[s + 1] * alpha;
          b += src.data[s + 2] * alpha;
          a += src.data[s + 3];
          n++;
        }
      }

      const d = (y * size + x) * 4;
      const alphaAvg = a / n;
      const weight = alphaAvg / 255;
      out[d] = weight > 0 ? Math.round(r / n / weight) : 0;
      out[d + 1] = weight > 0 ? Math.round(g / n / weight) : 0;
      out[d + 2] = weight > 0 ? Math.round(b / n / weight) : 0;
      out[d + 3] = Math.round(alphaAvg);
    }
  }

  return { width: size, height: size, data: out };
}

/** يركّب الرمز في مربع بخلفية الهوية، بنسبة تشغل `coverage` من الضلع */
function compose(mark: Raster, size: number, coverage: number): Raster {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = BRAND[0];
    data[i + 1] = BRAND[1];
    data[i + 2] = BRAND[2];
    data[i + 3] = 255;
  }

  const inner = Math.round(size * coverage);
  const scaled = resize(mark, inner);
  const offset = Math.round((size - inner) / 2);

  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      const s = (y * inner + x) * 4;
      const alpha = scaled.data[s + 3] / 255;
      if (alpha === 0) continue;
      const d = ((y + offset) * size + (x + offset)) * 4;
      for (let c = 0; c < 3; c++) {
        data[d + c] = Math.round(scaled.data[s + c] * alpha + data[d + c] * (1 - alpha));
      }
    }
  }

  return { width: size, height: size, data };
}

const mark = cropToContent(dropWhiteBackground(readPng(SOURCE)));

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
