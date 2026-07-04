import { beforeEach, describe, expect, it, vi } from "vitest";

const getFamilySettings = vi.fn();
let simulateStorageFailure = false;

vi.mock("./storage", () => ({
  storage: {
    getFamilySettings: (...args: unknown[]) => {
      if (simulateStorageFailure) {
        throw new Error("db down");
      }
      return getFamilySettings(...args);
    },
  },
}));

import { blockMembersDuringEmergency } from "./emergency";

function buildRes() {
  const res: any = { statusCode: 0, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

describe("blockMembersDuringEmergency", () => {
  beforeEach(() => {
    getFamilySettings.mockReset();
    simulateStorageFailure = false;
  });

  it("يمرر المدير دائماً حتى أثناء الطوارئ", async () => {
    const next = vi.fn();
    await blockMembersDuringEmergency({ user: { role: "admin" } } as any, buildRes(), next);
    expect(next).toHaveBeenCalled();
    expect(getFamilySettings).not.toHaveBeenCalled();
  });

  it("يمنع العضو بحالة 423 عندما يكون وضع الطوارئ مفعلاً", async () => {
    getFamilySettings.mockResolvedValue({ emergencyMode: true });
    const res = buildRes();
    const next = vi.fn();
    await blockMembersDuringEmergency({ user: { role: "user" } } as any, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(423);
  });

  it("يمرر العضو عندما يكون وضع الطوارئ معطلاً", async () => {
    getFamilySettings.mockResolvedValue({ emergencyMode: false });
    const next = vi.fn();
    await blockMembersDuringEmergency({ user: { role: "user" } } as any, buildRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("يرد 500 بدل التمرير عند فشل قراءة الإعدادات", async () => {
    const silencedError = vi.spyOn(console, "error").mockImplementation(() => {});
    simulateStorageFailure = true;
    const res = buildRes();
    const next = vi.fn();
    await blockMembersDuringEmergency({ user: { role: "user" } } as any, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    silencedError.mockRestore();
  });
});
