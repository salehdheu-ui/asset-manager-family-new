import { pool } from "./db";
import { SCHEMA_SQL } from "./schema-sql";
import { addColumnStatement, dropNotNullStatement, expectedColumns, isOptional } from "./schema-plan";

/**
 * يلحق بقاعدة البيانات ما ينقصها عند إقلاع الخادم.
 *
 * السبب: كل تحديث يضيف جدولاً كان يتطلب فتح طرفية في الحاوية وتشغيل
 * `npm run db:push` يدوياً. من ينسى الخطوة يرى الميزة الجديدة تنهار بأخطاء
 * ٥٠٠ غامضة، ومن لا يملك طرفية أصلاً لا سبيل له إليها.
 *
 * **حدّ هذا الملف الذي لا يتجاوزه: الإنشاء وحده.** ما يُنفَّذ هنا مولَّد في
 * `schema-sql.ts` من مخطط drizzle نفسه، وكله «أنشئ إن لم يكن موجوداً». لا حذف
 * لعمود، ولا تضييق لنوع، ولا إعادة تسمية — تلك تُهلك بيانات، ومكانها
 * `npm run db:push` بيد صاحب القرار وحده لا إقلاع تلقائي.
 *
 * والفشل هنا لا يمنع الخادم من العمل: يُسجَّل الخطأ ويكمل الإقلاع، فيبقى ما
 * كان يعمل عاملاً بدل أن يسقط النظام كله لأجل جدول جديد.
 */

/** يوقف المزامنة لمن يفضّل إدارة المخطط بيده */
const DISABLED = process.env.SCHEMA_SYNC?.trim().toLowerCase() === "off";

export interface SchemaSyncResult {
  ran: boolean;
  tablesBefore: number;
  tablesAfter: number;
  columnsAdded: string[];
  /** أعمدة خُفِّف عنها الإلزام لتطابق المخطط */
  relaxed: string[];
  skipped: string[];
  /** تعديلات تعثّرت — لا تمنع بقية المزامنة */
  failed: string[];
}

export async function syncSchema(): Promise<SchemaSyncResult> {
  const empty: SchemaSyncResult = { ran: false, tablesBefore: 0, tablesAfter: 0, columnsAdded: [], relaxed: [], skipped: [], failed: [] };
  if (DISABLED) return empty;

  const sql = SCHEMA_SQL;
  // pg_catalog لا information_schema: الأخير لا يُظهر إلا ما يملك المستخدم
  // صلاحية عليه، فجدول أنشأه مستخدم آخر يبقى خفياً — بينما CREATE TABLE IF NOT
  // EXISTS يراه ويتخطاه. فتختلف نظرة الخطوتين ويُترك الجدول بلا أعمدته الجديدة.
  const countTables = async () => {
    const { rows } = await pool.query(
      `select count(*)::int as total
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    return Number(rows[0]?.total ?? 0);
  };

  const tablesBefore = await countTables();

  // الملف كله في استعلام واحد: بوستجرس يلفّه بمعاملة ضمنية، فإمّا تُنشأ كل
  // الناقصات أو لا يُكتب منها شيء
  await pool.query(sql);

  // ————— الأعمدة المستجدّة على جداول قائمة —————
  const { rows: existing } = await pool.query<{
    table_name: string;
    column_name: string;
    not_null: boolean;
  }>(
    `select c.relname as table_name, a.attname as column_name, a.attnotnull as not_null
     from pg_catalog.pg_attribute a
     join pg_catalog.pg_class c on c.oid = a.attrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped`,
  );

  const present = new Map<string, Set<string>>();
  const required = new Set<string>();
  for (const row of existing) {
    const columns = present.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    present.set(row.table_name, columns);
    if (row.not_null) required.add(`${row.table_name}.${row.column_name}`);
  }

  const columnsAdded: string[] = [];
  const relaxed: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  /**
   * ينفّذ تعديل عمود واحد ويمضي إن تعثّر.
   *
   * جدولٌ لا يملكه مستخدم التطبيق يرفض التعديل — ولا يصح أن يمنع ذلك بقية
   * الجداول من اللحاق بالمخطط. يُسجَّل الاسم والسبب ويكمل الدور.
   */
  const run = async (statement: string, label: string): Promise<boolean> => {
    try {
      await pool.query(statement);
      return true;
    } catch (error) {
      failed.push(`${label}: ${error instanceof Error ? error.message : "خطأ غير معروف"}`);
      return false;
    }
  };

  for (const expected of expectedColumns(sql)) {
    const have = present.get(expected.table);
    if (!have) continue; // جدول أُنشئ للتو بأعمدته كاملة

    for (const column of expected.columns) {
      if (have.has(column.name)) {
        // عمود صار اختيارياً في المخطط وما زال إلزامياً في القاعدة: بلا تخفيفه
        // يرفض بوستجرس كل صف جديد يتركه فارغاً
        const key = `${expected.table}.${column.name}`;
        if (isOptional(column.definition) && required.has(key)) {
          if (await run(dropNotNullStatement(expected.table, column.name), key)) relaxed.push(key);
        }
        continue;
      }

      const statement = addColumnStatement(expected.table, column.name, column.definition);
      if (!statement) {
        skipped.push(`${expected.table}.${column.name}`);
        continue;
      }

      if (await run(statement, `${expected.table}.${column.name}`)) {
        columnsAdded.push(`${expected.table}.${column.name}`);
      }
    }
  }

  const tablesAfter = await countTables();

  if (tablesAfter > tablesBefore) {
    console.log(`مزامنة المخطط: أُنشئ ${tablesAfter - tablesBefore} جدولاً جديداً`);
  }
  if (relaxed.length > 0) {
    console.log(`مزامنة المخطط: خُفِّف الإلزام عن ${relaxed.join("، ")}`);
  }
  if (columnsAdded.length > 0) {
    console.log(`مزامنة المخطط: أُضيف ${columnsAdded.length} عموداً — ${columnsAdded.join("، ")}`);
  }
  if (skipped.length > 0) {
    console.error(
      `مزامنة المخطط: أعمدة إلزامية بلا قيمة افتراضية تحتاج db:push بيدك — ${skipped.join("، ")}`,
    );
  }

  if (failed.length > 0) {
    console.error(`مزامنة المخطط: تعثّرت تعديلات — ${failed.join(" | ")}`);
  }

  return { ran: true, tablesBefore, tablesAfter, columnsAdded, relaxed, skipped, failed };
}
