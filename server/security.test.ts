import { describe, expect, it } from "vitest";
import { redactSecrets } from "./security";

/**
 * مسار إصدار كود الاستعادة يردّ الكود نصاً مرة واحدة، وتعليقه يقول إنه «لا
 * يُخزَّن نصاً في أي مكان». وكان مسجّل الطلبات يكتب جسم الردّ لكل مسار عدا
 * /api/auth — والمسار تحت /api/admin — فينسخ الكود في سجل الخادم صالحاً
 * ثلاثين دقيقة لمن يقرأ السجل.
 */
describe("حجب الأسرار عن السجل", () => {
  it("يحجب كود الاستعادة ويبقي ما حوله", () => {
    const body = {
      code: "482913",
      username: "salem",
      expiresAt: "2026-08-19T10:00:00Z",
      message: "أرسل هذا الكود للعضو مباشرة",
    };

    const safe = redactSecrets(body) as Record<string, unknown>;

    expect(safe.code).toBe("[محجوب]");
    expect(JSON.stringify(safe)).not.toContain("482913");
    expect(safe.username).toBe("salem");
    expect(safe.expiresAt).toBe("2026-08-19T10:00:00Z");
  });

  it("يحجب كلمات المرور والرموز مهما عمق تداخلها", () => {
    const body = { user: { name: "سالم", password: "hunter2" }, session: { token: "abc.def" } };

    expect(JSON.stringify(redactSecrets(body))).not.toContain("hunter2");
    expect(JSON.stringify(redactSecrets(body))).not.toContain("abc.def");
    expect(JSON.stringify(redactSecrets(body))).toContain("سالم");
  });

  it("يحجب داخل المصفوفات", () => {
    const body = { subscriptions: [{ endpoint: "https://fcm/x", keys: { p256dh: "k1", auth: "k2" } }] };
    const json = JSON.stringify(redactSecrets(body));

    expect(json).not.toContain("https://fcm/x");
    expect(json).not.toContain("k1");
    expect(json).not.toContain("k2");
  });

  it("لا يفرّغ التاريخ إلى كائن فارغ", () => {
    const at = new Date("2026-08-19T10:00:00Z");
    const safe = redactSecrets({ code: "1", expiresAt: at }) as Record<string, unknown>;

    expect(safe.expiresAt).toBeInstanceOf(Date);
    expect(JSON.stringify(safe)).toContain("2026-08-19T10:00:00.000Z");
    expect(safe.code).toBe("[محجوب]");
  });

  it("يمرّ الأرقام والنصوص العادية بلا مساس", () => {
    const body = { amount: 36, title: "مصروف", nested: { total: 1000 } };
    expect(redactSecrets(body)).toEqual(body);
  });

  it("لا يدور بلا نهاية على بنية مرجعة إلى نفسها", () => {
    const cycle: any = { name: "أ" };
    cycle.self = cycle;
    expect(() => redactSecrets(cycle)).not.toThrow();
  });
});
