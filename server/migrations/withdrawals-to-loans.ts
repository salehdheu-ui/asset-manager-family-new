import { db } from "../db";
import { fundAdjustments, loans } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function migrateWithdrawalsToLoans(): Promise<void> {
  try {
    const withdrawals = await db
      .select()
      .from(fundAdjustments)
      .where(eq(fundAdjustments.type, "withdrawal"));

    if (withdrawals.length === 0) return;

    console.log(`[Migration] تحويل ${withdrawals.length} سحب مباشر إلى قروض غير عاجلة...`);

    for (const withdrawal of withdrawals) {
      if (!withdrawal.memberId) {
        console.warn(`[Migration] تم تجاوز سحب مباشر بدون عضو مرتبط: ${withdrawal.id}`);
        continue;
      }

      await db.insert(loans).values({
        memberId: withdrawal.memberId,
        type: "standard",
        title: withdrawal.description ? `سلفة غير عاجلة - ${withdrawal.description}` : "سلفة غير عاجلة",
        amount: withdrawal.amount,
        status: "approved",
        repaymentMonths: null,
        approvedAt: withdrawal.createdAt || new Date(),
      });

      await db.delete(fundAdjustments).where(eq(fundAdjustments.id, withdrawal.id));
    }

    console.log(`[Migration] اكتملت عملية الترحيل بنجاح.`);
  } catch (error) {
    console.error("[Migration] تعذر تحويل السحوبات المباشرة إلى قروض غير عاجلة:", error);
  }
}
