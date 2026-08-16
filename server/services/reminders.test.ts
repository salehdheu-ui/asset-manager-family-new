import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLoans: vi.fn(),
  getMembers: vi.fn(),
  getContributions: vi.fn(),
  getPaidTotalsByLoan: vi.fn(),
  getLoanRepaymentsForLoans: vi.fn(),
  createReminderOnce: vi.fn(),
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
});
