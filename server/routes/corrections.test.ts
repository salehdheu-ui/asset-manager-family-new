import { describe, expect, it } from "vitest";
import { insertFundAdjustmentSchema } from "@shared/schema";

/**
 * القيد المباشر يزيد رصيد الصندوق أو ينقصه بلا مساهمة ولا سلفة — والتعليق في
 * المسار نفسه يسمّيه «أخطر ما في النظام». وكان مبلغه بلا حدّ أدنى، فيمرّ
 * «إيداع» بمبلغ سالب: يستنزف الصندوق ويُقرأ في السجل إيداعاً.
 */
describe("مبلغ القيد المباشر", () => {
  const parse = (amount: unknown, type = "deposit") =>
    insertFundAdjustmentSchema.safeParse({ type, amount, description: "اختبار" });

  it("يرفض إيداعاً بمبلغ سالب", () => {
    const r = parse("-100");
    expect(r.success).toBe(false);
  });

  it("يرفض سحباً بمبلغ سالب", () => {
    expect(parse("-100", "withdrawal").success).toBe(false);
  });

  it("يرفض الصفر", () => {
    expect(parse("0").success).toBe(false);
    expect(parse(0).success).toBe(false);
  });

  it("يرفض ما ليس رقماً", () => {
    expect(parse("كلام").success).toBe(false);
    expect(parse("").success).toBe(false);
  });

  it("يقبل مبلغاً موجباً نصاً أو رقماً", () => {
    expect(parse("36.500").success).toBe(true);
    expect(parse(36.5).success).toBe(true);
  });

  it("يوحّد المبلغ نصاً كما يتوقعه عمود القاعدة", () => {
    const r = parse(36.5);
    expect(r.success && typeof r.data.amount).toBe("string");
  });
});
