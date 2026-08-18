import MobileLayout from "@/components/layout/MobileLayout";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Code2,
  Database,
  Download,
  Gauge,
  HeartHandshake,
  LockKeyhole,
  Network,
  Printer,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const strengths = [
  {
    icon: ShieldCheck,
    title: "أساس أمني وحوْكمي جيد",
    text: "توجد أدوار للمشرف والعضو، سجل تدقيق، معاملات مالية متعددة الخطوات، وتعطيل للحذف النهائي للمستخدمين.",
  },
  {
    icon: Wallet,
    title: "نطاق مالي غني",
    text: "المساهمات والسلف والأقساط والمصروفات والاستثمارات والزكاة وتوزيع رأس المال ممثلة في نموذج واحد مترابط.",
  },
  {
    icon: BarChart3,
    title: "تحليلات تتجاوز CRUD",
    text: "تتوفر تقارير الالتزام والمتأخرات والتدفق النقدي وحصص الأعضاء وتحليل السلف وكشوف الحساب.",
  },
  {
    icon: HeartHandshake,
    title: "ملاءمة ممتازة للعائلة العربية",
    text: "الواجهة RTL ومهيأة للجوال، مع لغة عربية واضحة، تثبيت PWA، إشعارات، وتدفقات تصويت وحوكمة.",
  },
];

const priorities = [
  {
    level: "P0",
    label: "حرج",
    tone: "red",
    title: "إغلاق ثغرة صلاحية المرفقات",
    text: "مسار تنزيل المرفق يتحقق من تسجيل الدخول فقط. يجب أن يتحقق الخادم أيضًا من حق المستخدم في رؤية الكيان المرتبط بالمرفق، وأن يمنع ربط entityId بكيان لا يملكه المستخدم.",
    effort: "منخفض إلى متوسط",
    impact: "حماية بيانات العائلة",
  },
  {
    level: "P0",
    label: "حرج",
    tone: "red",
    title: "توحيد التحقق من المدخلات",
    text: "إنشاء المستخدم وتغيير كلمة المرور وبعض العمليات الإدارية تعتمد على فحص وجود القيمة فقط. استخدم مخططات Zod مشتركة للطول والتنسيق والقيم المسموحة، مع رسائل خطأ موحدة.",
    effort: "متوسط",
    impact: "تقليل الأخطاء والعبث",
  },
  {
    level: "P1",
    label: "عالي",
    tone: "amber",
    title: "نقل المرفقات خارج قاعدة البيانات",
    text: "المرفقات محفوظة Base64 داخل PostgreSQL. هذا يضخم النسخ الاحتياطية ويرفع تكلفة القراءة. الأفضل تخزينها في Object Storage مشفر، وحفظ metadata وobject key فقط في قاعدة البيانات.",
    effort: "متوسط",
    impact: "أداء ونسخ احتياطية أفضل",
  },
  {
    level: "P1",
    label: "عالي",
    tone: "amber",
    title: "فصل المهام المجدولة عن عملية الويب",
    text: "النسخ الاحتياطي والتذكيرات تبدأ من عملية الخادم نفسها. عند تشغيل أكثر من نسخة قد تتكرر المهمة. أضف قفلًا موزعًا أو Queue/Worker أو جدولة خارجية موثوقة.",
    effort: "متوسط",
    impact: "موثوقية التشغيل",
  },
  {
    level: "P1",
    label: "عالي",
    tone: "amber",
    title: "تقسيم الحزم الكبيرة",
    text: "كشف البناء أظهر حزمًا تتجاوز 500KB، منها analytics بنحو 514KB وExcelJS بنحو 937KB. حمّل أدوات التصدير عند الطلب واستخرج charting وExcel في chunks منفصلة.",
    effort: "منخفض إلى متوسط",
    impact: "فتح أسرع على الجوال",
  },
  {
    level: "P2",
    label: "متوسط",
    tone: "blue",
    title: "تحويل مزامنة المخطط إلى migrations مُرقّمة",
    text: "المزامنة الإضافية عند الإقلاع مفيدة، لكنها لا تكفي لإدارة تغييرات الإنتاج المعقدة. اعتمد migrations versioned في CI، مع إبقاء مزامنة الإنشاء كشبكة أمان محدودة.",
    effort: "متوسط",
    impact: "قابلية نشر وتراجع أفضل",
  },
];

const roadmap = [
  {
    phase: "0",
    title: "تثبيت الأساس خلال 7–14 يومًا",
    color: "bg-red-500",
    goal: "منع المخاطر قبل إضافة مزايا جديدة.",
    items: [
      "إصلاح تفويض المرفقات على مستوى الكيان والمستخدم.",
      "توحيد Zod للتحقق من المستخدمين وكلمات المرور والنسب والمبالغ.",
      "إضافة security headers وCSRF defense-in-depth وحدود طلبات للعمليات الحساسة.",
      "إضافة اختبارات سلبية للصلاحيات: عضو يحاول قراءة أو تعديل بيانات عضو آخر.",
    ],
  },
  {
    phase: "1",
    title: "رفع قيمة المنتج خلال 2–4 أسابيع",
    color: "bg-amber-500",
    goal: "جعل أول تجربة للعائلة واضحة وسريعة.",
    items: [
      "معالج إعداد أولي من أربع خطوات: اسم العائلة، الأعضاء، المساهمة، توزيع رأس المال.",
      "لوحة رئيسية تعرض الفترة الزمنية، آخر تحديث، الرصيد المتاح، المتأخرات، والموافقات المعلقة.",
      "مركز إشعارات موحد مع تفضيلات لكل عضو وسجل قراءة.",
      "قاموس حالات عربي موحد وألوان لا تعتمد على اللون وحده، مع حالات تحميل وفراغ وخطأ قابلة للفهم.",
    ],
  },
  {
    phase: "2",
    title: "التوسع التشغيلي خلال 1–2 شهر",
    color: "bg-blue-500",
    goal: "تقليل تكلفة التشغيل وتحسين السرعة والاعتمادية.",
    items: [
      "Object Storage للمرفقات والنسخ الاحتياطية مع تشفير وروابط مؤقتة.",
      "Worker مستقل للتذكيرات والنسخ الاحتياطي، مع idempotency ومراقبة للمهام.",
      "فهرسة واستعلامات مخصصة للتقارير الثقيلة، pagination، وcaching قصير للتجميعات.",
      "تقسيم الحزم وإتاحة تصدير Excel وPDF عند الطلب بدل تحميلها في الحزمة الأساسية.",
    ],
  },
  {
    phase: "3",
    title: "منصة ناضجة خلال 2–3 أشهر",
    color: "bg-emerald-500",
    goal: "تحويل صندوق العائلة إلى منتج قابل للتوسع بثقة.",
    items: [
      "مصفوفة صلاحيات قابلة للإدارة بدل الاعتماد على admin/user فقط.",
      "سجل تغييرات قابل للتصفية والتصدير مع سبب التعديل قبل العمليات الحساسة.",
      "سيناريوهات مالية: ماذا يحدث إذا انخفضت المساهمات أو ارتفعت المتأخرات؟",
      "اختبارات استعادة دورية، مؤشرات تشغيل، تنبيهات، وبيئة staging ببيانات وهمية.",
    ],
  },
];

const kpis = [
  ["زمن الإعداد الأول", "أقل من 10 دقائق", "يقيس سهولة البدء لعائلة جديدة"],
  ["زمن فتح لوحة الجوال", "p75 أقل من 2.5 ثانية", "يقيس أثر تقسيم الحزم والاستعلامات"],
  ["تغطية الاختبارات الحساسة", "100% لمسارات الصلاحيات", "خصوصًا المرفقات والمال والنسخ"],
  ["نجاح النسخ والاستعادة", "استعادة تجريبية شهرية", "لا يكفي نجاح إنشاء النسخة فقط"],
  ["المتأخرات غير المفسرة", "صفر حالات", "كل مبلغ يجب أن يرتبط بعضو وفترة وحالة"],
  ["الأعطال الحرجة", "صفر مفتوح", "مع تنبيه واضح للمشرف"],
];

const architecture = [
  ["الواجهة", "React + Vite + Tailwind + RTL + PWA", "قوية ومناسبة للجوال", "قسّم الحزم، حسّن الوصولية، ووحّد الحالات البصرية"],
  ["API", "Express + TypeScript + مسارات domain", "واضحة ومباشرة", "أضف schemas مشتركة، pagination، وطبقة صلاحيات للموارد"],
  ["البيانات", "PostgreSQL + Drizzle + جداول مالية متعددة", "غنية وقابلة للتدقيق", "أضف migrations مرقمة، مفاتيح خارجية للهوية، وفهارس للتقارير"],
  ["المهام", "نسخ احتياطي وتذكيرات داخل عملية الخادم", "مناسبة لنسخة واحدة", "Worker أو قفل موزع عند التوسع الأفقي"],
  ["الملفات", "Base64 داخل قاعدة البيانات", "بسيطة للبداية", "Object Storage مشفر وروابط تنزيل مؤقتة"],
];

const heroMetrics: Array<[string, string, string, LucideIcon]> = [
  ["نطاق المنتج", "واسع", "مساهمات، سلف، تقارير، استثمار، زكاة، حوكمة", Rocket],
  ["الاختبارات الحالية", "تعمل", "Vitest + فحص أنواع + بناء إنتاج", CheckCircle2],
  ["أعلى أولوية", "صلاحيات المرفقات", "منع قراءة ملف لا يحق للمستخدم رؤيته", LockKeyhole],
  ["أكبر فرصة", "Onboarding", "اختصار الطريق من أول دخول إلى أول سجل مالي", Sparkles],
];

const riskTone: Record<string, string> = {
  red: "border-red-200 bg-red-50/80 text-red-800",
  amber: "border-amber-200 bg-amber-50/80 text-amber-900",
  blue: "border-blue-200 bg-blue-50/80 text-blue-900",
};

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-primary/65">{eyebrow}</p>
      <h2 className="font-heading text-2xl font-black tracking-tight text-primary sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{text}</p>
    </div>
  );
}

function Pill({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "red" | "amber" | "blue" }) {
  const styles = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-red-200 bg-red-50 text-red-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black ${styles[tone]}`}>{children}</span>;
}

export default function PlatformReview() {
  const printPage = () => window.print();

  return (
    <MobileLayout title="خارطة تطوير المنصة">
      <div className="platform-review space-y-8 pb-8 pt-2">
        <div className="no-print sticky top-0 z-30 -mx-5 border-b border-primary/10 bg-background/90 px-5 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <CircleDot className="h-4 w-4 text-emerald-600" />
              مراجعة داخلية مبنية على المستودع الحالي
            </div>
            <button onClick={printPage} className="tap-target inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-black text-primary shadow-sm transition hover:border-primary/30 hover:bg-primary/5">
              <Printer className="h-4 w-4" />
              طباعة / PDF
            </button>
          </div>
        </div>

        <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-[#0c5b3b] via-[#117a4c] to-[#d49a42] p-6 text-white shadow-[0_24px_70px_rgba(12,91,59,0.25)] sm:p-8">
          <div className="absolute -left-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-28 -right-10 h-64 w-64 rounded-full bg-black/10 blur-3xl" />
          <div className="relative z-10 max-w-3xl">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-black">FAMILY PLATFORM REVIEW</span>
              <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-bold">Commit 2c527d0</span>
            </div>
            <h1 className="font-heading text-3xl font-black leading-tight sm:text-5xl">كيف تتحول المنصة من نظام جيد إلى بنية موثوقة لنمو الثروة العائلية؟</h1>
            <p className="mt-5 max-w-2xl text-sm leading-8 text-white/85 sm:text-base">
              هذه المراجعة تقرأ المنتج كما هو في المستودع: ما الذي يعمل بشكل ممتاز، أين توجد المخاطر الأعلى، وما الذي يستحق الاستثمار أولًا حتى لا تتوسع المنصة قبل تثبيت الأمان والوضوح وسهولة الاستخدام.
            </p>
            <div className="mt-7 flex flex-wrap gap-2 text-xs font-bold text-white/90">
              <span className="rounded-xl bg-white/15 px-3 py-2">RTL + Mobile-first</span>
              <span className="rounded-xl bg-white/15 px-3 py-2">Financial workflows</span>
              <span className="rounded-xl bg-white/15 px-3 py-2">Audit & backup</span>
              <span className="rounded-xl bg-white/15 px-3 py-2">PWA + notifications</span>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {heroMetrics.map(([label, value, desc, Icon]) => (
            <div key={String(label)} className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
              <Icon className="mb-3 h-5 w-5 text-primary" />
              <p className="text-xs font-bold text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-black text-primary">{value}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{desc}</p>
            </div>
          ))}
        </section>

        <section id="summary" className="scroll-mt-24">
          <SectionTitle eyebrow="01 / الحكم التنفيذي" title="المنصة قوية وظيفيًا، وتحتاج الآن إلى ضبط الحدود قبل زيادة المزايا" text="القاعدة الحالية ممتازة كنظام داخلي لعائلة واحدة: عربية، غنية بالعمليات المالية، وتحتوي على حوكمة ونسخ احتياطية وتحليلات. أفضل قرار استراتيجي هو تخصيص دورة قصيرة لتثبيت الصلاحيات والتحقق والأداء، ثم الاستثمار في onboarding والتنبؤ المالي." />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
              <div className="mb-4 flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-700" /><h3 className="font-black text-emerald-900">ما يجب الحفاظ عليه</h3></div>
              <p className="text-sm leading-7 text-emerald-900/80">لا تعِد بناء المنتج من الصفر. نموذج العمليات المالية، سجل التدقيق، المعاملات، النسخ والاستعادة، التذكيرات، والتصميم العربي هي أصول تميّز المنصة عن لوحة CRUD عادية.</p>
              <div className="mt-4 flex flex-wrap gap-2"><Pill>المعاملات المالية</Pill><Pill>RBAC</Pill><Pill>تقارير العضو</Pill><Pill>PWA</Pill></div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
              <div className="mb-4 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-700" /><h3 className="font-black text-amber-900">ما يجب ألا يؤجل</h3></div>
              <p className="text-sm leading-7 text-amber-900/80">التحقق من ملكية المرفق، توحيد المدخلات، إدارة المهام عند التوسع، ونقل الملفات من قاعدة البيانات ليست تحسينات تجميلية؛ هي حدود سلامة وموثوقية يجب أن تسبق التسويق أو إضافة عائلات متعددة.</p>
              <div className="mt-4 flex flex-wrap gap-2"><Pill tone="amber">صلاحيات الملفات</Pill><Pill tone="amber">Validation</Pill><Pill tone="amber">Workers</Pill><Pill tone="amber">Object Storage</Pill></div>
            </div>
          </div>
        </section>

        <section id="strengths" className="scroll-mt-24">
          <SectionTitle eyebrow="02 / الأصول الحالية" title="نقاط القوة التي تمنح family أفضلية حقيقية" text="المستودع لا يحتوي مجرد صفحات إدخال؛ بل يضم دورة حياة كاملة للأموال والقرارات، مع تفاصيل تشغيلية ناضجة نسبيًا." />
          <div className="grid gap-4 sm:grid-cols-2">
            {strengths.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                <h3 className="font-black text-primary">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="product" className="scroll-mt-24">
          <SectionTitle eyebrow="03 / المنتج وتجربة الاستخدام" title="التطوير الأكبر ليس شاشة جديدة؛ بل وضوح القرار في كل شاشة" text="كل عملية مالية يجب أن تجيب العضو أو المشرف عن أربعة أسئلة: ماذا حدث؟ لمن؟ في أي فترة؟ وما الخطوة التالية؟" />
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-right text-sm">
                <thead className="bg-primary/[0.06] text-xs font-black text-primary"><tr><th className="px-4 py-3">المجال</th><th className="px-4 py-3">الملاحظة</th><th className="px-4 py-3">التطوير المقترح</th><th className="px-4 py-3">الأثر</th></tr></thead>
                <tbody className="divide-y divide-border/70">
                  <tr><td className="px-4 py-4 font-black">الإعداد الأول</td><td className="px-4 py-4 text-muted-foreground">المنتج غني، لكن المستخدم الجديد يحتاج معرفة أين يبدأ.</td><td className="px-4 py-4">Onboarding مرحلي مع بيانات تجريبية اختيارية ومؤشر اكتمال.</td><td className="px-4 py-4"><Pill>تنشيط أسرع</Pill></td></tr>
                  <tr><td className="px-4 py-4 font-black">لوحة التحكم</td><td className="px-4 py-4 text-muted-foreground">تظهر أرقامًا أساسية وتوزيع الطبقات، لكن السياق الزمني والتنبيهات يمكن أن يكون أوضح.</td><td className="px-4 py-4">أضف آخر تحديث، مقارنة بالفترة السابقة، المتأخرات، الموافقات، وصحة النسخة الاحتياطية.</td><td className="px-4 py-4"><Pill>قرار أسرع</Pill></td></tr>
                  <tr><td className="px-4 py-4 font-black">الشفافية</td><td className="px-4 py-4 text-muted-foreground">التقارير موجودة، لكن العضو يحتاج قصة مبسطة لا جدولًا فقط.</td><td className="px-4 py-4">حوّل كشف الحساب إلى timeline مفهوم مع شرح سبب تغير الرصيد والحصة.</td><td className="px-4 py-4"><Pill>ثقة أعلى</Pill></td></tr>
                  <tr><td className="px-4 py-4 font-black">الهوية</td><td className="px-4 py-4 text-muted-foreground">الهوية العربية والعمانية مميزة، لكن بعض النصوص الإنجليزية التقنية ما زالت ظاهرة.</td><td className="px-4 py-4">قاموس ترجمة موحد، تنسيق تواريخ وأرقام مركزي، واختبار RTL بصري لكل مسار.</td><td className="px-4 py-4"><Pill>احترافية</Pill></td></tr>
                  <tr><td className="px-4 py-4 font-black">الوصولية</td><td className="px-4 py-4 text-muted-foreground">توجد أزرار وأيقونات تفاعلية، لكن يلزم تدقيق labels وfocus وaria.</td><td className="px-4 py-4">اختبار لوحة المفاتيح، قارئ الشاشة، تباين الألوان، وحجم أهداف اللمس.</td><td className="px-4 py-4"><Pill>شمولية</Pill></td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/80 bg-card p-5"><Users className="h-5 w-5 text-primary" /><h3 className="mt-3 font-black">الأدوار</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">افصل بين صلاحية رؤية المال، تسجيله، اعتماده، وتغيير الإعدادات بدل أن تكون كل الصلاحيات تقريبًا نتيجة role واحد.</p></div>
            <div className="rounded-2xl border border-border/80 bg-card p-5"><Target className="h-5 w-5 text-primary" /><h3 className="mt-3 font-black">الخطوة التالية</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">في كل شاشة، اجعل CTA واحدًا واضحًا: اعتماد، سداد، إرفاق إيصال، أو مراجعة المتأخرات.</p></div>
            <div className="rounded-2xl border border-border/80 bg-card p-5"><Gauge className="h-5 w-5 text-primary" /><h3 className="mt-3 font-black">حالة البيانات</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">اعرض دائمًا وقت آخر مزامنة، مصدر الرقم، ونطاق الفترة حتى لا تُفهم الأرقام خارج سياقها.</p></div>
          </div>
        </section>

        <section id="technology" className="scroll-mt-24">
          <SectionTitle eyebrow="04 / البنية التقنية" title="البنية الحالية مناسبة لنسخة واحدة؛ وهذه حدودها عند النمو" text="الهدف ليس تعقيد النظام، بل نقل التعقيد إلى المكان الصحيح قبل أن يصبح عطلًا إنتاجيًا." />
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-right text-sm">
                <thead className="bg-primary/[0.06] text-xs font-black text-primary"><tr><th className="px-4 py-3">الطبقة</th><th className="px-4 py-3">الوضع الحالي</th><th className="px-4 py-3">التقييم</th><th className="px-4 py-3">الخطوة التالية</th></tr></thead>
                <tbody className="divide-y divide-border/70">
                  {architecture.map(([layer, current, rating, next]) => <tr key={layer}><td className="px-4 py-4 font-black">{layer}</td><td className="px-4 py-4 text-muted-foreground">{current}</td><td className="px-4 py-4"><Pill tone={rating.includes("قوية") || rating.includes("غنية") ? "green" : "amber"}>{rating}</Pill></td><td className="px-4 py-4 text-muted-foreground">{next}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border/80 bg-card p-5"><Database className="h-5 w-5 text-primary" /><h3 className="mt-3 font-black">قاعدة البيانات</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">أضف فهارس على memberId والتواريخ والحالات، واجعل تقارير السنوات الكبيرة تعتمد على استعلامات محددة لا تجميعات غير محدودة.</p></div>
            <div className="rounded-2xl border border-border/80 bg-card p-5"><Network className="h-5 w-5 text-primary" /><h3 className="mt-3 font-black">تعدد العائلات</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">إذا كان الهدف SaaS، فالمخطط الحالي يبدو مهيأ لعائلة واحدة. أضف familyId وعزلًا إلزاميًا لكل query قبل فتح التسجيل العام.</p></div>
            <div className="rounded-2xl border border-border/80 bg-card p-5"><Wrench className="h-5 w-5 text-primary" /><h3 className="mt-3 font-black">المراقبة</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">health endpoint وrequest logging بداية جيدة. أضف structured logs وcorrelation id وقياسات زمن الاستعلام وفشل المهام.</p></div>
          </div>
        </section>

        <section id="security" className="scroll-mt-24">
          <SectionTitle eyebrow="05 / الأمان والموثوقية" title="الأولوية: صلاحية المورد لا مجرد صلاحية المستخدم" text="وجود isAuthenticated أو isAdmin لا يضمن أن المستخدم يحق له الوصول إلى كل سجل. طبّق authorization على مستوى المورد نفسه، خصوصًا المرفقات والسلف وكشوف الأعضاء." />
          <div className="space-y-3">
            {priorities.map((item) => (
              <details key={item.title} className={`group rounded-2xl border p-4 shadow-sm ${riskTone[item.tone]}`}>
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-xs font-black">{item.level}</span>
                  <span className="min-w-0 flex-1"><span className="block text-xs font-black opacity-70">{item.label} · أثر {item.impact}</span><span className="mt-1 block font-black">{item.title}</span></span>
                  <ChevronDown className="h-5 w-5 shrink-0 transition group-open:rotate-180" />
                </summary>
                <div className="mr-12 mt-3 border-t border-current/10 pt-3 text-sm leading-7 opacity-85">
                  <p>{item.text}</p>
                  <div className="mt-3 flex flex-wrap gap-2"><Pill tone={item.tone as "red" | "amber" | "blue"}>{item.level} · {item.effort}</Pill><Pill tone="green">اختبار قبول إلزامي</Pill></div>
                </div>
              </details>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.05] p-5">
            <div className="flex items-start gap-3"><LockKeyhole className="mt-1 h-5 w-5 shrink-0 text-primary" /><div><h3 className="font-black text-primary">سياسة مقترحة للعمليات الحساسة</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">قبل أي اعتماد أو سداد أو تصفية استثمار أو استعادة نسخة: تحقق من الدور، ملكية المورد، صحة المبلغ، عدم تكرار العملية، ثم سجّل actor وسبب العملية والنتيجة في audit log. الاختبار يجب أن يغطي النجاح والفشل وإعادة الإرسال.</p></div></div>
          </div>
        </section>

        <section id="roadmap" className="scroll-mt-24">
          <SectionTitle eyebrow="06 / خارطة الطريق" title="نفّذ على أربع موجات بدل فتح عشرات المسارات معًا" text="الترتيب أدناه يوازن بين حماية البيانات، زيادة الاستخدام، وخفض تكلفة التشغيل. لا تبدأ بالذكاء الاصطناعي قبل أن تصبح البيانات والصلاحيات قابلة للثقة." />
          <div className="relative space-y-4 before:absolute before:bottom-5 before:right-[19px] before:top-5 before:w-px before:bg-border sm:before:right-[23px]">
            {roadmap.map((item) => (
              <div key={item.phase} className="relative flex gap-4">
                <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.color} text-sm font-black text-white shadow-lg`}>{item.phase}</div>
                <div className="min-w-0 flex-1 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-black text-primary">{item.title}</h3><p className="mt-1 text-xs font-bold text-muted-foreground">الهدف: {item.goal}</p></div><Pill tone={item.phase === "0" ? "red" : item.phase === "1" ? "amber" : item.phase === "2" ? "blue" : "green"}>أثر مرتفع</Pill></div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">{item.items.map((text) => <div key={text} className="flex items-start gap-2 text-sm leading-6 text-muted-foreground"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />{text}</div>)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="kpis" className="scroll-mt-24">
          <SectionTitle eyebrow="07 / قياس النجاح" title="ما لا يُقاس سيعود إلى خانة الانطباع" text="استخدم هذه المؤشرات في لوحة داخلية شهرية، مع مالك واضح لكل مؤشر وهدف زمني قابل للمقارنة." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kpis.map(([label, target, description]) => <div key={label} className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm"><TrendingUp className="h-5 w-5 text-primary" /><p className="mt-3 text-xs font-bold text-muted-foreground">{label}</p><p className="mt-1 text-lg font-black text-primary">{target}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>)}
          </div>
        </section>

        <section id="first-sprint" className="scroll-mt-24 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-amber-50/60 p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-4"><Rocket className="mt-1 h-7 w-7 shrink-0 text-primary" /><div><SectionTitle eyebrow="08 / قرار التنفيذ" title="أول Sprint مقترح" text="إذا أردت نتيجة محسوسة بسرعة، فهذه أفضل حزمة بداية لا تتشتت." /><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-border/80 bg-background/80 p-4"><p className="text-xs font-black text-primary">الأسبوع الأول</p><p className="mt-2 text-sm leading-7 text-muted-foreground">صلاحية المرفقات، مخططات Zod المشتركة، واختبارات member-vs-member. أخرج تقريرًا صغيرًا يثبت أن كل endpoint مالي محمي باختبار رفض.</p></div><div className="rounded-2xl border border-border/80 bg-background/80 p-4"><p className="text-xs font-black text-primary">الأسبوع الثاني</p><p className="mt-2 text-sm leading-7 text-muted-foreground">Onboarding أولي، بطاقات dashboard للتنبيهات وآخر تحديث، وتقسيم Excel/analytics من الحزمة الأساسية مع قياس before/after.</p></div></div><div className="mt-5 flex flex-wrap items-center gap-2"><Pill>هدف sprint: أمان + وضوح + سرعة</Pill><Pill tone="blue">مخرج قابل للعرض</Pill><Pill tone="amber">بدون إضافة تعقيد غير ضروري</Pill></div></div></div>
        </section>

        <section id="references" className="border-t border-border/80 pt-6">
          <div className="flex items-center gap-2"><Code2 className="h-5 w-5 text-primary" /><h2 className="font-black text-primary">مصادر المراجعة داخل المستودع</h2></div>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">بُني هذا التقييم على قراءة الملفات الفعلية في commit <code className="rounded bg-muted px-1.5 py-0.5 text-xs">2c527d0</code>، مع تشغيل الاختبارات وفحص الأنواع وبناء الإنتاج. أهم نقاط القراءة: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">README.md</code>، <code className="rounded bg-muted px-1.5 py-0.5 text-xs">shared/schema.ts</code>، <code className="rounded bg-muted px-1.5 py-0.5 text-xs">server/auth.ts</code>، <code className="rounded bg-muted px-1.5 py-0.5 text-xs">server/routes/attachments.ts</code>، <code className="rounded bg-muted px-1.5 py-0.5 text-xs">client/src/lib/api.ts</code>، وملفات dashboard/report/layout.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-muted/50 p-4 text-xs leading-6 text-muted-foreground"><CheckCircle2 className="mb-2 h-4 w-4 text-emerald-600" />الاختبارات الحالية والبناء نجحا في بيئة المراجعة.</div><div className="rounded-xl bg-muted/50 p-4 text-xs leading-6 text-muted-foreground"><AlertTriangle className="mb-2 h-4 w-4 text-amber-600" />ظهر تحذير حجم الحزم الكبيرة في build.</div><div className="rounded-xl bg-muted/50 p-4 text-xs leading-6 text-muted-foreground"><Clock3 className="mb-2 h-4 w-4 text-blue-600" />الخارطة مرتبة حسب الأثر والجهد، لا حسب سهولة التنفيذ فقط.</div></div>
        </section>

        <div className="no-print flex flex-wrap justify-between gap-3 border-t border-border/80 pt-5">
          <a href="#summary" className="inline-flex items-center gap-2 text-sm font-black text-primary hover:underline"><ArrowLeft className="h-4 w-4 rotate-180" />العودة إلى البداية</a>
          <button onClick={printPage} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground shadow-sm transition hover:bg-primary/90"><Download className="h-4 w-4" />حفظ كصفحة / PDF</button>
        </div>
      </div>
      <style>{`@media print { body { background: white !important; } .no-print, nav, aside, header { display: none !important; } .platform-review { padding: 0 !important; } .platform-review section { break-inside: avoid; } .platform-review details { break-inside: avoid; } }`}</style>
    </MobileLayout>
  );
}
