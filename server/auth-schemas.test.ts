import { describe, expect, it } from "vitest";
import {
  createUserSchema,
  loginSchema,
  resetPasswordSchema,
  updatePasswordSchema,
  updateUserSchema,
} from "./auth-schemas";

describe("مخططات تحقق المصادقة", () => {
  it("يقبل اسم مستخدم عربي وكلمة مرور صالحة", () => {
    const result = loginSchema.safeParse({ username: "عضو_العائلة", password: "كلمةمرور123" });
    expect(result.success).toBe(true);
  });

  it("يرفض اسم المستخدم القصير أو المحتوي على رموز خطرة", () => {
    expect(loginSchema.safeParse({ username: "ab", password: "12345678" }).success).toBe(false);
    expect(loginSchema.safeParse({ username: "user@example.com", password: "12345678" }).success).toBe(false);
  });

  it("يفرض طول كلمة المرور وحدودها", () => {
    expect(updatePasswordSchema.safeParse({ password: "short" }).success).toBe(false);
    expect(updatePasswordSchema.safeParse({ password: "12345678" }).success).toBe(true);
    expect(updatePasswordSchema.safeParse({ password: "x".repeat(129) }).success).toBe(false);
  });

  it("يقصر دور المستخدم على القيم المعروفة ويضع user افتراضياً", () => {
    const defaultRole = createUserSchema.safeParse({ username: "member1", password: "12345678" });
    expect(defaultRole.success).toBe(true);
    if (defaultRole.success) expect(defaultRole.data.role).toBe("user");

    expect(createUserSchema.safeParse({ username: "member1", password: "12345678", role: "owner" }).success).toBe(false);
  });

  it("يفرض كود استعادة من ستة أرقام فقط", () => {
    const valid = resetPasswordSchema.safeParse({ username: "member1", code: "123456", newPassword: "12345678" });
    expect(valid.success).toBe(true);
    expect(resetPasswordSchema.safeParse({ username: "member1", code: "12345", newPassword: "12345678" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ username: "member1", code: "12ab56", newPassword: "12345678" }).success).toBe(false);
  });

  it("يرفض تحديث مستخدم بلا أي حقل", () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
    expect(updateUserSchema.safeParse({ role: "admin" }).success).toBe(true);
  });
});
