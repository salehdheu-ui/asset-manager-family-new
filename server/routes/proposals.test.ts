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

const state = {
  proposals: [] as any[],
  votes: [] as any[],
  audits: [] as any[],
  eligible: 5, // ⇒ النصاب 3
  // كل مصوّت وعضويته — الفرز على الأعضاء لا على الحسابات
  memberships: new Map<string, string | null>(),
};

vi.mock("../storage", () => ({
  storage: {
    getProposals: vi.fn(async () => state.proposals),
    getProposal: vi.fn(async (id: string) => state.proposals.find((p) => p.id === id)),
    createProposal: vi.fn(async (data: any) => {
      const row = { id: `p${state.proposals.length + 1}`, status: "open", decidedAt: null, closesAt: null, ...data };
      state.proposals.push(row);
      return row;
    }),
    updateProposal: vi.fn(async (id: string, data: any) => {
      const row = state.proposals.find((p) => p.id === id);
      Object.assign(row, data);
      return row;
    }),
    getProposalVotes: vi.fn(async (id: string) => state.votes.filter((v) => v.proposalId === id)),
    castProposalVote: vi.fn(async (data: any) => {
      // الطابع الزمني يهمّ: صوتا حسابين لعضو واحد يُرجَّح بينهما بالأحدث
      const now = new Date(Date.now() + state.votes.length * 1000);
      const existing = state.votes.find((v) => v.proposalId === data.proposalId && v.userId === data.userId);
      if (existing) {
        existing.vote = data.vote;
        existing.createdAt = now;
        return existing;
      }
      const row = { ...data, createdAt: now };
      state.votes.push(row);
      return row;
    }),
    countEligibleVoters: vi.fn(async () => state.eligible),
    getVoterMemberships: vi.fn(async () => state.memberships),
    createAuditLog: vi.fn(async (log: any) => {
      state.audits.push(log);
      return log;
    }),
  },
}));

import { registerProposalRoutes } from "./proposals";

let server: Server;
let baseUrl: string;
const admin = JSON.stringify({ id: "u1", role: "admin", username: "guardian" });
const voter = (n: number) => JSON.stringify({ id: `v${n}`, role: "user", username: `voter${n}` });

function request(path: string, init: RequestInit = {}, user?: string) {
  return fetch(baseUrl + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": user } : {}) },
  });
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerProposalRoutes(app);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(async () => {
  state.proposals = [];
  state.votes = [];
  state.audits = [];
  state.eligible = 5;
  // لكل مصوّت عضويته الخاصة ما لم ينصّ اختبار على غير ذلك
  state.memberships = new Map<string, string | null>([
    ["u1", "m0"],
    ["v1", "m1"], ["v2", "m2"], ["v3", "m3"], ["v4", "m4"], ["v5", "m5"],
  ]);
  await request("/api/proposals", {
    method: "POST",
    body: JSON.stringify({ title: "تعديل نسبة النمو إلى 25٪", category: "allocation" }),
  }, admin);
});

describe("قرارات العائلة", () => {
  it("الوصي وحده يطرح الاقتراح", async () => {
    const res = await request("/api/proposals", {
      method: "POST",
      body: JSON.stringify({ title: "اقتراح من عضو", category: "general" }),
    }, voter(1));
    expect(res.status).toBe(403);
  });

  it("النصاب 3 موافقين — يُعتمد الاقتراح تلقائياً عند اكتماله", async () => {
    for (const n of [1, 2]) {
      const body = await (await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "approve" }) }, voter(n))).json();
      expect(body.passed).toBe(false);
    }
    const third = await (await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "approve" }) }, voter(3))).json();
    expect(third.passed).toBe(true);
    expect(state.proposals[0].status).toBe("approved");
    expect(state.audits.map((a) => a.action)).toContain("proposal_approved");
  });

  it("تغيير الرأي يستبدل الصوت ولا يضيف صوتاً", async () => {
    await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "approve" }) }, voter(1));
    const body = await (await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "reject" }) }, voter(1))).json();
    expect(body.approve).toBe(0);
    expect(body.reject).toBe(1);
    expect(state.votes).toHaveLength(1);
  });

  it("عائلة صغيرة: النصاب لا يتجاوز عدد المؤهلين", async () => {
    state.eligible = 2;
    await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "approve" }) }, voter(1));
    const body = await (await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "approve" }) }, voter(2))).json();
    expect(body.required).toBe(2);
    expect(body.passed).toBe(true);
  });

  it("الاقتراح المغلق لا يقبل تصويتاً", async () => {
    await request("/api/proposals/p1/close", { method: "POST", body: JSON.stringify({ status: "rejected" }) }, admin);
    expect(state.proposals[0].status).toBe("rejected");
    const res = await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "approve" }) }, voter(1));
    expect(res.status).toBe(400);
  });

  it("مهلة منتهية تمنع التصويت", async () => {
    state.proposals[0].closesAt = new Date(Date.now() - 1000);
    const res = await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "approve" }) }, voter(1));
    expect(res.status).toBe(400);
  });

  it("القائمة تُظهر صوت الطالب نفسه", async () => {
    await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "reject" }) }, voter(1));
    const rows = await (await request("/api/proposals", {}, voter(1))).json();
    expect(rows[0].myVote).toBe("reject");
    const other = await (await request("/api/proposals", {}, voter(2))).json();
    expect(other[0].myVote).toBeNull();
  });

  /**
   * النصاب يُحسب بعدد الأعضاء، والأصوات كانت تُعدّ بعدد الحسابات. وعضو واحد
   * قد يملك حسابين — لا قيد تفرّد على `users.member_id`، والوصي يربط الحسابات
   * بالأعضاء بيده. فيصير عضو واحد صوتين، ويمرّ القرار برضا من هم أقلّ من النصاب.
   */
  it("العضو ذو الحسابين صوته واحد", async () => {
    // v1 و v5 حسابان لعضو واحد
    state.memberships.set("v5", "m1");

    await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "approve" }) }, voter(1));
    await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "approve" }) }, voter(5));
    const res = await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "approve" }) }, voter(2));
    const body = await res.json();

    // ثلاثة حسابات صوّتت، وهم عضوان اثنان
    expect(state.votes).toHaveLength(3);
    expect(body.approve).toBe(2);
    expect(body.required).toBe(3);
    expect(body.passed).toBe(false);
  });

  it("يمرّ القرار حين يبلغ الأعضاء النصاب حقاً", async () => {
    for (const n of [1, 2, 3]) {
      await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "approve" }) }, voter(n));
    }
    const rows = await (await request("/api/proposals", {}, admin)).json();
    expect(rows[0].approve).toBe(3);
    expect(rows[0].status).toBe("approved");
  });

  it("العضو يغيّر رأيه من حسابه الآخر فيُؤخذ الأحدث", async () => {
    state.memberships.set("v5", "m1");
    await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "approve" }) }, voter(1));
    const res = await request("/api/proposals/p1/vote", { method: "POST", body: JSON.stringify({ vote: "reject" }) }, voter(5));
    const body = await res.json();

    expect(body.approve).toBe(0);
    expect(body.reject).toBe(1);
  });
});