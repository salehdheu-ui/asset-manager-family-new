import type { Express } from "express";
import { storage } from "../storage";
import { insertMemberSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { zodErrorResponse } from "../validation";

/**
 * ما يجوز تعديله في العضو.
 *
 * كان `PATCH` يمرّر `req.body` كما هو إلى قاعدة البيانات: بلا تحقق من نوع ولا
 * من إشارة، وبلا سطر في سجل التدقيق. فيمرّ اشتراك شهري سالب يقلب حساب
 * المتأخرات، وتُرفع رتبة عضو إلى وصيّ من طريق جانبي يلتف على قواعد تعيين
 * الأمين — وكل ذلك بلا أثر يدل على من فعله ومتى.
 *
 * الرتبة ليست هنا: مسارها `assign-custodian` وحده، وله شروطه وتوثيقه.
 */
const updateMemberSchema = z.object({
  name: z.string().trim().min(1, "الاسم لا يكون فارغاً").max(120).optional(),
  avatar: z.string().trim().max(8).nullable().optional(),
  expectedMonthly: z
    .union([
      z.coerce.number().finite().nonnegative("الاشتراك الشهري لا يكون سالباً"),
      z.null(),
    ])
    .optional(),
}).strict("حقل غير مسموح بتعديله");

/** ما تغيّر فعلاً بين الصفّين — ليقول السجل ماذا صار لا أنّ شيئاً صار */
function describeChange(before: Record<string, any>, after: Record<string, any>, keys: string[]) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of keys) {
    if (String(before[key] ?? "") !== String(after[key] ?? "")) {
      changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }
  return changes;
}

const FIELD_NAMES: Record<string, string> = {
  name: "الاسم",
  avatar: "الحرفان",
  expectedMonthly: "الاشتراك الشهري",
};

export function registerMemberRoutes(app: Express) {
  app.get("/api/members", isAuthenticated, async (req, res) => {
    try {
      const members = await storage.getMembers();
      if (req.user?.role !== 'admin') {
        const ownMemberId = req.user?.memberId;
        return res.json(ownMemberId ? members.filter(m => m.id === ownMemberId) : []);
      }
      res.json(members);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  app.post("/api/members", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const data = insertMemberSchema.parse(req.body);
      const member = await storage.createMember(data);

      await storage.createAuditLog({
        action: "member_created",
        entityType: "member",
        entityId: member.id,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
        description: `أُضيف عضو جديد: ${member.name}`,
        metadata: { name: member.name, role: member.role, expectedMonthly: member.expectedMonthly ?? null },
      });

      res.status(201).json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json(zodErrorResponse(error));
      } else {
        res.status(500).json({ error: "Failed to create member" });
      }
    }
  });

  app.post("/api/members/:id/assign-custodian", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const memberId = req.params.id as string;
      const allMembers = await storage.getMembers();
      const target = allMembers.find(m => m.id === memberId);

      if (!target) {
        return res.status(404).json({ message: "العضو غير موجود" });
      }
      if (target.role === "guardian") {
        return res.status(400).json({ message: "لا يمكن تعيين الوصي أميناً للصندوق" });
      }
      if (target.role === "custodian") {
        return res.status(400).json({ message: "هذا العضو هو الأمين الحالي بالفعل" });
      }

      const previousCustodian = allMembers.find(m => m.role === "custodian");
      if (previousCustodian) {
        await storage.updateMember(previousCustodian.id, { role: "member" });
      }
      const updated = await storage.updateMember(memberId, { role: "custodian" });

      await storage.createAuditLog({
        action: "custodian_assigned",
        entityType: "member",
        entityId: memberId,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
        description: previousCustodian
          ? `تم تعيين ${target.name} أميناً للصندوق بدلاً من ${previousCustodian.name}`
          : `تم تعيين ${target.name} أميناً للصندوق`,
        metadata: {
          newCustodianId: memberId,
          newCustodianName: target.name,
          previousCustodianId: previousCustodian?.id ?? null,
          previousCustodianName: previousCustodian?.name ?? null,
        },
      });

      res.json(updated);
    } catch (error) {
      console.error("Assign custodian error:", error);
      res.status(500).json({ message: "تعذر تعيين الأمين حاليًا" });
    }
  });

  app.patch("/api/members/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const memberId = req.params.id as string;
      const data = updateMemberSchema.parse(req.body);

      const current = await storage.getMember(memberId);
      if (!current) {
        return res.status(404).json({ error: "العضو غير موجود" });
      }
      // نسخة من القيم قبل التعديل، لا إشارة إلى الصف — الإشارة قد تتغير تحتنا
      // فتصير المقارنة بين الشيء ونفسه ولا يُكتب في السجل شيء
      const before = { name: current.name, avatar: current.avatar, expectedMonthly: current.expectedMonthly };

      // الاشتراك الشهري رقم في قاعدة البيانات ونصّ في المخطط — يُوحَّد هنا
      const patch: Record<string, any> = { ...data };
      const monthly = data.expectedMonthly;
      if (monthly !== undefined) {
        patch.expectedMonthly = monthly === null ? null : monthly.toFixed(3);
      }

      const member = await storage.updateMember(memberId, patch);
      if (!member) {
        return res.status(404).json({ error: "العضو غير موجود" });
      }

      // الاشتراك الشهري يقرر المتوقع من العضو، وعليه تُبنى المتأخرات كلها.
      // تغييره بلا سطر في السجل يجعل رقماً يتحرك بلا من يُسأل عنه.
      const changes = describeChange(before, member, ["name", "avatar", "expectedMonthly"]);
      if (Object.keys(changes).length > 0) {
        await storage.createAuditLog({
          action: "member_updated",
          entityType: "member",
          entityId: member.id,
          actorUserId: req.user?.id ?? null,
          actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
          description:
            `تعديل بيانات ${before.name}: ` +
            Object.entries(changes)
              .map(([key, c]) => `${FIELD_NAMES[key] ?? key} من «${c.from ?? "—"}» إلى «${c.to ?? "—"}»`)
              .join("، "),
          metadata: { changes },
        });
      }

      res.json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json(zodErrorResponse(error));
      }
      console.error("Update member error:", error);
      res.status(500).json({ error: "تعذر تعديل بيانات العضو" });
    }
  });

  app.delete("/api/members/:id", isAuthenticated, isAdmin, async (_req, res) => {
    return res.status(403).json({ error: "تم تعطيل الحذف النهائي حفاظاً على البيانات" });
  });
}
