/**
 * يولّد `server/schema-sql.ts` — وصف المخطط الكامل بصيغة لا تتأذّى بالتكرار.
 *
 * المصدر drizzle-kit نفسه، لا كتابة يدوية: يُطلب منه توليد ترحيل أساسي من
 * `shared/schema.ts` ثم تُحوَّل عباراته إلى صيغة «أنشئ إن لم يكن موجوداً».
 * الناتج يُنفَّذ عند إقلاع الخادم فيلحق بقاعدة البيانات ما ينقصها من جداول
 * وفهارس، ويمرّ على الموجود مرور اللامبالي.
 *
 * ويخرج وحدةَ TypeScript لا ملف `.sql`: هكذا يدخل النص في حزمة الإنتاج نفسها
 * فلا يبقى ملف قد يُنسى في النسخ، ولا حاجة لقراءة مسار يختلف بين التطوير
 * والإنتاج.
 *
 * قاعدة تحكم هذا الملف كله: **لا عبارة تحذف أو تغيّر شيئاً قائماً.** إنشاء فقط.
 * أي تغيير يهدم — حذف عمود، تضييق نوع، إعادة تسمية — يبقى خارج هذا الطريق
 * ويُنفَّذ بـ `npm run db:push` بيد صاحب القرار.
 *
 *   npx tsx script/make-schema-sql.ts
 */
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "server", "schema-sql.ts");

const work = mkdtempSync(path.join(tmpdir(), "schema-sql-"));

try {
  // drizzle-kit generate لا يمسّ قاعدة بيانات، لكنه يطلب رابطاً في الإعدادات
  execFileSync(
    "npx",
    [
      "drizzle-kit", "generate",
      "--dialect", "postgresql",
      "--schema", "./shared/schema.ts",
      "--out", work,
      "--name", "schema",
    ],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DATABASE_URL: "postgres://unused" } },
  );

  const file = readdirSync(work).find((name) => name.endsWith(".sql"));
  if (!file) throw new Error("drizzle-kit لم يخرج ملف SQL");

  const statements = readFileSync(path.join(work, file), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim().replace(/;$/, "").trim())
    .filter(Boolean);

  const converted = statements.map((statement) => {
    if (/^CREATE TABLE /i.test(statement)) {
      return statement.replace(/^CREATE TABLE /i, "CREATE TABLE IF NOT EXISTS ");
    }

    if (/^CREATE (UNIQUE )?INDEX /i.test(statement)) {
      return statement.replace(/^CREATE (UNIQUE )?INDEX /i, (_match, unique) =>
        `CREATE ${unique ?? ""}INDEX IF NOT EXISTS `,
      );
    }

    // القيود الخارجية بلا صيغة IF NOT EXISTS في بوستجرس — يُبتلع خطأ التكرار
    if (/^ALTER TABLE .* ADD CONSTRAINT /i.test(statement)) {
      return `DO $$ BEGIN\n  ${statement};\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$`;
    }

    throw new Error(`عبارة غير متوقعة لا يعرف هذا المولّد كيف يجعلها آمنة للتكرار:\n${statement}`);
  });

  const sql = `${converted.join(";\n\n")};\n`;

  // النص يسكن قالباً نصياً في TypeScript — حرفان فقط يفسدانه
  if (sql.includes("`") || sql.includes("${")) {
    throw new Error("المخطط يحوي حرفاً يكسر القالب النصي");
  }

  const header = [
    "/**",
    " * مولَّد آلياً من shared/schema.ts — لا يُحرَّر بيد.",
    " * أعد توليده بـ: npx tsx script/make-schema-sql.ts",
    " *",
    " * كل عبارة هنا إنشاء محض: تمرّ بلا أثر على قاعدة بيانات مكتملة، وتُنشئ",
    " * الناقص وحده على قاعدة متأخرة عن الشيفرة. لا حذف ولا تغيير لقائم.",
    " */",
    "export const SCHEMA_SQL = `",
  ].join("\n");

  writeFileSync(OUT, `${header}${sql}\`;\n`);

  const tables = converted.filter((statement) => /^CREATE TABLE/i.test(statement)).length;
  const indexes = converted.filter((statement) => /^CREATE (UNIQUE )?INDEX/i.test(statement)).length;
  const constraints = converted.length - tables - indexes;
  console.log(`✓ server/schema-sql.ts — ${tables} جدولاً، ${indexes} فهرساً، ${constraints} قيداً`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
