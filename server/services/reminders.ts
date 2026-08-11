import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/models/auth";
import {
  MONTHLY_DUE_DAY,
  isMonthDue,
  overdueInstallments,
  upcomingInstallments,
} from "@shared/finance";
import { dispatchNotification, isPushConfigured } from "./push";

/**
 * التذكيرات التلقائية.
 *
 * كانت الإشعارات مكبِّر صوت يدوي: لا شيء يصل العضو ما لم يكتبه الوصي بنفسه.
 * هذا يقلب الاتجاه — النظام يلاحظ القسط المستحق والمساهمة الغائبة ويذكّر صاحبها.
 *
 * ثلاث قواعد تحكم السلوك:
 *  • التذكير يذهب لصاحب الالتزام وحده، لا للعائلة كلها — لا فضح لأحد.
 *  • لا يتكرر التذكير نفسه أبداً، مهما أُعيد تشغيل الخادم أو تكررت الدورة.
 *  • بلا مفاتيح VAPID لا يُكتب شيء ولا يُرسل شيء.
 */

/** كم يوماً قبل المهلة نذكّر بالقسط */
const REMIND_BEFORE_DAYS = 3;

/** فحص واحد كل ست ساعات: التذكير يومي الطابع، ولا يفيد فحصه كل دقيقة */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface Reminder {
  userId: string;
  title: string;
  body: string;
  url: string;
  dedupeKey: string;
}

/** حسابات المستخدمين مفهرسة بعضويتها — التذكير يحتاج مستخدماً لا عضواً */
async function userIdByMember(): Promise<Map<string, string>> {
  const rows = await db.select({ id: users.id, memberId: users.memberId }).from(users);
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.memberId) map.set(row.memberId, row.id);
  }
  return map;
}

const money = (value: number | string) => `${Number(value).toLocaleString("en-US")} ر.ع`;

/** يبني قائمة التذكيرات المستحقة الآن دون إرسالها */
export async function collectDueReminders(now = new Date()): Promise<Reminder[]> {
  const [loans, members, contributions, paidByLoan, userOf] = await Promise.all([
    storage.getLoans(),
    storage.getMembers(),
    storage.getContributions(),
    storage.getPaidTotalsByLoan(),
    userIdByMember(),
  ]);

  const approved = loans.filter((l) => l.status === "approved");
  const repayments = await storage.getLoanRepaymentsForLoans(approved.map((l) => l.id));

  const byLoan = new Map<string, typeof repayments>();
  for (const row of repayments) {
    const bucket = byLoan.get(row.loanId);
    if (bucket) bucket.push(row);
    else byLoan.set(row.loanId, [row]);
  }

  const reminders: Reminder[] = [];

  // ————— الأقساط —————
  for (const loan of approved) {
    const userId = userOf.get(loan.memberId);
    if (!userId) continue; // عضو بلا حساب لا سبيل لتذكيره

    const own = byLoan.get(loan.id) ?? [];
    if (own.length === 0) continue;
    const paid = paidByLoan.get(loan.id) ?? 0;

    for (const late of overdueInstallments(own, paid, now)) {
      reminders.push({
        userId,
        title: "قسط تجاوز موعده",
        body: `القسط رقم ${late.installmentNumber} من «${loan.title}» بمبلغ ${money(late.amount)} مضت مهلته.`,
        url: "/loans",
        dedupeKey: `overdue:${late.id}`,
      });
    }

    for (const soon of upcomingInstallments(own, paid, REMIND_BEFORE_DAYS, now)) {
      reminders.push({
        userId,
        title: "قسط يقترب موعده",
        body: `القسط رقم ${soon.installmentNumber} من «${loan.title}» بمبلغ ${money(soon.amount)} مستحق قبل ${MONTHLY_DUE_DAY} من الشهر.`,
        url: "/loans",
        dedupeKey: `due-soon:${soon.id}`,
      });
    }
  }

  // ————— مساهمة الشهر الجاري —————
  // قبل المهلة بأيام قليلة، ولمن لم يسجّل مساهمته بعد
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysToDeadline = MONTHLY_DUE_DAY - now.getDate();

  if (!isMonthDue(year, month, now) && daysToDeadline >= 0 && daysToDeadline <= REMIND_BEFORE_DAYS) {
    const paidThisMonth = new Set(
      contributions
        .filter((c) => c.year === year && c.month === month)
        .map((c) => c.memberId),
    );

    for (const member of members) {
      if (paidThisMonth.has(member.id)) continue;
      const userId = userOf.get(member.id);
      if (!userId) continue;

      reminders.push({
        userId,
        title: "مساهمة الشهر",
        body: `لم تُسجَّل مساهمتك لشهر ${month}/${year} بعد — المهلة حتى ${MONTHLY_DUE_DAY} من الشهر.`,
        url: "/payments",
        dedupeKey: `contribution:${member.id}:${year}-${month}`,
      });
    }
  }

  return reminders;
}

export interface ReminderRunResult {
  considered: number;
  sent: number;
  skipped: number;
}

/**
 * ينفّذ جولة تذكير واحدة.
 *
 * التسجيل والإرسال منفصلان عمداً: يُكتب صف التذكير أولاً بمفتاح فريد، فإن كان
 * مكتوباً من قبل لم يُرسل شيء. هكذا لا يتكرر التنبيه ولو أُعيد تشغيل الخادم
 * بين الكتابة والإرسال.
 */
export async function runReminderSweep(now = new Date()): Promise<ReminderRunResult> {
  if (!isPushConfigured()) return { considered: 0, sent: 0, skipped: 0 };

  const due = await collectDueReminders(now);
  let sent = 0;
  let skipped = 0;

  for (const reminder of due) {
    const record = await storage.createReminderOnce({
      title: reminder.title,
      body: reminder.body,
      url: reminder.url,
      audience: "user",
      targetUserId: reminder.userId,
      scheduledAt: null,
      status: "sending",
      createdBy: null,
      createdByName: "تذكير تلقائي",
      dedupeKey: reminder.dedupeKey,
    });

    if (!record) {
      skipped += 1; // أُرسل من قبل
      continue;
    }

    await dispatchNotification(record).catch((error) =>
      console.error("تعذر إرسال تذكير تلقائي:", error),
    );
    sent += 1;
  }

  return { considered: due.length, sent, skipped };
}

let timer: ReturnType<typeof setInterval> | undefined;

export function startReminderScheduler() {
  if (!isPushConfigured() || timer) return;

  const sweep = () =>
    runReminderSweep().catch((error) => console.error("خطأ في جولة التذكيرات:", error));

  // جولة بعد دقيقة من الإقلاع حتى لا تزاحم بدء الخادم
  setTimeout(sweep, 60_000).unref?.();

  timer = setInterval(sweep, CHECK_INTERVAL_MS);
  timer.unref?.();
}
