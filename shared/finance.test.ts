import { describe, expect, it } from "vitest";
import {
  availableInLayer,
  buildRepaymentSchedule,
  computeNetAssets,
  splitAllocation,
} from "./finance";

describe("buildRepaymentSchedule", () => {
  const baseLoan = {
    id: "loan-1",
    repaymentType: "scheduled",
    approvedAt: new Date(2026, 0, 15),
    createdAt: new Date(2026, 0, 10),
  };

  it("مجموع الأقساط يساوي مبلغ السلفة تماماً حتى مع كسور القسمة", () => {
    const schedule = buildRepaymentSchedule({ ...baseLoan, amount: "100", repaymentMonths: 3 });
    const total = schedule.reduce((sum, r) => sum + Number(r.amount), 0);
    expect(schedule.map((r) => r.amount)).toEqual(["33.333", "33.333", "33.334"]);
    expect(total).toBeCloseTo(100, 9);
  });

  it("يطابق المجموع لمبالغ وأشهر متنوعة", () => {
    for (const [amount, months] of [[1000, 7], [250.5, 12], [77.777, 5], [1, 3]] as const) {
      const schedule = buildRepaymentSchedule({ ...baseLoan, amount, repaymentMonths: months });
      const total = schedule.reduce((sum, r) => sum + Number(r.amount), 0);
      expect(total).toBeCloseTo(amount, 9);
      expect(schedule).toHaveLength(months);
    }
  });

  it("يرقّم الأقساط تسلسلياً ويستحقها شهرياً بدءاً من الشهر التالي للاعتماد", () => {
    const schedule = buildRepaymentSchedule({ ...baseLoan, amount: "300", repaymentMonths: 3 });
    expect(schedule.map((r) => r.installmentNumber)).toEqual([1, 2, 3]);
    expect(schedule[0].dueDate.getMonth()).toBe(1); // فبراير
    expect(schedule[2].dueDate.getMonth()).toBe(3); // أبريل
    expect(schedule.every((r) => r.status === "scheduled")).toBe(true);
  });

  it("يرجع جدولاً فارغاً للسداد المفتوح أو عدد أشهر غير صالح", () => {
    expect(buildRepaymentSchedule({ ...baseLoan, amount: "100", repaymentType: "open", repaymentMonths: 3 })).toEqual([]);
    expect(buildRepaymentSchedule({ ...baseLoan, amount: "100", repaymentMonths: 0 })).toEqual([]);
    expect(buildRepaymentSchedule({ ...baseLoan, amount: "100", repaymentMonths: null })).toEqual([]);
  });

  it("يستخدم تاريخ الإنشاء عند غياب تاريخ الاعتماد", () => {
    const schedule = buildRepaymentSchedule({
      ...baseLoan,
      approvedAt: null,
      amount: "60",
      repaymentMonths: 2,
    });
    expect(schedule[0].dueDate.getMonth()).toBe(1); // فبراير (الإنشاء في يناير)
  });
});

describe("computeNetAssets", () => {
  it("يجمع الإيداعات والمساهمات والسداد ويطرح السلف والمصروفات والسحوبات", () => {
    expect(
      computeNetAssets({ contributions: 1000, deposits: 200, withdrawals: 50, loans: 300, repayments: 100, expenses: 150 }),
    ).toBe(800);
  });

  it("لا يهبط تحت الصفر", () => {
    expect(
      computeNetAssets({ contributions: 100, deposits: 0, withdrawals: 0, loans: 500, repayments: 0, expenses: 0 }),
    ).toBe(0);
  });
});

describe("splitAllocation", () => {
  it("يوزع صافي الأصول على الطبقات الأربع حسب النسب", () => {
    const split = splitAllocation(1000, { protected: 45, emergency: 15, flexible: 20, growth: 20 });
    expect(split).toEqual({ protected: 450, emergency: 150, flexible: 200, growth: 200 });
    expect(split.protected + split.emergency + split.flexible + split.growth).toBe(1000);
  });
});

describe("availableInLayer", () => {
  it("يحسب المتاح ولا يسمح بقيمة سالبة عند تجاوز الاستخدام", () => {
    expect(availableInLayer(200, 80)).toBe(120);
    expect(availableInLayer(200, 250)).toBe(0);
  });
});
