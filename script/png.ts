/**
 * ترميز PNG وفك ترميزه بـ zlib المدمجة في Node وحدها.
 *
 * تستعمله مولّدات الأيقونات وشاشات الإقلاع وفاحص PWA. كُتب يدوياً حتى لا يضيف
 * المشروع اعتماداً على مكتبة صور لأجل خطوات تُنفَّذ يدوياً مرة كل عام.
 */
import { readFileSync, writeFileSync } from "fs";
import zlib from "zlib";

export interface Raster {
  width: number;
  height: number;
  /** RGBA متسلسلة */
  data: Uint8Array;
}

export type Rgb = [number, number, number];

// ————— قراءة —————

/** أبعاد الصورة من ترويسة IHDR وحدها — بلا فك ضغط البكسلات */
export function pngSizeOf(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("ليس ملف PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function pngSize(file: string): { width: number; height: number } {
  return pngSizeOf(readFileSync(file));
}

export function readPng(file: string): Raster {
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

// ————— كتابة —————

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

/** بلا مرشّح: البكسلات كما هي */
function filterNone({ width, height, data }: Raster): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return raw;
}

/**
 * مرشّح Up: فرق كل بكسل عن نظيره في السطر السابق.
 * المساحات المصمتة — وهي معظم شاشة الإقلاع — تصير أصفاراً متتالية يسحقها الضغط.
 */
function filterUp({ width, height, data }: Raster): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  Buffer.from(data.buffer, data.byteOffset, stride).copy(raw, 1); // السطر الأول بلا مرشّح
  for (let y = 1; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 2;
    for (let i = 0; i < stride; i++) {
      raw[row + 1 + i] = (data[y * stride + i] - data[(y - 1) * stride + i]) & 0xff;
    }
  }
  return raw;
}

export function writePng(file: string, raster: Raster) {
  const { width, height } = raster;

  // المرشّح الأنسب يختلف باختلاف الصورة: المسطّحة تربح مع Up والمتدرّجة تخسر
  // معه. أرخص من التنبؤ أن نضغط بالطريقتين ونبقي الأصغر.
  const compressed = [filterNone(raster), filterUp(raster)]
    .map((raw) => zlib.deflateSync(raw, { level: 9 }))
    .sort((a, b) => a.length - b.length)[0];

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
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

// ————— تحويلات —————

/** لوحة مصمتة بلون واحد */
export function solid(width: number, height: number, color: Rgb): Raster {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = 255;
  }
  return { width, height, data };
}

/** تصغير بمرشّح صندوقي — المصدر أكبر من الهدف دائماً في استعمالاتنا */
export function resize(src: Raster, width: number, height: number): Raster {
  const out = new Uint8Array(width * height * 4);
  const scaleX = src.width / width;
  const scaleY = src.height / height;

  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));
    for (let x = 0; x < width; x++) {
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

      const d = (y * width + x) * 4;
      const alphaAvg = a / n;
      const weight = alphaAvg / 255;
      out[d] = weight > 0 ? Math.round(r / n / weight) : 0;
      out[d + 1] = weight > 0 ? Math.round(g / n / weight) : 0;
      out[d + 2] = weight > 0 ? Math.round(b / n / weight) : 0;
      out[d + 3] = Math.round(alphaAvg);
    }
  }

  return { width, height, data: out };
}

/** يركّب صورة فوق أخرى عند إحداثيات محددة، بمزج شفافية عادي */
export function drawInto(dest: Raster, src: Raster, originX: number, originY: number) {
  for (let y = 0; y < src.height; y++) {
    const dy = originY + y;
    if (dy < 0 || dy >= dest.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = originX + x;
      if (dx < 0 || dx >= dest.width) continue;

      const s = (y * src.width + x) * 4;
      const alpha = src.data[s + 3] / 255;
      if (alpha === 0) continue;

      const d = (dy * dest.width + dx) * 4;
      for (let c = 0; c < 3; c++) {
        dest.data[d + c] = Math.round(src.data[s + c] * alpha + dest.data[d + c] * (1 - alpha));
      }
      dest.data[d + 3] = 255;
    }
  }
}
