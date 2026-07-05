import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

// مصادقة وهمية: الهوية تمرر عبر ترويسة x-test-user لاختبار قواعد الصلاحيات فقط
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
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "غير مسموح - صلاحيات المدير مطلوبة" });
    }
    req.user = user;
    next();
  },
}));

vi.mock("../capital-engine", () => ({ rebalanceYear: vi.fn() }));

vi.mock("../storage", () => {
  const echoContribution = vi.fn(async (data: any) => ({ id: "c1", ...data }));
  const echoLoan = vi.fn(async (data: any) => ({ id: "l1", createdAt: new Date(), approvedAt: null, ...data }));
  return {
    storage: {
      getFamilySettings: vi.fn(async () => ({ emergencyMode: false })),
      getContributions: vi.fn(async () => []),
      getContributionsByYear: vi.fn(async () => []),
      getContributionsByMember: vi.fn(async () => []),
      getContributionByMemberYearMonth: vi.fn(async () => undefined),
      createContribution: echoContribution,
      getLoans: vi.fn(async () => [
        { id: "loan-a", memberId: "m1", amount: "100", status: "approved" },
        { id: "loan-b", memberId: "m2", amount: "50", status: "approved" },
      ]),
      getLoansByMember: vi.fn(async () => []),
      getAllLoanPayments: vi.fn(async () => []),
      getLoan: vi.fn(async (id: string) => ({
        id,
        memberId: "m2",
        title: "سلفة اختبار",
        amount: "50",
        status: "approved",
        description: null,
        type: "standard",
        repaymentType: "open",
        repaymentMonths: null,
        createdAt: new Date(),
        approvedAt: new Date(),
      })),
      getLoanPayments: vi.fn(async () => []),
      getMember: vi.fn(async () => ({ id: "m2", name: "عضو تجريبي" })),
      createLoan: echoLoan,
      createLoanRepayments: vi.fn(async () => []),
      updateLoan: vi.fn(async (id: string, data: any) => ({ id, ...data })),
      updateLoanStatus: vi.fn(),
      deleteLoan: vi.fn(async () => undefined),
      createAuditLog: vi.fn(async () => ({})),
    },
  };
});

import { registerContributionRoutes } from "./contributions";
import { registerLoanRoutes } from "./loans";

let server: Server;
let baseUrl: string;

const memberUser = JSON.stringify({ id: "u1", role: "user", memberId: "m1", username: "member1" });
const orphanUser = JSON.stringify({ id: "u2", role: "user", memberId: null, username: "orphan" });
const adminUser = JSON.stringify({ id: "u3", role: "admin", memberId: null, username: "admin" });

function request(path: string, options: RequestInit & { user?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.user) headers["x-test-user"] = options.user;
  return fetch(baseUrl + path, { ...options, headers });
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerContributionRoutes(app);
  registerLoanRoutes(app);
  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("قواعد أمان المساهمات", () => {
  it("العضو لا يستطيع اعتماد مساهمته ذاتياً — تُجبر على قيد الاعتماد", async () => {
    const res = await request("/api/contributions", {
      method: "POST",
      user: memberUser,
      body: JSON.stringify({ memberId: "m1", year: 2026, month: 7, amount: "10", status: "approved" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pending_approval");
  });

  it("العضو لا يستطيع تسجيل مساهمة باسم عضو آخر", async () => {
    const res = await request("/api/contributions", {
      method: "POST",
      user: memberUser,
      body: JSON.stringify({ memberId: "m2", year: 2026, month: 8, amount: "10" }),
    });
    expect(res.status).toBe(403);
  });

  it("المدير يستطيع الاعتماد المباشر عند الإنشاء", async () => {
    const res = await request("/api/contributions", {
      method: "POST",
      user: adminUser,
      body: JSON.stringify({ memberId: "m2", year: 2026, month: 9, amount: "10", status: "approved" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("approved");
  });
});

describe("قواعد أمان السلف", () => {
  it("مستخدم بلا عضوية مرتبطة يرى قائمة فارغة لا كل البيانات", async () => {
    const res = await request("/api/loans", { user: orphanUser });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("العضو يرى سلفه فقط", async () => {
    const res = await request("/api/loans", { user: memberUser });
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].memberId).toBe("m1");
  });

  it("العضو لا يستطيع طلب سلفة باسم عضو آخر", async () => {
    const res = await request("/api/loans", {
      method: "POST",
      user: memberUser,
      body: JSON.stringify({ memberId: "m2", type: "standard", title: "سلفة", amount: "20" }),
    });
    expect(res.status).toBe(403);
  });

  it("العضو لا يستطيع إنشاء سلفة معتمدة — تُجبر على معلقة", async () => {
    const res = await request("/api/loans", {
      method: "POST",
      user: memberUser,
      body: JSON.stringify({ memberId: "m1", type: "standard", title: "سلفة", amount: "20", status: "approved" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pending");
  });

  it("حذف السلفة ممنوع على غير المدير", async () => {
    const res = await request("/api/loans/loan-b", { method: "DELETE", user: memberUser });
    expect(res.status).toBe(403);
  });

  it("تعديل السلفة ممنوع على غير المدير", async () => {
    const res = await request("/api/loans/loan-b", {
      method: "PATCH",
      user: memberUser,
      body: JSON.stringify({ title: "عبث" }),
    });
    expect(res.status).toBe(403);
  });

  it("المدير يحذف السلفة ويُوثَّق الحذف في سجل التدقيق", async () => {
    const { storage } = await import("../storage");
    const res = await request("/api/loans/loan-b", { method: "DELETE", user: adminUser });
    expect(res.status).toBe(204);
    expect(storage.deleteLoan).toHaveBeenCalledWith("loan-b");
    expect(storage.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "loan_deleted" }),
    );
  });

  it("تعديل مبلغ سلفة معتمدة مرفوض (الأقساط أُنشئت)", async () => {
    const res = await request("/api/loans/loan-b", {
      method: "PATCH",
      user: adminUser,
      body: JSON.stringify({ amount: "999" }),
    });
    expect(res.status).toBe(400);
  });
});
