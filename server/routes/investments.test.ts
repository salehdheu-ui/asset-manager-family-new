import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

// طبقة النمو: 1000 مخصصة، المستخدم يتغير بحسب الاستثمارات القائمة
let growthUsed = 0;
vi.mock("../capital-engine", () => ({
  rebalanceYear: vi.fn(async () => ({
    year: 2026,
    netAssets: 5000,
    locked: true,
    protected: { amount: 2250, percent: 45 },
    emergency: { amount: 750, percent: 15, used: 0, available: 750 },
    flexible: { amount: 1000, percent: 20, used: 0, available: 1000 },
    growth: { amount: 1000, percent: 20, used: growthUsed, available: Math.max(0, 1000 - growthUsed) },
  })),
}));

// المعاملات تُختبر مقابل قاعدة حقيقية، لا هنا — هذا الاختبار يعنى بمنطق المسار
vi.mock("../db", () => ({ withTransaction: (fn: () => unknown) => fn() }));

const state = {
  investments: [] as any[],
  valuations: [] as any[],
  adjustments: [] as any[],
  audits: [] as any[],
};

vi.mock("../storage", () => ({
  storage: {
    getInvestments: vi.fn(async () => state.investments),
    getInvestment: vi.fn(async (id: string) => state.investments.find((i) => i.id === id)),
    createInvestment: vi.fn(async (data: any) => {
      const row = { id: `inv${state.investments.length + 1}`, status: "active", exitedAt: null, exitValue: null, note: null, ...data };
      state.investments.push(row);
      growthUsed += Number(row.amount);
      return row;
    }),
    updateInvestment: vi.fn(async (id: string, data: any) => {
      const row = state.investments.find((i) => i.id === id);
      Object.assign(row, data);
      if (data.status === "exited") growthUsed -= Number(row.amount);
      return row;
    }),
    deleteInvestment: vi.fn(async (id: string) => {
      state.investments = state.investments.filter((i) => i.id !== id);
    }),
    getInvestmentValuations: vi.fn(async (id?: string) =>
      id ? state.valuations.filter((v) => v.investmentId === id) : state.valuations),
    createInvestmentValuation: vi.fn(async (data: any) => {
      const row = { id: `val${state.valuations.length + 1}`, ...data };
      state.valuations.push(row);
      return row;
    }),
    createFundAdjustment: vi.fn(async (data: any) => {
      state.adjustments.push(data);
      return data;
    }),
    createAuditLog: vi.fn(async (log: any) => {
      state.audits.push(log);
      return log;
    }),
  },
}));

import { registerInvestmentRoutes } from "./investments";

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
  registerInvestmentRoutes(app);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.investments = [];
  state.valuations = [];
  state.adjustments = [];
  state.audits = [];
  growthUsed = 0;
});

describe("سجل الاستثمارات", () => {
  it("يرفض استثماراً يتجاوز المتاح في طبقة النمو", async () => {
    const res = await request("/api/investments", {
      method: "POST",
      body: JSON.stringify({ title: "عقار كبير", type: "property", amount: "5000", startedAt: "2026-01-01" }),
    }, admin);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("طبقة النمو");
    expect(state.investments).toHaveLength(0);
  });

  it("يقبل استثماراً ضمن المتاح ويوثقه في سجل التدقيق", async () => {
    const res = await request("/api/investments", {
      method: "POST",
      body: JSON.stringify({ title: "أسهم", type: "stocks", amount: "600", startedAt: "2026-01-01" }),
    }, admin);
    expect(res.status).toBe(201);
    expect(state.audits.map((a) => a.action)).toContain("investment_created");
  });

  it("العضو العادي لا يسجل استثماراً", async () => {
    const res = await request("/api/investments", {
      method: "POST",
      body: JSON.stringify({ title: "أسهم", type: "stocks", amount: "100", startedAt: "2026-01-01" }),
    }, member);
    expect(res.status).toBe(403);
  });

  it("آخر تقييم يصير القيمة الحالية ويحسب العائد", async () => {
    await request("/api/investments", {
      method: "POST",
      body: JSON.stringify({ title: "مشروع", type: "project", amount: "500", startedAt: "2026-01-01" }),
    }, admin);
    await request("/api/investments/inv1/valuations", {
      method: "POST",
      body: JSON.stringify({ value: "650", valuedAt: "2026-06-01" }),
    }, admin);

    const body = await (await request("/api/investments", {}, admin)).json();
    const row = body.investments[0];
    expect(row.currentValue).toBe(650);
    expect(row.gain).toBe(150);
    expect(row.returnPercent).toBe(30);
    expect(body.totals.invested).toBe(500);
  });

  it("التصفية بربح تُسجَّل إيداعاً وبخسارة سحباً", async () => {
    await request("/api/investments", {
      method: "POST",
      body: JSON.stringify({ title: "عقار", type: "property", amount: "400", startedAt: "2026-01-01" }),
    }, admin);

    const res = await request("/api/investments/inv1/exit", {
      method: "POST",
      body: JSON.stringify({ exitValue: "520" }),
    }, admin);
    const body = await res.json();
    expect(body.gain).toBe(120);
    expect(state.adjustments[0]).toMatchObject({ type: "deposit", amount: "120.000" });

    // التصفية مرة ثانية مرفوضة
    const again = await request("/api/investments/inv1/exit", {
      method: "POST",
      body: JSON.stringify({ exitValue: "600" }),
    }, admin);
    expect(again.status).toBe(400);
  });

  it("التصفية بخسارة تُسجَّل سحباً", async () => {
    await request("/api/investments", {
      method: "POST",
      body: JSON.stringify({ title: "مشروع", type: "project", amount: "300", startedAt: "2026-01-01" }),
    }, admin);
    const body = await (await request("/api/investments/inv1/exit", {
      method: "POST",
      body: JSON.stringify({ exitValue: "250" }),
    }, admin)).json();
    expect(body.gain).toBe(-50);
    expect(state.adjustments[0]).toMatchObject({ type: "withdrawal", amount: "50.000" });
  });
});
