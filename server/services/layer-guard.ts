import { storage } from "../storage";
import { currentLayerCapacity } from "../capital-engine";

/**
 * حارس طبقات رأس المال — يحذّر ولا يمنع.
 *
 * حدود الطبقات (محمي ٤٥٪، طوارئ ١٥٪، مرن ٢٠٪، نمو ٢٠٪) كانت محسوبة ولا تُقرأ:
 * لا مسار واحد يستشيرها قبل إخراج مال. فيجوز اعتماد سلفة تتجاوز المتاح وينزل
 * الصندوق في عجز بلا كلمة تُقال.
 *
 * والقرار الذي اختاره صاحب الصندوق: الحدّ إرشاد لا سدّ. للوصي أن يتجاوزه —
 * الطوارئ لا تنتظر نسبة — لكن **لا يمر تجاوز بلا أثر**. فهنا يُحسب الحد،
 * ويُكتب التجاوز في سجل التدقيق باسم من تجاوزه ومقداره، ويُعاد للواجهة لتخبره.
 */

export interface LayerOverdraft {
  layer: string;
  layerName: string;
  available: number;
  requested: number;
  /** كم تجاوز المبلغُ المتاحَ */
  excess: number;
}

const LAYER_NAMES: Record<string, string> = {
  flexible: "رأس المال المرن",
  emergency: "احتياطي الطوارئ",
  growth: "رأس مال النمو",
  protected: "رأس المال المحمي",
};

interface OverrideContext {
  entityType: string;
  entityId: string;
  actorUserId: string | null;
  actorName: string;
  /** وصف ما أُخرج من المال — يظهر في السجل كما هو */
  subject: string;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** يبني بيان التجاوز ويكتبه في السجل، أو يعيد null إن كان المبلغ داخل الحد */
async function record(
  check: { allowed: boolean; layer: string; available: number; requested: number },
  context: OverrideContext,
): Promise<LayerOverdraft | null> {
  const overdraft = describe(check);
  if (!overdraft) return null;

  await storage.createAuditLog({
    action: "capital_layer_exceeded",
    entityType: context.entityType,
    entityId: context.entityId,
    actorUserId: context.actorUserId,
    actorName: context.actorName,
    description:
      `تجاوز حدّ ${overdraft.layerName}: ${context.subject} بمبلغ ` +
      `${overdraft.requested.toLocaleString()} ر.ع والمتاح ${overdraft.available.toLocaleString()} ر.ع ` +
      `(تجاوز ${overdraft.excess.toLocaleString()} ر.ع)`,
    metadata: { ...overdraft, subject: context.subject },
  });

  return overdraft;
}

const layerOf = (category: string) => (category === "emergency" ? "emergency" : "flexible");

/**
 * المتاح في طبقة قبل عملية بعينها.
 *
 * `alreadyWritten` تميّز الحالتين: الفحص المسبق (الصف لم يُكتب بعد فالمستهلَك
 * لا يعرفه) والفحص بعد الكتابة (مبلغه داخل المستهلَك فيُطرح منه). الحسبة
 * واحدة في الحالتين حتى لا تقول نافذة التأكيد شيئاً ويقول السجل غيره.
 */
async function headroom(amount: number, layer: string, year: number, alreadyWritten: boolean) {
  // السلفة والمصروف ينقصان صافي الأصول بمبلغهما، والطبقة نسبة منه. فلو قِيس
  // بعد الكتابة على الصافي الجديد لصغرت الطبقة وكبر التجاوز — ولقالت نافذة
  // التأكيد رقماً ويقول السجل غيره. الدلتا تعيد الصافي إلى ما كان.
  const capacity = await currentLayerCapacity(year, alreadyWritten ? amount : 0);
  const entry = capacity[layer] ?? { amount: 0, used: 0 };
  const usedBefore = alreadyWritten ? entry.used - amount : entry.used;
  return entry.amount - usedBefore;
}

async function check(amount: number, layer: string, year: number, alreadyWritten: boolean) {
  const availableBefore = await headroom(amount, layer, year, alreadyWritten);
  return {
    allowed: amount <= availableBefore + 0.0005,
    layer,
    available: Math.max(0, availableBefore),
    requested: amount,
  };
}

/** يبني بيان التجاوز بلا كتابة شيء — لنافذة التأكيد قبل التنفيذ */
function describe(check: { allowed: boolean; layer: string; available: number; requested: number }): LayerOverdraft | null {
  if (check.allowed) return null;
  return {
    layer: check.layer,
    layerName: LAYER_NAMES[check.layer] ?? check.layer,
    available: round(check.available),
    requested: round(check.requested),
    excess: round(check.requested - check.available),
  };
}

/** فحص مسبق لسلفة — قبل كتابتها، بلا أثر في السجل */
export async function previewLoan(amount: number, year: number): Promise<LayerOverdraft | null> {
  return describe(await check(amount, "flexible", year, false));
}

/** فحص مسبق لمصروف — قبل كتابته، بلا أثر في السجل */
export async function previewExpense(
  amount: number,
  category: string,
  year: number,
): Promise<LayerOverdraft | null> {
  return describe(await check(amount, layerOf(category), year, false));
}

/** يفحص سلفة على الطبقة المرنة ويوثّق تجاوزها إن وقع */
export async function guardLoan(
  amount: number,
  year: number,
  context: OverrideContext,
): Promise<LayerOverdraft | null> {
  return record(await check(amount, "flexible", year, true), context);
}

/** يفحص مصروفاً على طبقته (الطوارئ لمصروف الطوارئ، والمرن لما عداه) */
export async function guardExpense(
  amount: number,
  category: string,
  year: number,
  context: OverrideContext,
): Promise<LayerOverdraft | null> {
  return record(await check(amount, layerOf(category), year, true), context);
}
