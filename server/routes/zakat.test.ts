import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

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

vi.mock("../capital-engine", () => ({ rebalanceYear: vi.fn(async () => ({})) }));

// المعاملات تُختبر مقابل قاعدة حقيقية، لا هنا — هذا الاختبار يعنى بمنطق المسار
vi.mock("../db", () => ({ withTransaction: (fn: () => unknown) => fn() }));
vi.mock("../services/dashboard", () => ({
  computeDashboardSummary: vi.fn(async () => ({ netCapital: 10000 })),
}));

const state = {
  cycles: [] as any[],
  expenses: [] as any[],
  audits: [] as any[],
  nisab: "1000",
};

vi.mock("../storage", () => ({
  storage: {
    getZakatCycles: vi.fn(async () => state.cycles),
    getZakatCycle: vi.fn(async (id: string) => state.cycles.find((c) => c.id === id)),
    getOpenZakatCycle: vi.fn(async () => state.cycles.find((c) => c.status !== "paid")),
    createZakatCycle: vi.fn(async (data: any) => {
      const row = { id: `z${state.cycles.length + 1}`, status: "open", dueAt: null, expenseId: null, paidAt: null, ...data };
      state.cycles.push(row);
      return row;
    }),
    updateZakatCycle: vi.fn(async (id: string, data: any) => {
      const row = state.cycles.find((c) => c.id === id);
      Object.assign(row, data);
      return row;
    }),
    getFamilySettings: vi.fn(async () => ({ zakatNisab: state.nisab })),
    createExpense: vi.fn(async (data: any) => {
      const row = { id: `e${state.expenses.length + 1}`, ...data };
      state.expenses.push(row);
      return row;
    }),
    createAuditLog: vi.fn(async (log: any) => {
      state.audits.push(log);
      return log;
    }),
  },
}));

import { registerZakatRoutes } from "./zakat";

let server: Server;
let baseUrl: string;
const admin = JSON.stringify({ id: "u1", role: "admin", username: "admin" });
const member = JSON.stringify({ id: "u2", role: "user", username: "member" });

function request(path: string, init: RequestInit = {}, user?: string) {
  return fetch(baseUrl + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": user } : {}) },
  });
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerZakatRoutes(app);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.cycles = [];
  state.expenses = [];
  state.audits = [];
  state.nisab = "1000";
});

afterEach(() => vi.useRealTimers());

describe("حاسبة الزكاة", () => {
  it("تعرض المتبقي للحول قبل اكتماله", async () => {
    vi.setSystemTime(new Date(2026, 0, 1));
    await request("/api/zakat/cycles", { method: "POST", body: "{}" }, admin);

    vi.setSystemTime(new Date(2026, 6, 1)); // ~181 يوماً
    const body = await (await request("/api/zakat", {}, admin)).json();
    expect(body.currentCycle.hawlComplete).toBe(false);
    expect(body.currentCycle.daysRemaining).toBeGreaterThan(0);
    expect(body.estimate.amount).toBe(250); // 2.5٪ من 10000
  });

  it("لا تسمح بدورتين مفتوحتين في وقت واحد", async () => {
    await request("/api/zakat/cycles", { method: "POST", body: "{}" }, admin);
    const res = await request("/api/zakat/cycles", { method: "POST", body: "{}" }, admin);
    expect(res.status).toBe(400);
  });

  it("الإخراج يُنشئ مصروفاً بتصنيف زكاة ويقفل الدورة", async () => {
    vi.setSystemTime(new Date(2025, 0, 1));
    await request("/api/zakat/cycles", { method: "POST", body: "{}" }, admin);
    vi.setSystemTime(new Date(2026, 0, 10)); // تجاوز 354 يوماً

    const res = await request("/api/zakat/cycles/z1/pay", { method: "POST", body: "{}" }, admin);
    expect(res.status).toBe(200);
    expect(state.expenses[0]).toMatchObject({ category: "zakat", amount: "250.000" });
    expect(state.cycles[0].status).toBe("paid");
    expect(state.audits.map((a) => a.action)).toContain("zakat_paid");

    // لا يُخرج مرتين
    expect((await request("/api/zakat/cycles/z1/pay", { method: "POST", body: "{}" }, admin)).status).toBe(400);
  });

  it("بلا نصاب محدد لا زكاة ولا مصروف", async () => {
    state.nisab = "0";
    await request("/api/zakat/cycles", { method: "POST", body: "{}" }, admin);
    const body = await (await request("/api/zakat", {}, admin)).json();
    expect(body.estimate.reachesNisab).toBe(false);
    expect(body.estimate.amount).toBe(0);

    const pay = await request("/api/zakat/cycles/z1/pay", { method: "POST", body: "{}" }, admin);
    expect(pay.status).toBe(400);
    expect(state.expenses).toHaveLength(0);
  });

  it("العضو العادي محجوب عن الزكاة", async () => {
    expect((await request("/api/zakat", {}, member)).status).toBe(403);
    expect((await request("/api/zakat/cycles", { method: "POST", body: "{}" }, member)).status).toBe(403);
  });
});
