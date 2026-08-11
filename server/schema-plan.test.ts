import { describe, expect, it } from "vitest";
import { addColumnStatement, expectedColumns } from "./schema-plan";
import { SCHEMA_SQL } from "./schema-sql";

/**
 * هذه الاختبارات تحرس شرطاً واحداً قاله صاحب النظام ولا يُساوَم عليه:
 * **لا تضيع بيانات موجودة.** المخطط يُطبَّق آلياً عند كل إقلاع، فما يمرّ من
 * عبارات يجب أن يكون إنشاءً محضاً لا أثر له على قاعدة عامرة.
 */

describe("المخطط المولَّد", () => {
  it("لا يحوي عبارة تهدم شيئاً", () => {
    const destructive = [
      /\bDROP\s+TABLE\b/i,
      /\bDROP\s+COLUMN\b/i,
      /\bDROP\s+INDEX\b/i,
      /\bDROP\s+CONSTRAINT\b/i,
      /\bTRUNCATE\b/i,
      /\bDELETE\s+FROM\b/i,
      /\bUPDATE\s+"?\w+"?\s+SET\b/i,
      /\bALTER\s+COLUMN\b/i,
      /\bRENAME\b/i,
    ];

    for (const pattern of destructive) {
      expect(SCHEMA_SQL, `المخطط يحوي ${pattern}`).not.toMatch(pattern);
    }
  });

  it("ينشئ كل جدول بصيغة لا تتأذّى بالتكرار", () => {
    const creates = SCHEMA_SQL.match(/CREATE TABLE[^(]*/gi) ?? [];
    expect(creates.length).toBeGreaterThan(20);
    for (const statement of creates) {
      expect(statement).toMatch(/CREATE TABLE IF NOT EXISTS/i);
    }
  });

  it("ينشئ كل فهرس بصيغة لا تتأذّى بالتكرار", () => {
    const creates = SCHEMA_SQL.match(/CREATE (UNIQUE )?INDEX[^(]*/gi) ?? [];
    expect(creates.length).toBeGreaterThan(0);
    for (const statement of creates) {
      expect(statement).toMatch(/IF NOT EXISTS/i);
    }
  });

  it("يشمل جداول الإشعارات وأسرار الخادم", () => {
    const tables = expectedColumns(SCHEMA_SQL).map((entry) => entry.table);
    expect(tables).toContain("push_subscriptions");
    expect(tables).toContain("notifications");
    expect(tables).toContain("app_secrets");
  });

  it("يقرأ أعمدة الجدول دون أسطر القيود", () => {
    const notifications = expectedColumns(SCHEMA_SQL).find((entry) => entry.table === "notifications");
    const names = notifications!.columns.map((column) => column.name);

    expect(names).toContain("dedupe_key");
    expect(names).toContain("scheduled_at");
    expect(names.some((name) => name.toUpperCase().startsWith("CONSTRAINT"))).toBe(false);
  });
});

describe("إضافة عمود لجدول قائم", () => {
  it("تُضاف بصيغة لا تتأذّى بالتكرار", () => {
    expect(addColumnStatement("notifications", "dedupe_key", "text")).toBe(
      'ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "dedupe_key" text',
    );
  });

  it("تحتفظ بالقيمة الافتراضية والإلزام معاً", () => {
    expect(addColumnStatement("notifications", "delivered_count", "integer DEFAULT 0 NOT NULL")).toBe(
      'ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "delivered_count" integer DEFAULT 0 NOT NULL',
    );
  });

  it("تتخطّى العمود الإلزامي بلا قيمة افتراضية بدل إسقاط الإقلاع", () => {
    // لا قيمة تُكتب في صفوف قائمة، فالمحاولة تفشل وتُسقط المزامنة كلها
    expect(addColumnStatement("members", "national_id", "text NOT NULL")).toBeNull();
  });

  it("لا تنقل مفتاحاً أساسياً إلى جدول قائم", () => {
    const statement = addColumnStatement("app_secrets", "key", "text PRIMARY KEY NOT NULL");
    expect(statement).toBeNull(); // إلزامي بلا قيمة افتراضية بعد نزع المفتاح
  });
});
