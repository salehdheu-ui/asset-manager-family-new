import { pool } from "./db";
import { SCHEMA_SQL } from "./schema-sql";
import { addColumnStatement, expectedColumns } from "./schema-plan";

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
  skipped: string[];
}

export async function syncSchema(): Promise<SchemaSyncResult> {
  const empty: SchemaSyncResult = { ran: false, tablesBefore: 0, tablesAfter: 0, columnsAdded: [], skipped: [] };
  if (DISABLED) return empty;

  const sql = SCHEMA_SQL;
  const countTables = async () => {
    const { rows } = await pool.query(
      "select count(*)::int as total from information_schema.tables where table_schema = 'public'",
    );
    return Number(rows[0]?.total ?? 0);
  };

  const tablesBefore = await countTables();

  // الملف كله في استعلام واحد: بوستجرس يلفّه بمعاملة ضمنية، فإمّا تُنشأ كل
  // الناقصات أو لا يُكتب منها شيء
  await pool.query(sql);

  // ————— الأعمدة المستجدّة على جداول قائمة —————
  const { rows: existing } = await pool.query<{ table_name: string; column_name: string }>(
    "select table_name, column_name from information_schema.columns where table_schema = 'public'",
  );

  const present = new Map<string, Set<string>>();
  for (const row of existing) {
    const columns = present.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    present.set(row.table_name, columns);
  }

  const columnsAdded: string[] = [];
  const skipped: string[] = [];

  for (const expected of expectedColumns(sql)) {
    const have = present.get(expected.table);
    if (!have) continue; // جدول أُنشئ للتو بأعمدته كاملة

    for (const column of expected.columns) {
      if (have.has(column.name)) continue;

      const statement = addColumnStatement(expected.table, column.name, column.definition);
      if (!statement) {
        skipped.push(`${expected.table}.${column.name}`);
        continue;
      }

      await pool.query(statement);
      columnsAdded.push(`${expected.table}.${column.name}`);
    }
  }

  const tablesAfter = await countTables();

  if (tablesAfter > tablesBefore) {
    console.log(`مزامنة المخطط: أُنشئ ${tablesAfter - tablesBefore} جدولاً جديداً`);
  }
  if (columnsAdded.length > 0) {
    console.log(`مزامنة المخطط: أُضيف ${columnsAdded.length} عموداً — ${columnsAdded.join("، ")}`);
  }
  if (skipped.length > 0) {
    console.error(
      `مزامنة المخطط: أعمدة إلزامية بلا قيمة افتراضية تحتاج db:push بيدك — ${skipped.join("، ")}`,
    );
  }

  return { ran: true, tablesBefore, tablesAfter, columnsAdded, skipped };
}
