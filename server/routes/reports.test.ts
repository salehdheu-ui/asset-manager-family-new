import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

// مصادقة وهمية — الهوية عبر ترويسة x-test-user
vi.mock("../auth", () => ({
  isAuthenticated: (req: any, res: any, next: any) => {
    const raw = req.headers["x-test-user"];
    if (!raw) return res.status(401).json({ message: "غير مصرح" });
    req.user = JSON.parse(raw as string);
    next();
  },
  isAdmin: (req: any, res: any, next: any) => {
    const raw = req.headers["x-test-user"];
    const user = raw ? JSON.parse(raw as string) : null;
    if (!user || user.role !== "admin") return res.status(403).json({ message: "غير مسموح" });
    req.user = user;
    next();
  },
}));

vi.mock("../capital-engine", () => ({
  rebalanceYear: vi.fn(async () => ({
    flexible: { amount: 1000, used: 100, available: 900 },
    emergency: { amount: 500, used: 0, available: 500 },
  })),
}));

vi.mock("../services/dashboard", () => ({
  computeDashboardSummary: vi.fn(async () => ({ netCapital: 1000 })),
}));

// سيناريو ثابت: عضو ساهم 25، تسلّف 30 وسدّدها، ثم تسلّف 100 وسدّد 40 ⇒ عليه 60
const MEMBER = { id: "m1", name: "محمد", role: "member" };

let paymentsFixture: any[] = [
  { id: "p1", loanId: "l1", amount: "30", note: "سداد كامل", paidAt: new Date(2026, 6, 4) },
  { id: "p2", loanId: "l2", amount: "40", note: "دفعة أولى", paidAt: new Date(2026, 7, 1) },
];

let ratesFixture: any[] = [
  { id: "r1", memberId: null, amount: "25", effectiveYear: 2025, effectiveMonth: 1, note: null, createdAt: new Date(2025, 0, 1), createdBy: null },
];

vi.mock("../storage", () => ({
  storage: {
    getMember: vi.fn(async (id: string) => (id === MEMBER.id ? MEMBER : undefined)),
    getMembers: vi.fn(async () => [MEMBER]),
    getContributionsByMember: vi.fn(async () => [
      { id: "c1", memberId: "m1", year: 2026, month: 6, amount: "25", status: "approved", approvedAt: new Date(2026, 5, 20), createdAt: new Date(2026, 5, 20) },
    ]),
    getContributions: vi.fn(async () => [
      { id: "c1", memberId: "m1", year: 2026, month: 6, amount: "25", status: "approved", approvedAt: new Date(2026, 5, 20), createdAt: new Date(2026, 5, 20) },
    ]),
    getLoansByMember: vi.fn(async () => [
      { id: "l1", memberId: "m1", title: "سلفة أولى", type: "standard", amount: "30", status: "approved", approvedAt: new Date(2026, 6, 4), createdAt: new Date(2026, 6, 4) },
      { id: "l2", memberId: "m1", title: "سلفة أثاث", type: "standard", amount: "100", status: "approved", approvedAt: new Date(2026, 7, 1), createdAt: new Date(2026, 7, 1) },
    ]),
    getLoans: vi.fn(async () => [
      { id: "l1", memberId: "m1", amount: "30", status: "approved", approvedAt: new Date(2026, 6, 4), createdAt: new Date(2026, 6, 4) },
      { id: "l2", memberId: "m1", amount: "100", status: "approved", approvedAt: new Date(2026, 7, 1), createdAt: new Date(2026, 7, 1) },
    ]),
    getAllLoanPayments: vi.fn(async () => paymentsFixture),
    // قسط مستحق 1 أغسطس (داخل مهلة 26) وآخر 10 يوليو (مضت مهلته)
    getAllLoanRepayments: vi.fn(async () => [
      { id: "r1", loanId: "l2", installmentNumber: 1, amount: "10", dueDate: new Date(2026, 7, 1), status: "scheduled" },
      { id: "r2", loanId: "l2", installmentNumber: 2, amount: "10", dueDate: new Date(2026, 6, 10), status: "scheduled" },
    ]),
    getFamilySettings: vi.fn(async () => ({ defaultMonthlyContribution: "25" })),
    // اشتراك عائلي 25 ساري من يناير 2025 — يغطي كل نافذة الاثني عشر شهراً
    getContributionRates: vi.fn(async () => ratesFixture),
    getOpenZakatCycle: vi.fn(async () => undefined),
    getAuditLogs: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 50, totalPages: 0 })),
    getContributionsByYearAndMonth: vi.fn(async () => []),
    getLoansByYear: vi.fn(async () => []),
    getExpensesByYear: vi.fn(async () => []),
    getApprovedContributionsByYear: vi.fn(async () => []),
    getExpenses: vi.fn(async () => []),
  },
}));

import { registerReportRoutes } from "./reports";

let server: Server;
let baseUrl: string;
const admin = JSON.stringify({ id: "u1", role: "admin", username: "admin" });
const member = JSON.stringify({ id: "u2", role: "user", memberId: "m1", username: "member" });

function request(path: string, user?: string) {
  return fetch(baseUrl + path, { headers: user ? { "x-test-user": user } : {} });
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerReportRoutes(app);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("كشف حساب العضو", () => {
  it("يحسب الملخص بدقة: له 25، تسلّف 130، سدّد 70، وعليه 60", async () => {
    const res = await request(`/api/reports/member-statement/${MEMBER.id}`, admin);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toEqual({
      totalContributed: 25,
      totalBorrowed: 130,
      totalRepaid: 70,
      currentDebt: 60,
    });
  });

  it("السجل الزمني مرتب ويتتبع الدين بعد كل حركة", async () => {
    const body = await (await request(`/api/reports/member-statement/${MEMBER.id}`, admin)).json();
    const debts = body.timeline.map((e: any) => e.debtAfter);
    // مساهمة يونيو، ثم سلفة 30 وسدادها، ثم سلفة 100 وسداد 40 منها
    expect(debts).toEqual([0, 30, 0, 100, 60]);
    const dates = body.timeline.map((e: any) => new Date(e.date).getTime());
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
  });

  it("يفصّل كل سلفة بتاريخ تسلّفها ودفعات سدادها", async () => {
    const body = await (await request(`/api/reports/member-statement/${MEMBER.id}`, admin)).json();
    const settled = body.loans.find((l: any) => l.id === "l1");
    const open = body.loans.find((l: any) => l.id === "l2");
    expect(settled.settled).toBe(true);
    expect(settled.remaining).toBe(0);
    expect(open.remaining).toBe(60);
    expect(open.payments).toHaveLength(1);
    expect(open.payments[0].amount).toBe(40);
  });

  it("العضو العادي محجوب عن كشوف الحسابات", async () => {
    expect((await request(`/api/reports/member-statement/${MEMBER.id}`, member)).status).toBe(403);
    expect((await request(`/api/reports/member-statement/${MEMBER.id}`)).status).toBe(401);
  });

  it("عضو غير موجود يعيد 404", async () => {
    expect((await request("/api/reports/member-statement/ghost", admin)).status).toBe(404);
  });
});

describe("المتأخرات بالريال", () => {
  it("يحسب المتأخر بالمبلغ لا بعدد الأشهر", async () => {
    // نافذة 12 شهراً تنتهي عند يوليو 2026، والعضو ساهم في يونيو فقط
    vi.setSystemTime(new Date(2026, 7, 5, 12, 0));
    const body = await (await request("/api/reports/arrears", admin)).json();
    vi.useRealTimers();

    expect(body.windowMonths).toBe(12);
    expect(body.familyDefault).toBe(25);
    const row = body.members.find((m: any) => m.memberId === "m1");
    expect(row.expectedMonthly).toBe(25);   // لا اشتراك خاص ⇒ الافتراضي العائلي
    expect(row.expectedTotal).toBe(300);    // 25 × 12
    expect(row.paidTotal).toBe(25);
    expect(row.arrears).toBe(275);
    expect(row.missedMonths).toBe(11);
    expect(body.totalArrears).toBe(275);
  });

  it("كشف الحساب يحمل متأخرات المساهمات", async () => {
    vi.setSystemTime(new Date(2026, 7, 5, 12, 0));
    const body = await (await request(`/api/reports/member-statement/${MEMBER.id}`, admin)).json();
    vi.useRealTimers();
    expect(body.arrears.expectedMonthly).toBe(25);
    expect(body.arrears.arrears).toBe(275);
  });

  it("رفع المبلغ لا يُنشئ متأخرات على الأشهر السابقة له", async () => {
    // 25 من يناير 2025، ثم 40 من مايو 2026 — الأشهر قبل مايو تبقى على 25
    ratesFixture = [
      { id: "r1", memberId: null, amount: "25", effectiveYear: 2025, effectiveMonth: 1, note: null, createdAt: new Date(), createdBy: null },
      { id: "r2", memberId: null, amount: "40", effectiveYear: 2026, effectiveMonth: 5, note: null, createdAt: new Date(), createdBy: null },
    ];
    vi.setSystemTime(new Date(2026, 7, 5, 12, 0)); // النافذة: أغسطس 2025 ← يوليو 2026
    const body = await (await request("/api/reports/arrears", admin)).json();
    vi.useRealTimers();

    const row = body.members.find((m: any) => m.memberId === "m1");
    // 9 أشهر بـ25 (أغسطس 2025 ← أبريل 2026) + 3 أشهر بـ40 (مايو ← يوليو 2026) = 345
    expect(row.expectedTotal).toBe(345);
    expect(row.arrears).toBe(320); // ناقص 25 دفعها في يونيو
    expect(row.expectedMonthly).toBe(40); // الساري الآن

    ratesFixture = [
      { id: "r1", memberId: null, amount: "25", effectiveYear: 2025, effectiveMonth: 1, note: null, createdAt: new Date(), createdBy: null },
    ];
  });

  it("الأشهر السابقة لأول مبلغ مسجَّل لا تُحاسَب إطلاقاً", async () => {
    // أول مبلغ يبدأ من مايو 2026 فقط
    ratesFixture = [
      { id: "r1", memberId: null, amount: "30", effectiveYear: 2026, effectiveMonth: 5, note: null, createdAt: new Date(), createdBy: null },
    ];
    vi.setSystemTime(new Date(2026, 7, 5, 12, 0));
    const body = await (await request("/api/reports/arrears", admin)).json();
    vi.useRealTimers();

    const row = body.members.find((m: any) => m.memberId === "m1");
    expect(row.chargedMonths).toBe(3);   // مايو ويونيو ويوليو فقط
    expect(row.expectedTotal).toBe(90);
    expect(row.arrears).toBe(65);        // ناقص 25 دفعها في يونيو

    ratesFixture = [
      { id: "r1", memberId: null, amount: "25", effectiveYear: 2025, effectiveMonth: 1, note: null, createdAt: new Date(), createdBy: null },
    ];
  });

  it("العضو العادي محجوب عن تقرير المتأخرات", async () => {
    expect((await request("/api/reports/arrears", member)).status).toBe(403);
  });
});

describe("حصص الأعضاء", () => {
  it("العضو الوحيد يملك كامل صافي الأصول", async () => {
    const body = await (await request("/api/reports/member-shares", admin)).json();
    expect(body.netAssets).toBe(1000);
    expect(body.shares).toHaveLength(1);
    expect(body.shares[0]).toMatchObject({ memberId: "m1", name: "محمد", contributed: 25, percent: 100, value: 1000 });
  });

  it("أداء الأعضاء يعرض الحصة الحقيقية لا «مساهمات ناقص سلف»", async () => {
    const body = await (await request("/api/reports/members-performance", admin)).json();
    const row = body.members.find((m: any) => m.memberId === "m1");
    expect(row.sharePercent).toBe(100);
    expect(row.shareValue).toBe(1000);
    expect(row).not.toHaveProperty("netBalance");
  });

  it("العضو العادي محجوب عن تقرير الحصص", async () => {
    expect((await request("/api/reports/member-shares", member)).status).toBe(403);
  });
});

describe("مهلة يوم 26 في التقارير", () => {
  it("لا يُحسب متأخراً إلا القسط الذي مضت مهلة شهره", async () => {
    // بلا أي سداد: القسط المستحق 10 يوليو مضت مهلته، والمستحق 1 أغسطس ما زال داخلها
    paymentsFixture = [];
    vi.setSystemTime(new Date(2026, 7, 1, 12, 0));
    const scores = await (await request("/api/reports/commitment-scores", admin)).json();
    expect(scores[0].overdueInstallments).toBe(1);
    vi.useRealTimers();
    paymentsFixture = [
      { id: "p1", loanId: "l1", amount: "30", note: "سداد كامل", paidAt: new Date(2026, 6, 4) },
      { id: "p2", loanId: "l2", amount: "40", note: "دفعة أولى", paidAt: new Date(2026, 7, 1) },
    ];
  });

  it("السداد الحر يُبرئ الأقساط فلا تبقى متأخرة", async () => {
    // دُفع 40 على سلفة قسطاها 10 و10 ⇒ لا متأخر رغم بقاء حالتها «مجدولة»
    vi.setSystemTime(new Date(2026, 7, 1, 12, 0));
    const scores = await (await request("/api/reports/commitment-scores", admin)).json();
    expect(scores[0].overdueInstallments).toBe(0);

    const alerts = await (await request("/api/reports/alerts", admin)).json();
    expect(alerts.some((a: any) => a.title.includes("تجاوز مهلته"))).toBe(false);
    vi.useRealTimers();
  });

  it("نافذة درجة الالتزام تستثني الشهر الجاري قبل يوم 26", async () => {
    vi.setSystemTime(new Date(2026, 7, 5, 12, 0));
    const scores = await (await request("/api/reports/commitment-scores", admin)).json();
    expect(scores[0].windowMonths).toBe(12);
    // مساهمة يونيو 2026 تقع داخل النافذة المنتهية عند يوليو
    expect(scores[0].contributedMonths).toBe(1);
    vi.useRealTimers();
  });
});
