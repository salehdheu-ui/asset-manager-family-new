import { beforeEach, describe, expect, it, vi } from "vitest";

const capacity = {
  protected: { amount: 450, used: 0 },
  emergency: { amount: 150, used: 0 },
  flexible: { amount: 200, used: 0 },
  growth: { amount: 200, used: 0 },
};

const audits: any[] = [];

vi.mock("../capital-engine", () => ({
  currentLayerCapacity: vi.fn(async () => capacity),
}));

vi.mock("../storage", () => ({
  storage: {
    createAuditLog: vi.fn(async (log: any) => {
      audits.push(log);
      return log;
    }),
  },
}));

import { guardExpense, guardLoan } from "./layer-guard";

const context = {
  entityType: "loan",
  entityId: "l1",
  actorUserId: "u1",
  actorName: "الوصي",
  subject: "سلفة «ترميم»",
};

beforeEach(() => {
  audits.length = 0;
  capacity.flexible = { amount: 200, used: 0 };
  capacity.emergency = { amount: 150, used: 0 };
});

/**
 * الحدّ إرشاد لا سدّ: هذه الاختبارات تحرس الوعد بشقّيه — لا تُمنع عملية،
 * ولا يمرّ تجاوز بلا أثر.
 */
describe("حارس طبقات رأس المال", () => {
  it("يصمت على مبلغ داخل حدّ الطبقة", async () => {
    // العملية مكتوبة سلفاً فمبلغها داخل المستهلَك
    capacity.flexible = { amount: 200, used: 120 };
    const result = await guardLoan(120, 2026, context);

    expect(result).toBeNull();
    expect(audits).toHaveLength(0);
  });

  it("يرصد التجاوز ويحسب مقداره من المتاح قبل العملية", async () => {
    capacity.flexible = { amount: 200, used: 500 };
    const result = await guardLoan(500, 2026, context);

    expect(result).not.toBeNull();
    expect(result!.layerName).toBe("رأس المال المرن");
    expect(result!.available).toBe(200);   // لم يكن مستهلكاً منها شيء قبلها
    expect(result!.requested).toBe(500);
    expect(result!.excess).toBe(300);
  });

  it("يكتب التجاوز في سجل التدقيق باسم من نفّذه ومقداره", async () => {
    capacity.flexible = { amount: 200, used: 500 };
    await guardLoan(500, 2026, context);

    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("capital_layer_exceeded");
    expect(audits[0].actorName).toBe("الوصي");
    expect(audits[0].entityId).toBe("l1");
    expect(audits[0].description).toContain("سلفة «ترميم»");
    expect(audits[0].metadata.excess).toBe(300);
  });

  it("يحاسب مصروف الطوارئ على طبقة الطوارئ لا المرنة", async () => {
    capacity.emergency = { amount: 150, used: 400 };
    capacity.flexible = { amount: 200, used: 0 };

    const result = await guardExpense(400, "emergency", 2026, { ...context, entityType: "expense" });

    expect(result!.layerName).toBe("احتياطي الطوارئ");
    expect(result!.excess).toBe(250);
  });

  it("يحاسب بقية المصروفات على الطبقة المرنة", async () => {
    capacity.flexible = { amount: 200, used: 100 };
    const result = await guardExpense(100, "general", 2026, { ...context, entityType: "expense" });

    expect(result).toBeNull(); // ١٠٠ من أصل ٢٠٠ متاحة
  });
});
