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
  members: [] as any[],
  audits: [] as any[],
  footprints: {} as Record<string, { contributions: number; loans: number; accounts: number }>,
};

vi.mock("../storage", () => ({
  storage: {
    getMembers: vi.fn(async () => state.members),
    getMember: vi.fn(async (id: string) => state.members.find((m) => m.id === id)),
    createMember: vi.fn(async (data: any) => {
      const row = { id: `m${state.members.length + 1}`, role: "member", avatar: null, expectedMonthly: null, ...data };
      state.members.push(row);
      return row;
    }),
    memberFootprint: vi.fn(async (id: string) => {
      const f = state.footprints[id] ?? { contributions: 0, loans: 0, accounts: 0 };
      return { ...f, total: f.contributions + f.loans + f.accounts };
    }),
    deleteMember: vi.fn(async (id: string) => {
      state.members = state.members.filter((m) => m.id !== id);
    }),
    setMemberArchived: vi.fn(async (id: string, archived: boolean) => {
      const row = state.members.find((m) => m.id === id);
      if (!row) return undefined;
      row.archivedAt = archived ? new Date() : null;
      return row;
    }),
    updateMember: vi.fn(async (id: string, data: any) => {
      const row = state.members.find((m) => m.id === id);
      if (!row) return undefined;
      Object.assign(row, data);
      return row;
    }),
    createAuditLog: vi.fn(async (log: any) => {
      state.audits.push(log);
      return log;
    }),
  },
}));

import { registerMemberRoutes } from "./members";

let server: Server;
let baseUrl: string;
const admin = JSON.stringify({ id: "u1", role: "admin", username: "guardian" });

function request(path: string, init: RequestInit = {}, user = admin) {
  return fetch(baseUrl + path, {
    ...init,
    headers: { "Content-Type": "application/json", "x-test-user": user },
  });
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerMemberRoutes(app);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.members = [
    { id: "m1", name: "سالم", role: "member", avatar: "سا", expectedMonthly: "20.000", archivedAt: null },
    { id: "m2", name: "خالد", role: "member", avatar: "خا", expectedMonthly: null, archivedAt: null },
  ];
  state.audits = [];
  state.footprints = {};
});

/**
 * الاشتراك الشهري رقمٌ تُبنى عليه المتأخرات كلها، والرتبة تفتح صلاحيات.
 * كان `PATCH` يمرّر ما يصله إلى القاعدة بلا تحقق ولا توثيق.
 */
describe("تعديل بيانات العضو", () => {
  it("يرفض اشتراكاً شهرياً سالباً", async () => {
    const res = await request("/api/members/m1", {
      method: "PATCH",
      body: JSON.stringify({ expectedMonthly: -50 }),
    });

    expect(res.status).toBe(400);
    expect(state.members[0].expectedMonthly).toBe("20.000"); // لم يُمسّ
  });

  it("يرفض ترقية الرتبة من هذا الطريق", async () => {
    const res = await request("/api/members/m1", {
      method: "PATCH",
      body: JSON.stringify({ role: "guardian" }),
    });

    expect(res.status).toBe(400);
    expect(state.members[0].role).toBe("member");
  });

  it("يقبل التعديل المشروع ويكتب في السجل ما تغيّر", async () => {
    const res = await request("/api/members/m1", {
      method: "PATCH",
      body: JSON.stringify({ name: "سالم بن ناصر", expectedMonthly: 30 }),
    });

    expect(res.status).toBe(200);
    expect(state.members[0].expectedMonthly).toBe("30.000");

    expect(state.audits).toHaveLength(1);
    expect(state.audits[0].action).toBe("member_updated");
    expect(state.audits[0].actorName).toBe("guardian");
    expect(state.audits[0].description).toContain("الاشتراك الشهري");
    expect(state.audits[0].description).toContain("20.000");
    expect(state.audits[0].description).toContain("30.000");
    expect(state.audits[0].metadata.changes.name.to).toBe("سالم بن ناصر");
  });

  it("لا يكتب سطراً حين لا يتغيّر شيء", async () => {
    const res = await request("/api/members/m1", {
      method: "PATCH",
      body: JSON.stringify({ name: "سالم" }),
    });

    expect(res.status).toBe(200);
    expect(state.audits).toHaveLength(0);
  });

  it("يوثّق إضافة عضو جديد", async () => {
    const res = await request("/api/members", {
      method: "POST",
      body: JSON.stringify({ name: "خالد", role: "member" }),
    });

    expect(res.status).toBe(201);
    expect(state.audits.map((a) => a.action)).toContain("member_created");
  });

  it("يردّ ٤٠٤ على عضو غير موجود", async () => {
    const res = await request("/api/members/nope", {
      method: "PATCH",
      body: JSON.stringify({ name: "أحد" }),
    });
    expect(res.status).toBe(404);
  });
});

/**
 * كان الحذف معطَّلاً بالكامل حفاظاً على البيانات، لأنه كان يجرّ معه مساهمات
 * العضو وسلفه. لكن ذلك سدّ الباب على من أضاف عضواً خطأً ولا سجل له يُخشى عليه.
 */
describe("إزالة العضو", () => {
  it("يحذف عضواً لا سجل مالي له", async () => {
    const res = await request("/api/members/m2", { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(state.members.map((m) => m.id)).toEqual(["m1"]);
    expect(state.audits.map((a) => a.action)).toContain("member_deleted");
  });

  it("يرفض حذف عضو له سجل ويدلّ على الأرشفة", async () => {
    state.footprints.m2 = { contributions: 6, loans: 1, accounts: 0 };

    const res = await request("/api/members/m2", { method: "DELETE" });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.canArchive).toBe(true);
    expect(body.footprint.total).toBe(7);
    expect(body.error).toContain("6 مساهمات");
    expect(body.error).toContain("سلفة واحدة");
    expect(state.members).toHaveLength(2); // لم يُمسّ
  });

  it("يمنع الوصي من إزالة عضويته هو", async () => {
    const self = JSON.stringify({ id: "u1", role: "admin", username: "guardian", memberId: "m1" });
    const res = await request("/api/members/m1", { method: "DELETE" }, self);

    expect(res.status).toBe(409);
    expect(state.members).toHaveLength(2);
  });

  it("يؤرشف العضو بدل حذفه ويوثّق ذلك", async () => {
    const res = await request("/api/members/m2/archive", {
      method: "POST",
      body: JSON.stringify({ archived: true }),
    });

    expect(res.status).toBe(200);
    expect(state.members.find((m) => m.id === "m2").archivedAt).toBeTruthy();
    expect(state.audits.map((a) => a.action)).toContain("member_archived");
  });

  it("يعيد المؤرشَف إلى القائمة", async () => {
    state.members[1].archivedAt = new Date();

    const res = await request("/api/members/m2/archive", {
      method: "POST",
      body: JSON.stringify({ archived: false }),
    });

    expect(res.status).toBe(200);
    expect(state.members[1].archivedAt).toBeNull();
    expect(state.audits.map((a) => a.action)).toContain("member_restored");
  });

  it("القائمة تُخفي المؤرشفين ما لم يُطلبوا", async () => {
    state.members[1].archivedAt = new Date();

    const visible = await (await request("/api/members")).json();
    expect(visible.map((m: any) => m.id)).toEqual(["m1"]);

    const all = await (await request("/api/members?includeArchived=1")).json();
    expect(all).toHaveLength(2);
  });
});
