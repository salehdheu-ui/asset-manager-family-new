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

interface Shape {
  /** هل كُتب الصف قبل الفحص؟ عندئذٍ مبلغه داخل المستهلَك فيُطرح منه */
  written: boolean;
  /**
   * هل تُنقص العملية صافي الأصول؟
   *
   * السلفة والمصروف يخرجان من الصندوق فينقص صافيه. أما الاستثمار فالمال ينتقل
   * من نقد إلى أصل مستثمَر ولا يغادر الصندوق — صافي الأصول لا يتحرك. والخلط
   * بينهما يجعل النافذة تقول رقماً والسجل غيره.
   */
  reducesNetAssets: boolean;
}

/**
 * المتاح في طبقة قبل عملية بعينها.
 *
 * `written` تميّز الحالتين: الفحص المسبق (الصف لم يُكتب بعد فالمستهلَك لا
 * يعرفه) والفحص بعد الكتابة. الحسبة واحدة في الحالتين حتى لا تقول نافذة
 * التأكيد شيئاً ويقول السجل غيره.
 */
async function headroom(amount: number, layer: string, year: number, shape: Shape) {
  // ما ينقص صافي الأصول تصغر معه الطبقة — وهي نسبة منه. فلو قِيس بعد الكتابة
  // على الصافي الجديد لكبر التجاوز بلا سبب. الدلتا تعيد الصافي إلى ما كان.
  const delta = shape.written && shape.reducesNetAssets ? amount : 0;
  const capacity = await currentLayerCapacity(year, delta);
  const entry = capacity[layer] ?? { amount: 0, used: 0 };
  const usedBefore = shape.written ? entry.used - amount : entry.used;
  return entry.amount - usedBefore;
}

async function check(amount: number, layer: string, year: number, shape: Shape) {
  const availableBefore = await headroom(amount, layer, year, shape);
  return {
    allowed: amount <= availableBefore + 0.0005,
    layer,
    available: Math.max(0, availableBefore),
    requested: amount,
  };
}

const PAYOUT = { reducesNetAssets: true } as const;
const TRANSFER = { reducesNetAssets: false } as const;

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
  return describe(await check(amount, "flexible", year, { written: false, ...PAYOUT }));
}

/** فحص مسبق لمصروف — قبل كتابته، بلا أثر في السجل */
export async function previewExpense(
  amount: number,
  category: string,
  year: number,
): Promise<LayerOverdraft | null> {
  return describe(await check(amount, layerOf(category), year, { written: false, ...PAYOUT }));
}

/** فحص مسبق لاستثمار — قبل كتابته، بلا أثر في السجل */
export async function previewInvestment(amount: number, year: number): Promise<LayerOverdraft | null> {
  return describe(await check(amount, "growth", year, { written: false, ...TRANSFER }));
}

/** يفحص سلفة على الطبقة المرنة ويوثّق تجاوزها إن وقع */
export async function guardLoan(
  amount: number,
  year: number,
  context: OverrideContext,
): Promise<LayerOverdraft | null> {
  return record(await check(amount, "flexible", year, { written: true, ...PAYOUT }), context);
}

/** يفحص مصروفاً على طبقته (الطوارئ لمصروف الطوارئ، والمرن لما عداه) */
export async function guardExpense(
  amount: number,
  category: string,
  year: number,
  context: OverrideContext,
): Promise<LayerOverdraft | null> {
  return record(await check(amount, layerOf(category), year, { written: true, ...PAYOUT }), context);
}

/**
 * يفحص استثماراً على طبقة النمو ويوثّق تجاوزها إن وقع.
 *
 * كان الاستثمار وحده يُردّ بخطأ ٤٠٠ قاطع، ويقيس على الصف المقفل لا على صافي
 * اليوم — فصندوق فيه عشرون ألفاً يمنع استثمار ألف لأن التخصيص قُفل في يناير
 * على خمسمئة. صار كالسلفة والمصروف: يحذّر، ويمضي إن أمر الوصي، ويُكتب.
 */
export async function guardInvestment(
  amount: number,
  year: number,
  context: OverrideContext,
): Promise<LayerOverdraft | null> {
  return record(await check(amount, "growth", year, { written: true, ...TRANSFER }), context);
}
