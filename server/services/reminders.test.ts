import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLoans: vi.fn(),
  getMembers: vi.fn(),
  getContributions: vi.fn(),
  getPaidTotalsByLoan: vi.fn(),
  getLoanRepaymentsForLoans: vi.fn(),
  createReminderOnce: vi.fn(),
  getContributionRates: vi.fn(),
  dispatchNotification: vi.fn(),
  isPushConfigured: vi.fn(() => true),
  dbSelect: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getLoans: mocks.getLoans,
    getMembers: mocks.getMembers,
    getContributions: mocks.getContributions,
    getPaidTotalsByLoan: mocks.getPaidTotalsByLoan,
    getLoanRepaymentsForLoans: mocks.getLoanRepaymentsForLoans,
    createReminderOnce: mocks.createReminderOnce,
    getContributionRates: mocks.getContributionRates,
  },
}));

vi.mock("../db", () => ({
  db: { select: mocks.dbSelect },
}));

vi.mock("./push", () => ({
  dispatchNotification: mocks.dispatchNotification,
  isPushConfigured: mocks.isPushConfigured,
}));

import { runReminderSweep } from "./reminders";

beforeEach(() => {
  mocks.getLoans.mockResolvedValue([]);
  mocks.getMembers.mockResolvedValue([{ id: "member-1" }]);
  mocks.getContributions.mockResolvedValue([]);
  // اشتراك عائلي سارٍ منذ ٢٠٢٠ — بدونه لا شيء على العضو فلا تذكير
  mocks.getContributionRates.mockResolvedValue([
    { id: "r1", memberId: null, amount: "20.000", effectiveYear: 2020, effectiveMonth: 1 },
  ]);
  mocks.getPaidTotalsByLoan.mockResolvedValue(new Map());
  mocks.getLoanRepaymentsForLoans.mockResolvedValue([]);
  mocks.dbSelect.mockReturnValue({
    from: vi.fn().mockResolvedValue([{ id: "user-1", memberId: "member-1" }]),
  });
  mocks.createReminderOnce.mockResolvedValue({
    id: "reminder-1",
    title: "مساهمة الشهر",
    body: "تذكير",
    url: "/payments",
  });
  mocks.dispatchNotification.mockReset();
});

describe("جولة التذكيرات", () => {
  it("تسجل فشل الإرسال ولا تعدّه نجاحاً", async () => {
    mocks.dispatchNotification.mockRejectedValueOnce(new Error("push unavailable"));

    const result = await runReminderSweep(new Date(2026, 7, 24, 12, 0));

    expect(result).toMatchObject({ considered: 1, sent: 0, skipped: 0, failed: 1 });
    expect(mocks.dispatchNotification).toHaveBeenCalledTimes(1);
  });

  it("لا تنشئ تذكيراً ثانياً عند تعارض مفتاح التكرار", async () => {
    mocks.createReminderOnce.mockResolvedValueOnce(undefined);

    const result = await runReminderSweep(new Date(2026, 7, 24, 12, 0));

    expect(result).toMatchObject({ considered: 1, sent: 0, skipped: 1, failed: 0 });
    expect(mocks.dispatchNotification).not.toHaveBeenCalled();
  });

  /**
   * التذكير كان يمرّ على كل عضو بلا سؤال عن اشتراكه. فمن لا اشتراك سارياً
   * عليه — عائلة لم تحدّد مبلغاً بعد، أو عضو يبدأ اشتراكه الشهر القادم —
   * يصله «لم تُسجَّل مساهمتك». وحساب المتأخرات في المشروع نفسه يعفيه صراحةً،
   * فيتناقض ما يُقال للعضو مع ما يُحسب عليه.
   */
  it("لا تذكّر عضواً لا اشتراك سارياً عليه", async () => {
    mocks.getContributionRates.mockResolvedValue([]);

    const result = await runReminderSweep(new Date(2026, 7, 24, 12, 0));

    expect(result).toMatchObject({ considered: 0, sent: 0 });
    expect(mocks.dispatchNotification).not.toHaveBeenCalled();
  });

  it("لا تذكّر باشتراك يبدأ سريانه في شهر قادم", async () => {
    mocks.getContributionRates.mockResolvedValue([
      { id: "r1", memberId: null, amount: "20.000", effectiveYear: 2026, effectiveMonth: 10 },
    ]);

    const result = await runReminderSweep(new Date(2026, 7, 24, 12, 0)); // أغسطس

    expect(result).toMatchObject({ considered: 0, sent: 0 });
  });

  it("تذكّر من عليه اشتراك سارٍ ولم يسجّل مساهمته", async () => {
    const result = await runReminderSweep(new Date(2026, 7, 24, 12, 0));

    expect(result).toMatchObject({ considered: 1, sent: 1 });
    expect(mocks.createReminderOnce).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: "contribution:member-1:2026-8" }),
    );
  });

  it("لا تذكّر من سجّل مساهمته ولو كانت بانتظار الاعتماد", async () => {
    mocks.getContributions.mockResolvedValue([
      { memberId: "member-1", year: 2026, month: 8, amount: "20.000", status: "pending_approval" },
    ]);

    const result = await runReminderSweep(new Date(2026, 7, 24, 12, 0));

    expect(result).toMatchObject({ considered: 0, sent: 0 });
  });

  it("سعر العضو الخاص يغلب العائلي", async () => {
    mocks.getContributionRates.mockResolvedValue([
      { id: "r1", memberId: null, amount: "20.000", effectiveYear: 2020, effectiveMonth: 1 },
      { id: "r2", memberId: "member-1", amount: "0", effectiveYear: 2026, effectiveMonth: 1 },
    ]);

    // اشتراكه صفر ⇒ لا شيء عليه
    const result = await runReminderSweep(new Date(2026, 7, 24, 12, 0));
    expect(result).toMatchObject({ considered: 0, sent: 0 });
  });
});