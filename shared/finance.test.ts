import { describe, expect, it } from "vitest";
import {
  availableInLayer,
  buildRepaymentSchedule,
  computeCommitmentScore,
  computeNetAssets,
  dueMonthsInYear,
  isInstallmentLate,
  isMonthDue,
  projectCashflow,
  recentDueMonths,
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

describe("computeCommitmentScore", () => {
  it("عضو مثالي: مساهمات كاملة وسداد كامل = 100", () => {
    expect(computeCommitmentScore({ monthsConsidered: 12, contributedMonths: 12, totalBorrowed: 500, totalRepaid: 500, overdueInstallments: 0 })).toBe(100);
  });

  it("من لا سلف عليه لا يُعاقب على جزء السداد", () => {
    expect(computeCommitmentScore({ monthsConsidered: 12, contributedMonths: 6, totalBorrowed: 0, totalRepaid: 0, overdueInstallments: 0 })).toBe(70); // 30 + 40
  });

  it("الأقساط المتأخرة تخصم من درجة السداد", () => {
    const clean = computeCommitmentScore({ monthsConsidered: 12, contributedMonths: 12, totalBorrowed: 100, totalRepaid: 100, overdueInstallments: 0 });
    const late = computeCommitmentScore({ monthsConsidered: 12, contributedMonths: 12, totalBorrowed: 100, totalRepaid: 100, overdueInstallments: 2 });
    expect(clean - late).toBe(4); // خصم 0.10 × 40
  });

  it("الدرجة محصورة بين 0 و100", () => {
    expect(computeCommitmentScore({ monthsConsidered: 12, contributedMonths: 0, totalBorrowed: 100, totalRepaid: 0, overdueInstallments: 20 })).toBe(0);
  });
});

describe("مهلة يوم 26 من الشهر", () => {
  it("الشهر غير مستحق يوم 26 نفسه، ويصبح مستحقاً في 27", () => {
    expect(isMonthDue(2026, 8, new Date(2026, 7, 26, 23, 0))).toBe(false);
    expect(isMonthDue(2026, 8, new Date(2026, 7, 27, 0, 30))).toBe(true);
  });

  it("الشهر الجاري لا يُحتسب في أشهر السنة المستحقة قبل مرور مهلته", () => {
    expect(dueMonthsInYear(2026, new Date(2026, 7, 10))).toBe(7);  // أغسطس لم يستحق بعد
    expect(dueMonthsInYear(2026, new Date(2026, 7, 27))).toBe(8);  // أغسطس استحق
    expect(dueMonthsInYear(2025, new Date(2026, 7, 10))).toBe(12); // سنة ماضية
    expect(dueMonthsInYear(2027, new Date(2026, 7, 10))).toBe(0);  // سنة قادمة
  });

  it("نافذة الأشهر المستحقة تتراجع شهراً كاملاً قبل يوم 26", () => {
    const before = recentDueMonths(new Date(2026, 7, 10), 3);
    expect(before[0]).toEqual({ year: 2026, month: 7 });
    const after = recentDueMonths(new Date(2026, 7, 27), 3);
    expect(after[0]).toEqual({ year: 2026, month: 8 });
    expect(after).toHaveLength(3);
  });

  it("نافذة الأشهر تعبر رأس السنة بشكل صحيح", () => {
    const months = recentDueMonths(new Date(2026, 0, 10), 2); // يناير قبل المهلة
    expect(months).toEqual([{ year: 2025, month: 12 }, { year: 2025, month: 11 }]);
  });

  it("القسط لا يُعد متأخراً قبل مرور مهلة شهره", () => {
    const due = new Date(2026, 7, 5); // مستحق 5 أغسطس
    expect(isInstallmentLate(due, new Date(2026, 7, 20))).toBe(false); // قبل 26
    expect(isInstallmentLate(due, new Date(2026, 7, 27))).toBe(true);  // بعد 26
  });

  it("القسط المستحق بعد يوم 26 يُحسب من تاريخه هو", () => {
    const due = new Date(2026, 7, 28); // مستحق 28 أغسطس
    expect(isInstallmentLate(due, new Date(2026, 7, 27))).toBe(false);
    expect(isInstallmentLate(due, new Date(2026, 7, 29))).toBe(true);
  });
});

describe("projectCashflow", () => {
  it("يراكم الرصيد شهراً بشهر من المساهمات والأقساط المجدولة", () => {
    const result = projectCashflow({
      startBalance: 1000,
      avgMonthlyContributions: 100,
      scheduledByMonth: { "2026-08": 50 },
      months: ["2026-07", "2026-08"],
    });
    expect(result[0].projectedBalance).toBe(1100);
    expect(result[1].projectedBalance).toBe(1250);
    expect(result[1].scheduledRepayments).toBe(50);
  });
});
