import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateVAPIDKeys: vi.fn(() => ({ publicKey: "generated-public", privateKey: "generated-private" })),
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
  getDueNotifications: vi.fn(),
  claimScheduledNotification: vi.fn(),
  getPushSubscriptions: vi.fn(),
  touchPushSubscription: vi.fn(),
  deletePushSubscription: vi.fn(),
  updateNotification: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: mocks.generateVAPIDKeys,
    setVapidDetails: mocks.setVapidDetails,
    sendNotification: mocks.sendNotification,
  },
}));

vi.mock("../storage", () => ({
  storage: {
    getDueNotifications: mocks.getDueNotifications,
    claimScheduledNotification: mocks.claimScheduledNotification,
    getPushSubscriptions: mocks.getPushSubscriptions,
    touchPushSubscription: mocks.touchPushSubscription,
    deletePushSubscription: mocks.deletePushSubscription,
    updateNotification: mocks.updateNotification,
  },
}));

vi.mock("../db", () => ({ db: {} }));

const notification = {
  id: "notification-1",
  title: "اختبار",
  body: "نص الاختبار",
  url: "/",
  audience: "user" as const,
  targetUserId: "user-1",
  status: "sending",
  scheduledAt: new Date(),
};

let push: typeof import("./push");

beforeEach(async () => {
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  push = await import("./push");

  mocks.sendNotification.mockReset();
  mocks.getDueNotifications.mockReset();
  mocks.claimScheduledNotification.mockReset();
  mocks.getPushSubscriptions.mockReset();
  mocks.touchPushSubscription.mockReset();
  mocks.deletePushSubscription.mockReset();
  mocks.updateNotification.mockReset();
  mocks.setVapidDetails.mockClear();

  mocks.getPushSubscriptions.mockResolvedValue([
    { endpoint: "https://push.example.test/subscription", p256dh: "p256dh", auth: "auth" },
  ]);
  mocks.touchPushSubscription.mockResolvedValue(undefined);
  mocks.updateNotification.mockResolvedValue(notification);
  await push.initPush();
});

afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

describe("عامل الإشعارات المجدولة", () => {
  it("يعيد المحاولة عند الخطأ المؤقت ثم يسجل التسليم الناجح", async () => {
    mocks.getDueNotifications.mockResolvedValue([notification]);
    mocks.claimScheduledNotification.mockResolvedValue(notification);
    mocks.sendNotification
      .mockRejectedValueOnce(Object.assign(new Error("temporary outage"), { statusCode: 503 }))
      .mockResolvedValueOnce({});

    const processed = await push.runScheduledNotificationSweep(new Date());

    expect(processed).toBe(1);
    expect(mocks.sendNotification).toHaveBeenCalledTimes(2);
    expect(mocks.updateNotification).toHaveBeenCalledWith(
      "notification-1",
      expect.objectContaining({ status: "sent", deliveredCount: 1, failedCount: 0 }),
    );
  });

  it("لا يبدأ جولة ثانية أثناء الجولة الأولى", async () => {
    let release!: (value: unknown[]) => void;
    const pending = new Promise<unknown[]>((resolve) => {
      release = resolve;
    });
    mocks.getDueNotifications.mockReturnValueOnce(pending);

    const first = push.runScheduledNotificationSweep(new Date());
    const second = await push.runScheduledNotificationSweep(new Date());

    expect(second).toBe(0);
    release([]);
    expect(await first).toBe(0);
    expect(mocks.getDueNotifications).toHaveBeenCalledTimes(1);
  });
});
