import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * نموذج يحاكي الحقيقة: الطبقة نسبة من صافي الأصول، والعملية تنقصه بمبلغها.
 * لذلك يقبل الفحص «دلتا» تعيد الصافي إلى ما كان قبل العملية — وبها وحدها
 * يتطابق ما تقوله نافذة التأكيد وما يكتبه السجل بعد التنفيذ.
 */
const fund = { netAssets: 1000, flexiblePercent: 0.2, emergencyPercent: 0.15, used: 0 };

vi.mock("../capital-engine", () => ({
  currentLayerCapacity: vi.fn(async (_year: number, netAssetsDelta = 0) => ({
    protected: { amount: 0, used: 0 },
    emergency: { amount: (fund.netAssets + netAssetsDelta) * fund.emergencyPercent, used: fund.used },
    flexible: { amount: (fund.netAssets + netAssetsDelta) * fund.flexiblePercent, used: fund.used },
    growth: { amount: 0, used: 0 },
  })),
}));

const audits: any[] = [];

vi.mock("../storage", () => ({
  storage: {
    createAuditLog: vi.fn(async (log: any) => {
      audits.push(log);
      return log;
    }),
  },
}));

import { guardExpense, guardLoan, previewExpense, previewLoan } from "./layer-guard";

const context = {
  entityType: "loan",
  entityId: "l1",
  actorUserId: "u1",
  actorName: "الوصي",
  subject: "سلفة «ترميم»",
};

beforeEach(() => {
  audits.length = 0;
  fund.netAssets = 1000;
  fund.used = 0;
});

/**
 * الحدّ إرشاد لا سدّ: هذه الاختبارات تحرس الوعد بشقّيه — لا تُمنع عملية،
 * ولا يمرّ تجاوز بلا أثر.
 */
describe("الفحص المسبق — قبل كتابة الصف", () => {
  it("يصمت على مبلغ داخل حدّ الطبقة", async () => {
    // الصندوق ١٠٠٠ ⇒ المرن ٢٠٠، والمطلوب ١٥٠
    expect(await previewLoan(150, 2026)).toBeNull();
    expect(audits).toHaveLength(0); // الفحص المسبق لا يكتب شيئاً
  });

  it("يرصد التجاوز ويحسب مقداره بلا أن يكتب أثراً", async () => {
    const result = await previewLoan(500, 2026);

    expect(result!.layerName).toBe("رأس المال المرن");
    expect(result!.available).toBe(200);
    expect(result!.excess).toBe(300);
    expect(audits).toHaveLength(0);
  });

  it("يحاسب مصروف الطوارئ على طبقته", async () => {
    const result = await previewExpense(200, "emergency", 2026);
    expect(result!.layerName).toBe("احتياطي الطوارئ");
    expect(result!.excess).toBe(50); // المتاح ١٥٠ من أصل ١٠٠٠
  });
});

describe("الفحص بعد الكتابة — الذي يوثّق", () => {
  it("يمرّ بلا أثر على مبلغ داخل الحد", async () => {
    // سلفة ١٥٠ كُتبت: الصافي ٨٥٠ والمستهلَك ١٥٠
    fund.netAssets = 850;
    fund.used = 150;

    expect(await guardLoan(150, 2026, context)).toBeNull();
    expect(audits).toHaveLength(0);
  });

  it("يكتب التجاوز باسم من نفّذه ومقداره", async () => {
    fund.netAssets = 500;
    fund.used = 500;

    const result = await guardLoan(500, 2026, context);

    expect(result!.excess).toBe(300);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("capital_layer_exceeded");
    expect(audits[0].actorName).toBe("الوصي");
    expect(audits[0].entityId).toBe("l1");
    expect(audits[0].description).toContain("سلفة «ترميم»");
    expect(audits[0].metadata.excess).toBe(300);
  });

  it("يحاسب بقية المصروفات على الطبقة المرنة", async () => {
    fund.netAssets = 900;
    fund.used = 100;

    expect(await guardExpense(100, "general", 2026, { ...context, entityType: "expense" })).toBeNull();
  });
});

describe("اتفاق النافذة والسجل", () => {
  it("يعطي الفحصان الرقم نفسه لنفس العملية", async () => {
    const preview = await previewLoan(400, 2026);

    // بعد كتابة سلفة ٤٠٠: الصافي ٦٠٠ والمستهلَك ٤٠٠
    fund.netAssets = 600;
    fund.used = 400;
    const afterWrite = await guardLoan(400, 2026, context);

    expect(preview!.available).toBe(afterWrite!.available);
    expect(preview!.excess).toBe(afterWrite!.excess);
    expect(preview!.excess).toBe(200);
  });
});
