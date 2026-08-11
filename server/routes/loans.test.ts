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

vi.mock("../emergency", () => ({
  blockMembersDuringEmergency: (_req: any, _res: any, next: any) => next(),
}));

// حالة مشتركة تلعب دور قاعدة البيانات، ليتمكن اختبار الإرجاع من فحصها
const state = {
  loans: [] as any[],
  repayments: [] as any[],
  payments: [] as any[],
  audits: [] as any[],
  rebalanced: [] as number[],
  // متى تفشل إعادة التوازن — لمحاكاة انقطاع في منتصف العملية
  rebalanceFails: false,
};

function snapshot() {
  return JSON.parse(JSON.stringify({
    loans: state.loans,
    repayments: state.repayments,
    payments: state.payments,
    audits: state.audits,
  }));
}

/**
 * بديل withTransaction يحاكي الإرجاع فعلياً: يلتقط الحالة قبل التنفيذ ويعيدها
 * إن رُمي خطأ. هكذا يفشل الاختبار إن خرجت أي خطوة كتابة من داخل المعاملة.
 */
vi.mock("../db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => {
    const before = snapshot();
    try {
      return await fn();
    } catch (error) {
      state.loans = before.loans;
      state.repayments = before.repayments;
      state.payments = before.payments;
      state.audits = before.audits;
      throw error;
    }
  },
}));

vi.mock("../capital-engine", () => ({
  rebalanceYear: vi.fn(async (year: number) => {
    if (state.rebalanceFails) throw new Error("انقطاع أثناء إعادة التوازن");
    state.rebalanced.push(year);
    return {};
  }),
}));

vi.mock("../storage", () => ({
  storage: {
    getLoans: vi.fn(async () => state.loans),
    getLoansByMember: vi.fn(async (memberId: string) => state.loans.filter((l) => l.memberId === memberId)),
    getLoan: vi.fn(async (id: string) => state.loans.find((l) => l.id === id)),
    createLoan: vi.fn(async (data: any) => {
      const row = { id: `l${state.loans.length + 1}`, createdAt: new Date(), approvedAt: null, ...data };
      state.loans.push(row);
      return row;
    }),
    updateLoanStatus: vi.fn(async (id: string, status: string) => {
      const row = state.loans.find((l) => l.id === id);
      if (!row) return undefined;
      row.status = status;
      if (status === "approved") row.approvedAt = new Date();
      return row;
    }),
    createLoanRepayments: vi.fn(async (rows: any[]) => {
      state.repayments.push(...rows);
      return rows;
    }),
    getLoanRepayments: vi.fn(async (loanId: string) => state.repayments.filter((r) => r.loanId === loanId)),
    markRepaymentPaid: vi.fn(async (id: string) => {
      const row = state.repayments.find((r) => r.id === id);
      // نفس شرط التخزين الحقيقي: القسط المسدَّد لا يُعلَّم مرة ثانية
      if (!row || row.status === "paid") return undefined;
      row.status = "paid";
      row.paidAt = new Date();
      return row;
    }),
    getLoanPayments: vi.fn(async (loanId: string) => state.payments.filter((p) => p.loanId === loanId)),
    getPaidTotalsByLoan: vi.fn(async () => {
      const totals = new Map<string, number>();
      for (const p of state.payments) totals.set(p.loanId, (totals.get(p.loanId) ?? 0) + Number(p.amount));
      return totals;
    }),
    createLoanPayment: vi.fn(async (data: any) => {
      const row = { id: `p${state.payments.length + 1}`, paidAt: new Date(), ...data };
      state.payments.push(row);
      return row;
    }),
    deleteLoan: vi.fn(async (id: string) => {
      state.loans = state.loans.filter((l) => l.id !== id);
      state.repayments = state.repayments.filter((r) => r.loanId !== id);
      state.payments = state.payments.filter((p) => p.loanId !== id);
    }),
    getMember: vi.fn(async (id: string) => ({ id, name: "عضو تجريبي" })),
    createAuditLog: vi.fn(async (log: any) => {
      state.audits.push(log);
      return log;
    }),
    getLoanVotes: vi.fn(async () => []),
    countEligibleVoters: vi.fn(async () => 3),
    castLoanVote: vi.fn(async () => ({})),
    updateLoan: vi.fn(async (id: string, data: any) => {
      const row = state.loans.find((l) => l.id === id);
      Object.assign(row, data);
      return row;
    }),
  },
}));

import { registerLoanRoutes } from "./loans";

let server: Server;
let baseUrl: string;

const admin = JSON.stringify({ id: "u1", role: "admin", memberId: null, username: "admin" });
const member = JSON.stringify({ id: "u2", role: "user", memberId: "m1", username: "member" });

function request(path: string, options: RequestInit & { user?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.user) headers["x-test-user"] = options.user;
  return fetch(baseUrl + path, { ...options, headers });
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerLoanRoutes(app);
  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.loans = [];
  state.repayments = [];
  state.payments = [];
  state.audits = [];
  state.rebalanced = [];
  state.rebalanceFails = false;
});

const scheduledLoan = {
  memberId: "m1",
  title: "سلفة مجدولة",
  amount: "600",
  type: "standard",
  repaymentType: "scheduled",
  repaymentMonths: 3,
};

describe("اعتماد السلفة عملية واحدة لا تتجزأ", () => {
  it("ينشئ الأقساط ويعيد التوازن عند إنشاء سلفة معتمدة", async () => {
    const res = await request("/api/loans", {
      method: "POST",
      user: admin,
      body: JSON.stringify({ ...scheduledLoan, status: "approved" }),
    });

    expect(res.status).toBe(201);
    expect(state.loans).toHaveLength(1);
    expect(state.repayments).toHaveLength(3);
    expect(state.rebalanced).toHaveLength(1);
  });

  it("لا يترك سلفة معتمدة بلا أقساط إذا تعثرت إعادة التوازن", async () => {
    state.rebalanceFails = true;

    const res = await request("/api/loans", {
      method: "POST",
      user: admin,
      body: JSON.stringify({ ...scheduledLoan, status: "approved" }),
    });

    expect(res.status).toBe(500);
    // الإرجاع أعاد كل شيء: لا سلفة ولا أقساط نصفية
    expect(state.loans).toHaveLength(0);
    expect(state.repayments).toHaveLength(0);
  });

  it("يعتمد سلفة معلقة وينشئ جدول أقساطها", async () => {
    await request("/api/loans", { method: "POST", user: admin, body: JSON.stringify(scheduledLoan) });
    expect(state.repayments).toHaveLength(0);

    const res = await request("/api/loans/l1/status", {
      method: "PATCH",
      user: admin,
      body: JSON.stringify({ status: "approved" }),
    });

    expect(res.status).toBe(200);
    expect(state.loans[0].status).toBe("approved");
    expect(state.repayments).toHaveLength(3);
  });

  it("يرجع حالة السلفة كما كانت إذا فشل إنشاء الأقساط أو إعادة التوازن", async () => {
    await request("/api/loans", { method: "POST", user: admin, body: JSON.stringify(scheduledLoan) });
    state.rebalanceFails = true;

    const res = await request("/api/loans/l1/status", {
      method: "PATCH",
      user: admin,
      body: JSON.stringify({ status: "approved" }),
    });

    expect(res.status).toBe(500);
    // لا سلفة "معتمدة" بلا أقساط ولا تخصيص محدَّث
    expect(state.loans[0].status).toBe("pending");
    expect(state.repayments).toHaveLength(0);
  });

  it("يرفض اعتماد سلفة غير موجودة", async () => {
    const res = await request("/api/loans/ghost/status", {
      method: "PATCH",
      user: admin,
      body: JSON.stringify({ status: "rejected" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("سداد الأقساط", () => {
  async function approvedLoanWithSchedule() {
    await request("/api/loans", {
      method: "POST",
      user: admin,
      body: JSON.stringify({ ...scheduledLoan, status: "approved" }),
    });
    state.repayments.forEach((r, i) => { r.id = `r${i + 1}`; });
  }

  it("يسجل سداداً واحداً عند تعليم القسط مدفوعاً", async () => {
    await approvedLoanWithSchedule();

    const res = await request("/api/repayments/r1/pay", { method: "PATCH", user: admin });

    expect(res.status).toBe(200);
    expect(state.payments).toHaveLength(1);
    expect(state.repayments[0].status).toBe("paid");
  });

  it("لا يضاعف السداد إذا ضُغط على القسط مرتين", async () => {
    await approvedLoanWithSchedule();

    await request("/api/repayments/r1/pay", { method: "PATCH", user: admin });
    const second = await request("/api/repayments/r1/pay", { method: "PATCH", user: admin });

    expect(second.status).toBe(409);
    expect(state.payments).toHaveLength(1);
  });

  it("لا يترك قسطاً معلَّماً مدفوعاً بلا سجل سداد عند تعثر إعادة التوازن", async () => {
    await approvedLoanWithSchedule();
    state.rebalanceFails = true;

    const res = await request("/api/repayments/r1/pay", { method: "PATCH", user: admin });

    expect(res.status).toBe(500);
    expect(state.repayments[0].status).toBe("scheduled");
    expect(state.payments).toHaveLength(0);
  });

  it("يرفض سداداً يتجاوز المتبقي على السلفة", async () => {
    await approvedLoanWithSchedule();

    const res = await request("/api/loans/l1/payments", {
      method: "POST",
      user: admin,
      body: JSON.stringify({ amount: "700" }),
    });

    expect(res.status).toBe(400);
    expect(state.payments).toHaveLength(0);
  });

  it("يقبل سداداً جزئياً ضمن المتبقي", async () => {
    await approvedLoanWithSchedule();

    const res = await request("/api/loans/l1/payments", {
      method: "POST",
      user: admin,
      body: JSON.stringify({ amount: "200" }),
    });

    expect(res.status).toBe(201);
    expect(state.payments).toHaveLength(1);
    expect(state.rebalanced).toHaveLength(2);
  });
});

describe("حذف السلفة", () => {
  it("يحذف السلفة ويوثقها في سجل التدقيق معاً", async () => {
    await request("/api/loans", {
      method: "POST",
      user: admin,
      body: JSON.stringify({ ...scheduledLoan, status: "approved" }),
    });

    const res = await request("/api/loans/l1", { method: "DELETE", user: admin });

    expect(res.status).toBe(204);
    expect(state.loans).toHaveLength(0);
    expect(state.audits.filter((a) => a.action === "loan_deleted")).toHaveLength(1);
  });

  it("لا يحذف السلفة إذا تعذر إتمام بقية خطوات العملية", async () => {
    await request("/api/loans", {
      method: "POST",
      user: admin,
      body: JSON.stringify({ ...scheduledLoan, status: "approved" }),
    });
    state.rebalanceFails = true;

    const res = await request("/api/loans/l1", { method: "DELETE", user: admin });

    expect(res.status).toBe(500);
    expect(state.loans).toHaveLength(1);
    expect(state.audits.filter((a) => a.action === "loan_deleted")).toHaveLength(0);
  });
});

describe("صلاحيات السلف", () => {
  it("يمنع العضو من طلب سلفة لعضو آخر", async () => {
    const res = await request("/api/loans", {
      method: "POST",
      user: member,
      body: JSON.stringify({ ...scheduledLoan, memberId: "m9" }),
    });
    expect(res.status).toBe(403);
  });

  it("يجبر طلب العضو على البقاء معلقاً حتى لو أرسل status=approved", async () => {
    const res = await request("/api/loans", {
      method: "POST",
      user: member,
      body: JSON.stringify({ ...scheduledLoan, status: "approved" }),
    });

    expect(res.status).toBe(201);
    expect(state.loans[0].status).toBe("pending");
    expect(state.repayments).toHaveLength(0);
  });

  it("يمنع غير المدير من تغيير حالة السلفة", async () => {
    const res = await request("/api/loans/l1/status", {
      method: "PATCH",
      user: member,
      body: JSON.stringify({ status: "approved" }),
    });
    expect(res.status).toBe(403);
  });
});
