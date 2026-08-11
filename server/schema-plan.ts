/**
 * تخطيط المزامنة: قراءة المخطط المولَّد وتقرير ما يلزم إنشاؤه.
 *
 * منفصل عن التنفيذ عمداً — هنا حساب محض بلا قاعدة بيانات، فيُختبر وحده
 * ويُقرأ وحده. والقرار الوحيد الحسّاس فيه (أي عمود يُضاف وأيها يُترك) مكتوب
 * في دالة واحدة صغيرة بدل أن يضيع في دالة إقلاع طويلة.
 */

export interface ExpectedTable {
  table: string;
  columns: { name: string; definition: string }[];
}

/** أعمدة كل جدول كما يصفها الملف المولَّد */
export function expectedColumns(sql: string): ExpectedTable[] {
  const pattern = /CREATE TABLE IF NOT EXISTS "([^"]+)" \(([\s\S]*?)\n\);/g;
  const tables: ExpectedTable[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    const [, table, body] = match;
    const columns: ExpectedTable["columns"] = [];

    for (const line of body.split("\n")) {
      const column = /^\s*"([^"]+)"\s+(.*?),?\s*$/.exec(line);
      // أسطر القيود (CONSTRAINT …) لا تبدأ بمعرّف بين علامتي اقتباس
      if (column) columns.push({ name: column[1], definition: column[2] });
    }

    tables.push({ table, columns });
  }

  return tables;
}

/**
 * يبني عبارة إضافة عمود، أو يعيد null لعمود لا يمكن إضافته بأمان.
 *
 * العمود الإلزامي بلا قيمة افتراضية يستحيل إضافته لجدول فيه صفوف — لا قيمة
 * تُكتب في الصفوف القائمة. تخطّيه مع تنبيه أصدق من إسقاط الإقلاع كله.
 */
export function addColumnStatement(table: string, column: string, definition: string): string | null {
  const clean = definition.replace(/\bPRIMARY KEY\b/i, "").replace(/\s+/g, " ").trim();
  if (/\bNOT NULL\b/i.test(clean) && !/\bDEFAULT\b/i.test(clean)) return null;
  return `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${clean}`;
}
