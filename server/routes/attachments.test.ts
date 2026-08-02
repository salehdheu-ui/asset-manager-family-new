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

const state = { files: [] as any[], audits: [] as any[] };

vi.mock("../storage", () => ({
  storage: {
    getAttachments: vi.fn(async (entityType: string, entityId: string) =>
      state.files.filter((f) => f.entityType === entityType && f.entityId === entityId)
        .map(({ content, ...rest }) => rest)),
    getAttachment: vi.fn(async (id: string) => state.files.find((f) => f.id === id)),
    createAttachment: vi.fn(async (data: any) => {
      const row = { id: `a${state.files.length + 1}`, createdAt: new Date(), ...data };
      state.files.push(row);
      const { content, ...rest } = row;
      return rest;
    }),
    deleteAttachment: vi.fn(async (id: string) => {
      state.files = state.files.filter((f) => f.id !== id);
    }),
    createAuditLog: vi.fn(async (log: any) => {
      state.audits.push(log);
      return log;
    }),
  },
}));

import { registerAttachmentRoutes, MAX_ATTACHMENT_BYTES } from "./attachments";

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

const smallPng = Buffer.from("صورة تحويل صغيرة").toString("base64");

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  registerAttachmentRoutes(app);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.files = [];
  state.audits = [];
});

describe("مرفقات الإيصالات", () => {
  it("العضو يرفق إثبات تحويل مع مساهمته", async () => {
    const res = await request("/api/attachments", {
      method: "POST",
      body: JSON.stringify({ entityType: "contribution", entityId: "c1", fileName: "تحويل.png", mimeType: "image/png", content: smallPng }),
    }, member);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).not.toHaveProperty("content"); // المحتوى لا يُعاد في الرد
    expect(state.audits.map((a) => a.action)).toContain("attachment_uploaded");
  });

  it("يرفض نوع ملف غير مدعوم", async () => {
    const res = await request("/api/attachments", {
      method: "POST",
      body: JSON.stringify({ entityType: "expense", entityId: "e1", fileName: "خبيث.exe", mimeType: "application/x-msdownload", content: smallPng }),
    }, member);
    expect(res.status).toBe(400);
    expect(state.files).toHaveLength(0);
  });

  it("يرفض ملفاً يتجاوز الميغابايت", async () => {
    const big = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1024, 1).toString("base64");
    const res = await request("/api/attachments", {
      method: "POST",
      body: JSON.stringify({ entityType: "expense", entityId: "e1", fileName: "كبير.pdf", mimeType: "application/pdf", content: big }),
    }, member);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("1 ميغابايت");
    expect(state.files).toHaveLength(0);
  });

  it("القائمة تُرجع مرفقات الكيان المطلوب فقط وبلا محتوى", async () => {
    await request("/api/attachments", { method: "POST", body: JSON.stringify({ entityType: "contribution", entityId: "c1", fileName: "أ.png", mimeType: "image/png", content: smallPng }) }, member);
    await request("/api/attachments", { method: "POST", body: JSON.stringify({ entityType: "expense", entityId: "e1", fileName: "ب.png", mimeType: "image/png", content: smallPng }) }, member);

    const rows = await (await request("/api/attachments?entityType=contribution&entityId=c1", {}, member)).json();
    expect(rows).toHaveLength(1);
    expect(rows[0].fileName).toBe("أ.png");
    expect(rows[0]).not.toHaveProperty("content");
  });

  it("مسار التنزيل يعيد الملف نفسه لا قائمة", async () => {
    await request("/api/attachments", { method: "POST", body: JSON.stringify({ entityType: "expense", entityId: "e1", fileName: "فاتورة.pdf", mimeType: "application/pdf", content: smallPng }) }, member);
    const res = await request("/api/attachments/a1/download", {}, member);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).toString("utf8")).toBe("صورة تحويل صغيرة");
  });

  it("الحذف للوصي وحده", async () => {
    await request("/api/attachments", { method: "POST", body: JSON.stringify({ entityType: "expense", entityId: "e1", fileName: "ف.pdf", mimeType: "application/pdf", content: smallPng }) }, member);
    expect((await request("/api/attachments/a1", { method: "DELETE" }, member)).status).toBe(403);
    expect((await request("/api/attachments/a1", { method: "DELETE" }, admin)).status).toBe(200);
    expect(state.files).toHaveLength(0);
  });

  it("بلا تسجيل دخول لا رفع ولا قراءة", async () => {
    expect((await request("/api/attachments?entityType=expense&entityId=e1")).status).toBe(401);
    expect((await request("/api/attachments", { method: "POST", body: "{}" })).status).toBe(401);
  });
});
