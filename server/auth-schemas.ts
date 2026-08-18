import { z } from "zod";

export const usernameSchema = z.string()
  .trim()
  .min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل")
  .max(64, "اسم المستخدم طويل جداً")
  .regex(/^[A-Za-z0-9._\-\u0600-\u06FF]+$/, "اسم المستخدم يحتوي على رموز غير مسموحة");

export const passwordSchema = z.string()
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
  .max(128, "كلمة المرور طويلة جداً");

const optionalText = (max: number) => z.string().trim().max(max).optional();
const optionalEmail = z.string().trim().max(320).email("البريد الإلكتروني غير صحيح").optional();

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  username: usernameSchema,
});

export const resetPasswordSchema = z.object({
  username: usernameSchema,
  code: z.string().trim().regex(/^\d{6}$/, "كود الاستعادة يجب أن يكون 6 أرقام"),
  newPassword: passwordSchema,
});

export const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  firstName: optionalText(100),
  lastName: optionalText(100),
  email: optionalEmail,
  role: z.enum(["admin", "user"]).default("user"),
  memberId: z.string().trim().max(128).nullable().optional(),
});

export const updateUserSchema = z.object({
  username: usernameSchema.optional(),
  firstName: optionalText(100),
  lastName: optionalText(100),
  email: optionalEmail.nullable(),
  role: z.enum(["admin", "user"]).optional(),
  memberId: z.string().trim().max(128).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, "يجب إرسال حقل واحد على الأقل");

export const updatePasswordSchema = z.object({ password: passwordSchema });
