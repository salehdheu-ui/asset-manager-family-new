import type { Express } from "express";
import { storage } from "../storage";
import { insertMemberSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, isAdmin } from "../auth";
import { zodErrorResponse } from "../validation";
import { arabicCount } from "../services/arabic";

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

/** يصف ما يمنع الحذف بعبارة يفهمها الوصي، بصيغة عددٍ سليمة */
function describeFootprint(f: { contributions: number; loans: number; accounts: number }) {
  const parts: string[] = [];
  if (f.contributions > 0) parts.push(arabicCount(f.contributions, "مساهمة واحدة", "مساهمتان", "مساهمات"));
  if (f.loans > 0) parts.push(arabicCount(f.loans, "سلفة واحدة", "سلفتان", "سلف"));
  if (f.accounts > 0) parts.push(arabicCount(f.accounts, "حساب دخول مرتبط", "حسابا دخول مرتبطان", "حسابات دخول مرتبطة"));
  return parts.join(" و");
}

const FIELD_NAMES: Record<string, string> = {
  name: "الاسم",
  avatar: "الحرفان",
  expectedMonthly: "الاشتراك الشهري",
};

export function registerMemberRoutes(app: Express) {
  app.get("/api/members", isAuthenticated, async (req, res) => {
    try {
      const all = await storage.getMembers();
      // المؤرشفون خارج قائمة العائلة إلا أن تُطلب صراحةً — سجلّهم باقٍ، وهم
      // ليسوا من الحاضرين
      const members = req.query.includeArchived === "1" && req.user?.role === "admin"
        ? all
        : all.filter((m) => !m.archivedAt);
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

  /**
   * إزالة عضو.
   *
   * كان المسار مغلقاً بالكامل حفاظاً على البيانات — لأن الحذف كان يجرّ معه
   * مساهمات العضو وسلفه وأقساطه وسداداته. لكن الإغلاق سدّ الباب على من أضاف
   * عضواً خطأً، ولا سجل له أصلاً يُخشى عليه.
   *
   * فالتفريق هنا: من لا أثر مالي له يُحذف حقاً، ومن له أثر لا يُحذف بحال —
   * يُؤرشَف، فيخرج من القائمة ويبقى تاريخه كما هو.
   */
  app.delete("/api/members/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const memberId = req.params.id as string;
      const member = await storage.getMember(memberId);
      if (!member) return res.status(404).json({ error: "العضو غير موجود" });

      if (req.user?.memberId === memberId) {
        return res.status(409).json({ error: "لا تُزيل عضويتك أنت — اطلب ذلك من وصيٍّ آخر" });
      }

      const footprint = await storage.memberFootprint(memberId);
      if (footprint.total > 0) {
        return res.status(409).json({
          error:
            `له ${describeFootprint(footprint)} في الصندوق.`,
          footprint,
          canArchive: true,
        });
      }

      await storage.deleteMember(memberId);

      await storage.createAuditLog({
        action: "member_deleted",
        entityType: "member",
        entityId: memberId,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
        description: `حُذف العضو ${member.name} — لم يكن له سجل مالي`,
        metadata: { name: member.name, role: member.role },
      });

      res.status(204).send();
    } catch (error) {
      console.error("Delete member error:", error);
      res.status(500).json({ error: "تعذر حذف العضو" });
    }
  });

  // الأرشفة: يخرج من القائمة والنصاب والتذكيرات، ولا يُمسّ له صف
  app.post("/api/members/:id/archive", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const memberId = req.params.id as string;
      const archived = z.object({ archived: z.boolean().default(true) }).parse(req.body ?? {}).archived;

      const member = await storage.getMember(memberId);
      if (!member) return res.status(404).json({ error: "العضو غير موجود" });

      if (archived && req.user?.memberId === memberId) {
        return res.status(409).json({ error: "لا تُؤرشف عضويتك أنت — اطلب ذلك من وصيٍّ آخر" });
      }

      const updated = await storage.setMemberArchived(memberId, archived);

      await storage.createAuditLog({
        action: archived ? "member_archived" : "member_restored",
        entityType: "member",
        entityId: memberId,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.username ?? req.user?.firstName ?? "مشرف",
        description: archived
          ? `أُرشِف العضو ${member.name} — خرج من قائمة العائلة وبقي سجلّه`
          : `أُعيد العضو ${member.name} إلى قائمة العائلة`,
        metadata: { name: member.name },
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json(zodErrorResponse(error));
      console.error("Archive member error:", error);
      res.status(500).json({ error: "تعذر تغيير حالة العضو" });
    }
  });
}
