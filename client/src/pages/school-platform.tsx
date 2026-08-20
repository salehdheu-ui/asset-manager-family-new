import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  DoorOpen,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Filter,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PanelRight,
  Plus,
  Printer,
  ReceiptText,
  RefreshCcw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Role = "director" | "student" | "guardian" | "security";
type View =
  | "dashboard"
  | "students"
  | "attendance"
  | "grades"
  | "finance"
  | "announcements"
  | "schedule"
  | "reports"
  | "ai"
  | "settings"
  | "gate";
type AttendanceState = "حاضر" | "غائب" | "متأخر" | "بعذر" | "مستأذن";

type Student = {
  id: string;
  name: string;
  initials: string;
  studentNo: string;
  className: string;
  grade: string;
  attendance: number;
  average: number;
  status: "نشط" | "متخرج";
  feeStatus: "مكتمل" | "متأخر" | "جزئي";
};

type NavItem = { id: View; label: string; icon: LucideIcon; badge?: string };

const roleMeta: Record<Role, { label: string; subtitle: string; initials: string }> = {
  director: { label: "مدير المدرسة", subtitle: "صلاحيات كاملة", initials: "م م" },
  student: { label: "طالب", subtitle: "مساحة الطالب", initials: "س ع" },
  guardian: { label: "ولي الأمر", subtitle: "متابعة الأبناء", initials: "و أ" },
  security: { label: "موظف الأمن", subtitle: "بوابة المدرسة", initials: "أ م" },
};

const viewMeta: Record<View, { title: string; eyebrow: string }> = {
  dashboard: { title: "لوحة التحكم", eyebrow: "نظرة عامة" },
  students: { title: "الطلاب", eyebrow: "السجلات الأكاديمية" },
  attendance: { title: "الحضور والغياب", eyebrow: "المتابعة اليومية" },
  grades: { title: "الدرجات والشهادات", eyebrow: "التحصيل الأكاديمي" },
  finance: { title: "الرسوم والمصروفات", eyebrow: "الإدارة المالية" },
  announcements: { title: "الإعلانات والإشعارات", eyebrow: "التواصل المدرسي" },
  schedule: { title: "الجدول الأسبوعي", eyebrow: "الحصص والمواد" },
  reports: { title: "التقارير", eyebrow: "البيانات القابلة للطباعة" },
  ai: { title: "المساعد الذكي", eyebrow: "مسودة مقترحة للمدير" },
  settings: { title: "الإعدادات", eyebrow: "تهيئة المدرسة" },
  gate: { title: "حركة البوابة", eyebrow: "واجهة الأمن" },
};

const seedStudents: Student[] = [
  { id: "s1", name: "سارة أحمد الخروصي", initials: "سخ", studentNo: "2026-014", className: "الصف التاسع / أ", grade: "9", attendance: 96, average: 91, status: "نشط", feeStatus: "مكتمل" },
  { id: "s2", name: "محمد أحمد الخروصي", initials: "مخ", studentNo: "2026-015", className: "الصف السادس / ب", grade: "6", attendance: 88, average: 84, status: "نشط", feeStatus: "جزئي" },
  { id: "s3", name: "ليان خالد البلوشية", initials: "لب", studentNo: "2026-021", className: "الصف التاسع / أ", grade: "9", attendance: 92, average: 95, status: "نشط", feeStatus: "مكتمل" },
  { id: "s4", name: "عبدالله سالم الهنائي", initials: "ع هـ", studentNo: "2026-026", className: "الصف الثامن / ج", grade: "8", attendance: 79, average: 73, status: "نشط", feeStatus: "متأخر" },
  { id: "s5", name: "نورة ماجد الشامسية", initials: "نش", studentNo: "2026-031", className: "الصف السابع / أ", grade: "7", attendance: 98, average: 89, status: "نشط", feeStatus: "مكتمل" },
  { id: "s6", name: "راشد حمد اليعقوبي", initials: "رح", studentNo: "2026-039", className: "الصف العاشر / ب", grade: "10", attendance: 86, average: 81, status: "نشط", feeStatus: "جزئي" },
  { id: "s7", name: "جود فهد الرواحية", initials: "جر", studentNo: "2026-045", className: "الصف الثامن / ج", grade: "8", attendance: 94, average: 93, status: "نشط", feeStatus: "مكتمل" },
  { id: "s8", name: "إياد علي المعمري", initials: "إم", studentNo: "2026-052", className: "الصف السادس / ب", grade: "6", attendance: 82, average: 77, status: "نشط", feeStatus: "متأخر" },
];

const attendanceSeed: Record<string, AttendanceState> = {
  s1: "حاضر",
  s2: "متأخر",
  s3: "حاضر",
  s4: "غائب",
  s5: "حاضر",
  s6: "بعذر",
  s7: "حاضر",
  s8: "حاضر",
};

const announcements = [
  { id: "a1", title: "موعد الاختبارات القصيرة للفترة الثانية", body: "تبدأ الاختبارات القصيرة يوم الأحد القادم وفق الجدول المرفق. يرجى متابعة صفحة الدرجات.", target: "الجميع", date: "اليوم، 08:30", tone: "blue", read: false },
  { id: "a2", title: "تحديث أوقات الانصراف يوم الخميس", body: "سيكون الانصراف عند الساعة 12:30 ظهرًا بسبب اجتماع الهيئة التعليمية.", target: "أولياء الأمور", date: "أمس، 13:10", tone: "amber", read: true },
  { id: "a3", title: "تكريم الطلبة المتفوقين", body: "نحتفي بالطلبة الحاصلين على متوسط 90% فأعلى في لقاء صباحي مختصر.", target: "الصفوف 7–10", date: "18 أغسطس", tone: "green", read: true },
  { id: "a4", title: "تذكير بالزي المدرسي", body: "نرجو الالتزام بالزي المدرسي المعتمد والمحافظة على المظهر العام.", target: "الطلاب", date: "16 أغسطس", tone: "slate", read: true },
];

const schedule = [
  { day: "الأحد", date: "23 أغسطس", items: [{ time: "07:30", subject: "الرياضيات", teacher: "أ. خالد", room: "9 / أ", color: "blue" }, { time: "08:20", subject: "اللغة العربية", teacher: "أ. مريم", room: "9 / أ", color: "amber" }, { time: "09:20", subject: "العلوم", teacher: "أ. ناصر", room: "9 / أ", color: "green" }] },
  { day: "الاثنين", date: "24 أغسطس", items: [{ time: "07:30", subject: "اللغة الإنجليزية", teacher: "أ. فاطمة", room: "9 / أ", color: "violet" }, { time: "08:20", subject: "التربية الإسلامية", teacher: "أ. سالم", room: "9 / أ", color: "blue" }, { time: "10:20", subject: "الرياضيات", teacher: "أ. خالد", room: "9 / أ", color: "amber" }] },
  { day: "الثلاثاء", date: "25 أغسطس", items: [{ time: "07:30", subject: "الدراسات الاجتماعية", teacher: "أ. حمد", room: "9 / أ", color: "slate" }, { time: "09:20", subject: "العلوم", teacher: "أ. ناصر", room: "9 / أ", color: "green" }, { time: "10:20", subject: "اللغة العربية", teacher: "أ. مريم", room: "9 / أ", color: "amber" }] },
  { day: "الأربعاء", date: "26 أغسطس", items: [{ time: "07:30", subject: "الرياضيات", teacher: "أ. خالد", room: "9 / أ", color: "blue" }, { time: "08:20", subject: "اللغة الإنجليزية", teacher: "أ. فاطمة", room: "9 / أ", color: "violet" }, { time: "10:20", subject: "مهارات رقمية", teacher: "أ. ناصر", room: "9 / أ", color: "green" }] },
  { day: "الخميس", date: "27 أغسطس", items: [{ time: "07:30", subject: "التربية البدنية", teacher: "أ. مازن", room: "الساحة", color: "green" }, { time: "08:20", subject: "اللغة العربية", teacher: "أ. مريم", room: "9 / أ", color: "amber" }, { time: "09:20", subject: "المراجعة الأسبوعية", teacher: "أ. خالد", room: "9 / أ", color: "blue" }] },
];

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "المتابعة اليومية",
    items: [
      { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
      { id: "attendance", label: "الحضور والغياب", icon: ClipboardCheck, badge: "3" },
      { id: "gate", label: "حركة البوابة", icon: DoorOpen },
    ],
  },
  {
    label: "المنظومة الأكاديمية",
    items: [
      { id: "students", label: "الطلاب", icon: Users },
      { id: "schedule", label: "الجدول الأسبوعي", icon: CalendarDays },
      { id: "grades", label: "الدرجات والشهادات", icon: Award },
    ],
  },
  {
    label: "الإدارة والتواصل",
    items: [
      { id: "finance", label: "الرسوم والمصروفات", icon: CircleDollarSign },
      { id: "announcements", label: "الإعلانات", icon: Bell, badge: "2" },
      { id: "reports", label: "التقارير", icon: BarChart3 },
    ],
  },
];

const roleNav: Record<Role, View[]> = {
  director: ["dashboard", "attendance", "gate", "students", "schedule", "grades", "finance", "announcements", "reports", "ai", "settings"],
  student: ["dashboard", "attendance", "schedule", "grades", "finance", "announcements"],
  guardian: ["dashboard", "attendance", "schedule", "grades", "finance", "announcements"],
  security: ["dashboard", "gate"],
};

const formatNumber = (value: number) => new Intl.NumberFormat("ar-OM").format(value);
const money = (value: number) => `${formatNumber(value)} ر.ع`;

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-[22px] border border-slate-200/80 bg-white shadow-[0_12px_35px_rgba(23,60,52,0.06)]", className)}>{children}</section>;
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
      <div>
        <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function StatusPill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "green" | "amber" | "red" | "blue" | "slate" | "violet" }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
    amber: "bg-amber-50 text-amber-700 ring-amber-600/10",
    red: "bg-rose-50 text-rose-700 ring-rose-600/10",
    blue: "bg-blue-50 text-blue-700 ring-blue-600/10",
    violet: "bg-violet-50 text-violet-700 ring-violet-600/10",
    slate: "bg-slate-100 text-slate-600 ring-slate-500/10",
  };
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset", tones[tone])}>{children}</span>;
}

function Avatar({ initials, tone = "green", size = "md" }: { initials: string; tone?: "green" | "blue" | "amber" | "violet"; size?: "sm" | "md" | "lg" }) {
  const tones = { green: "bg-emerald-100 text-emerald-800", blue: "bg-blue-100 text-blue-800", amber: "bg-amber-100 text-amber-800", violet: "bg-violet-100 text-violet-800" };
  const sizes = { sm: "h-8 w-8 text-[10px]", md: "h-10 w-10 text-xs", lg: "h-12 w-12 text-sm" };
  return <div className={cn("flex shrink-0 items-center justify-center rounded-2xl font-extrabold", tones[tone], sizes[size])}>{initials}</div>;
}

function MetricCard({ icon: Icon, label, value, meta, tone, trend }: { icon: LucideIcon; label: string; value: string; meta: string; tone: "green" | "blue" | "amber" | "rose"; trend?: "up" | "down" }) {
  const styles = {
    green: { icon: "bg-emerald-50 text-emerald-700", line: "from-emerald-500 to-emerald-300" },
    blue: { icon: "bg-blue-50 text-blue-700", line: "from-blue-500 to-cyan-300" },
    amber: { icon: "bg-amber-50 text-amber-700", line: "from-amber-500 to-orange-300" },
    rose: { icon: "bg-rose-50 text-rose-700", line: "from-rose-500 to-pink-300" },
  };
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_rgba(23,60,52,0.04)] sm:p-5">
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-l", styles[tone].line)} />
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", styles[tone].icon)}><Icon className="h-5 w-5" /></div>
        {trend && <span className={cn("flex items-center gap-1 text-[11px] font-extrabold", trend === "up" ? "text-emerald-600" : "text-rose-600")}><span>{trend === "up" ? "+4.8%" : "-2.1%"}</span>{trend === "up" ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}</span>}
      </div>
      <p className="mt-4 text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-[28px]">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-slate-400">{meta}</p>
    </div>
  );
}

function AttendanceChart() {
  const points = "0,76 46,64 92,72 138,46 184,54 230,36 276,42 322,24 368,32 414,15";
  const labels = ["١٧ أغسطس", "١٨", "١٩", "٢٠", "٢١", "٢٢", "٢٣", "٢٤", "٢٥", "اليوم"];
  return (
    <div className="px-5 pb-5 pt-1 sm:px-6">
      <div className="relative h-[196px] w-full overflow-hidden rounded-2xl bg-[#f7faf9] px-3 pb-8 pt-5">
        <div className="pointer-events-none absolute inset-x-4 top-6 bottom-10 flex flex-col justify-between"><span className="border-t border-dashed border-slate-200" /><span className="border-t border-dashed border-slate-200" /><span className="border-t border-dashed border-slate-200" /><span className="border-t border-dashed border-slate-200" /></div>
        <svg viewBox="0 0 414 100" className="relative z-10 h-[120px] w-full" preserveAspectRatio="none" aria-label="منحنى نسبة الحضور خلال عشرة أيام">
          <defs><linearGradient id="attendanceFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#159a73" stopOpacity=".22" /><stop offset="100%" stopColor="#159a73" stopOpacity="0" /></linearGradient></defs>
          <path d={`M ${points} L 414,100 L 0,100 Z`} fill="url(#attendanceFill)" />
          <polyline points={points} fill="none" stroke="#128262" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="414" cy="15" r="5" fill="#fff" stroke="#128262" strokeWidth="3" />
        </svg>
        <div className="absolute inset-x-4 bottom-3 flex justify-between text-[10px] font-semibold text-slate-400"><span>{labels[0]}</span><span>{labels[3]}</span><span>{labels[6]}</span><span>{labels[9]}</span></div>
        <div className="absolute left-4 top-3 rounded-full bg-white px-2 py-1 text-[10px] font-extrabold text-emerald-700 shadow-sm">٩٢٪ متوسط الحضور</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs"><div className="flex items-center gap-4 text-slate-500"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" />حضور</span><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" />غياب</span></div><button className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-900"><span>عرض التقرير الكامل</span><ArrowLeft className="h-3.5 w-3.5" /></button></div>
    </div>
  );
}

function DashboardView({ role, students, setView, onToast }: { role: Role; students: Student[]; setView: (view: View) => void; onToast: (title: string, description?: string) => void }) {
  const activeStudents = students.filter((student) => student.status === "نشط");
  const lateOrAbsent = students.filter((student) => student.attendance < 85).length;
  if (role === "security") {
    return <SecurityDashboard students={students} setView={setView} onToast={onToast} />;
  }
  const isPersonal = role === "student";
  const isGuardian = role === "guardian";
  const dashboardStudents = isPersonal ? [students[0]] : isGuardian ? students.slice(0, 2) : students;
  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[1.55fr_.9fr]">
        <section className="relative overflow-hidden rounded-[26px] bg-[#0d7054] px-5 py-6 text-white shadow-[0_18px_45px_rgba(13,112,84,0.2)] sm:px-7 sm:py-7">
          <div className="absolute -left-8 -top-16 h-56 w-56 rounded-full border-[30px] border-white/10" /><div className="absolute -bottom-24 right-20 h-52 w-52 rounded-full border-[20px] border-amber-300/10" />
          <div className="relative max-w-2xl"><div className="mb-4 flex items-center gap-2 text-xs font-bold text-emerald-100"><span className="h-2 w-2 rounded-full bg-amber-300" /><span>الأحد، ٢٣ أغسطس ٢٠٢٦</span><span className="rounded-full bg-white/10 px-2 py-1">العام الدراسي ٢٠٢٦/٢٠٢٧</span></div><h2 className="max-w-lg text-2xl font-black leading-[1.45] sm:text-3xl">{isPersonal ? "أهلًا سارة، مستعدة ليوم دراسي جديد؟" : isGuardian ? "صباح الخير، إليك أهم مستجدات أبنائك اليوم" : "صباح الخير، أستاذة مريم"}</h2><p className="mt-3 max-w-lg text-sm leading-7 text-emerald-50/80">{isPersonal ? "تابعي جدولك ونتائجك وإعلانات المدرسة من مكان واحد." : isGuardian ? "تظهر لك هنا مؤشرات الحضور والتحصيل والرسوم الخاصة بالأبناء المرتبطين بحسابك." : "هذه خلاصة ما يحتاج إلى انتباهك في مدرسة اسم المدرسة اليوم."}</p><div className="mt-6 flex flex-wrap gap-2"><button onClick={() => setView(isPersonal ? "grades" : "attendance")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-xs font-black text-emerald-800 shadow-sm transition hover:bg-emerald-50 active:scale-[.98]"><ClipboardCheck className="h-4 w-4" />{isPersonal ? "استعرض درجاتي" : "فتح كشف الحضور"}</button>{!isPersonal && <button onClick={() => setView("reports")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-xs font-bold text-white transition hover:bg-white/15 active:scale-[.98]"><BarChart3 className="h-4 w-4" />التقارير</button>}</div></div>
        </section>
        <SectionCard className="overflow-hidden"><SectionHeader title="يحتاج إلى متابعة" subtitle="مؤشرات مختصرة من آخر تحديث" action={<span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-extrabold text-rose-700">{lateOrAbsent || 3} تنبيهات</span>} /><div className="space-y-1 p-3"><button onClick={() => setView("attendance")} className="flex w-full items-start gap-3 rounded-2xl p-3 text-right transition hover:bg-slate-50"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><AlertTriangle className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-xs font-extrabold text-slate-800">{isPersonal ? "لديك غياب واحد غير مبرر" : "٣ طلاب تجاوزوا حد الغياب"}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{isPersonal ? "راجعي الإدارة إذا كان الغياب بعذر." : "راجع السجل قبل نهاية اليوم الدراسي."}</p></div><ArrowLeft className="mt-1 h-4 w-4 text-slate-300" /></button><button onClick={() => setView("finance")} className="flex w-full items-start gap-3 rounded-2xl p-3 text-right transition hover:bg-slate-50"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><CircleDollarSign className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-xs font-extrabold text-slate-800">{isPersonal ? "الرصيد المتبقي ١٢٠ ر.ع" : "متأخرات الرسوم تحتاج متابعة"}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{isPersonal ? "آخر تحديث: ٢٠ أغسطس ٢٠٢٦" : "إجمالي ٣,٤٨٠ ر.ع على ٨ ملفات."}</p></div><ArrowLeft className="mt-1 h-4 w-4 text-slate-300" /></button></div></SectionCard>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <MetricCard icon={Users} label={isPersonal ? "معدل حضوري" : "الطلاب النشطون"} value={isPersonal ? "٩٦٪" : isGuardian ? "٢" : formatNumber(activeStudents.length)} meta={isPersonal ? "أعلى من متوسط الصف" : isGuardian ? "مرتبطون بحسابك" : "من أصل ٣٢١ طالبًا"} tone="green" trend="up" />
        <MetricCard icon={ClipboardCheck} label={isPersonal ? "حصص اليوم" : "حضور اليوم"} value={isPersonal ? "٤" : "٩٢٪"} meta={isPersonal ? "الحصة القادمة ٠٧:٣٠" : "٢٩٥ حاضرًا من ٣٢١"} tone="blue" trend="up" />
        <MetricCard icon={Award} label={isPersonal ? "متوسط التحصيل" : "متوسط التحصيل"} value={isPersonal ? "٩١٪" : isGuardian ? "٨٨٪" : "٨٦٪"} meta={isPersonal ? "الفترة الأولى" : "الفترة الأولى · منشور"} tone="amber" trend="up" />
        <MetricCard icon={CircleDollarSign} label="الرصيد المتبقي" value={isPersonal ? "١٢٠" : isGuardian ? "٢٤٠" : "٣,٤٨٠"} meta="ريال عماني · آخر تحديث" tone="rose" trend="down" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
        <SectionCard><SectionHeader title={isPersonal ? "ملخص الحضور" : "انتظام الحضور"} subtitle="آخر عشرة أيام دراسية" action={<button onClick={() => setView("attendance")} className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700">التفاصيل <ArrowLeft className="h-3.5 w-3.5" /></button>} /><AttendanceChart /></SectionCard>
        <SectionCard><SectionHeader title="الحصص القادمة" subtitle={`الجدول الخاص بـ ${isPersonal || isGuardian ? "الطالب" : "الصف التاسع / أ"}`} action={<button onClick={() => setView("schedule")} className="text-xs font-extrabold text-emerald-700">الجدول الكامل</button>} /><div className="space-y-1 p-4">{schedule[0].items.map((item, index) => <div key={`${item.time}-${item.subject}`} className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-slate-50"><div className="w-12 text-center text-[11px] font-black text-slate-400">{item.time}</div><div className={cn("h-10 w-1 rounded-full", item.color === "blue" ? "bg-blue-500" : item.color === "amber" ? "bg-amber-500" : "bg-emerald-500")} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold text-slate-800">{item.subject}</p><p className="mt-1 text-[11px] text-slate-400">{item.teacher} · {item.room}</p></div><Clock3 className="h-4 w-4 text-slate-300" /></div>)}<div className="mt-2 rounded-2xl bg-[#f7faf9] p-3 text-center text-[11px] font-bold text-slate-500">تبدأ الحصة الأولى بعد <span className="text-emerald-700">٣٥ دقيقة</span></div></div></SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <SectionCard><SectionHeader title={isPersonal || isGuardian ? "آخر النتائج المنشورة" : "أحدث ملفات الطلاب"} subtitle={isPersonal || isGuardian ? "يمكنك فتح التفاصيل وطباعة الشهادة" : "آخر تحديثات السجلات الأكاديمية"} action={<button onClick={() => setView(isPersonal || isGuardian ? "grades" : "students")} className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700">عرض الكل <ArrowLeft className="h-3.5 w-3.5" /></button>} /><div className="divide-y divide-slate-100">{dashboardStudents.slice(0, 4).map((student, index) => <div key={student.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6"><Avatar initials={student.initials} tone={index % 2 ? "blue" : "green"} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold text-slate-800">{student.name}</p><p className="mt-1 text-[11px] text-slate-400">{student.className} · {student.studentNo}</p></div>{isPersonal || isGuardian ? <div className="text-left"><p className="text-sm font-black text-emerald-700">{student.average}%</p><p className="mt-0.5 text-[10px] text-slate-400">المتوسط</p></div> : <StatusPill tone={student.attendance < 85 ? "red" : "green"}>{student.attendance < 85 ? "تحتاج متابعة" : "ملف نشط"}</StatusPill>}<button className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"><MoreHorizontal className="h-4 w-4" /></button></div>)}</div></SectionCard>
        <SectionCard><SectionHeader title="آخر الإعلانات" subtitle="تواصل المدرسة مع المجتمع" action={<button onClick={() => setView("announcements")} className="text-xs font-extrabold text-emerald-700">كل الإعلانات</button>} /><div className="space-y-1 p-4">{announcements.slice(0, 3).map((announcement) => <button key={announcement.id} onClick={() => setView("announcements")} className="flex w-full items-start gap-3 rounded-2xl p-3 text-right transition hover:bg-slate-50"><div className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", announcement.tone === "blue" ? "bg-blue-50 text-blue-600" : announcement.tone === "amber" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}><Bell className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="line-clamp-1 text-xs font-extrabold text-slate-800">{announcement.title}</p>{!announcement.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />}</div><p className="mt-1 text-[10px] text-slate-400">{announcement.date} · {announcement.target}</p></div></button>)}</div></SectionCard>
      </div>
    </div>
  );
}

function SecurityDashboard({ students, setView, onToast }: { students: Student[]; setView: (view: View) => void; onToast: (title: string, description?: string) => void }) {
  const [search, setSearch] = useState("");
  const result = students.find((student) => `${student.name} ${student.studentNo}`.includes(search.trim())) || students[0];
  return <div className="space-y-6"><div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-[26px] bg-[#153f57] p-5 text-white shadow-[0_18px_45px_rgba(21,63,87,0.18)] sm:p-7"><div className="flex items-center gap-2 text-xs font-bold text-sky-100"><span className="h-2 w-2 rounded-full bg-emerald-300" />البوابة الرئيسية · الأحد ٢٣ أغسطس</div><h2 className="mt-4 text-2xl font-black">تسجيل حركة الطلاب</h2><p className="mt-2 max-w-md text-sm leading-7 text-sky-50/80">ابحث بالاسم أو الرقم الطلابي وسجّل الدخول أو الخروج خلال ثوانٍ. تظهر لك البيانات اللازمة فقط.</p><div className="relative mt-6"><Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن اسم الطالب أو الرقم..." className="h-12 w-full rounded-2xl border-0 bg-white pr-11 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:ring-4 focus:ring-white/20" /></div></section><SectionCard><SectionHeader title="حركة اليوم" subtitle="آخر عمليات البوابة" action={<StatusPill tone="green"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />مفتوحة</StatusPill>} /><div className="grid grid-cols-2 gap-3 p-5"><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-700">دخول</p><p className="mt-2 text-2xl font-black text-emerald-800">٢٨٤</p><p className="mt-1 text-[10px] text-emerald-700/70">منذ ٠٦:٤٥ صباحًا</p></div><div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-bold text-blue-700">خروج</p><p className="mt-2 text-2xl font-black text-blue-800">١٢</p><p className="mt-1 text-[10px] text-blue-700/70">آخر حركة ٠٨:١٥</p></div></div><div className="mx-5 mb-5 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-[11px] font-bold text-amber-800"><ShieldCheck className="h-4 w-4 shrink-0" />لا توجد حالات تحتاج مراجعة.</div></SectionCard></div><SectionCard><SectionHeader title="نتيجة البحث" subtitle="البيانات الظاهرة مقيدة بدور الأمن" action={<button onClick={() => setView("gate")} className="text-xs font-extrabold text-emerald-700">سجل الحركة الكامل</button>} /><div className="p-5"><div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center"><Avatar initials={result.initials} tone="blue" size="lg" /><div className="min-w-0 flex-1"><p className="text-base font-black text-slate-900">{result.name}</p><p className="mt-1 text-xs font-medium text-slate-500">{result.studentNo} · {result.className}</p><div className="mt-3 flex flex-wrap gap-2"><StatusPill tone="green">نشط</StatusPill><StatusPill tone="blue">آخر دخول ٠٧:١٢</StatusPill></div></div><div className="flex w-full gap-2 sm:w-auto"><button onClick={() => onToast("تم تسجيل دخول الطالب", `${result.name} · ٠٨:٢٤ صباحًا`)} className="min-h-11 flex-1 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 active:scale-[.98] sm:flex-none">تسجيل دخول</button><button onClick={() => onToast("تم تسجيل خروج الطالب", `${result.name} · ٠٨:٢٤ صباحًا`)} className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 active:scale-[.98] sm:flex-none">تسجيل خروج</button></div></div></div></SectionCard></div>;
}

function StudentsView({ students, setStudents, onToast }: { students: Student[]; setStudents: React.Dispatch<React.SetStateAction<Student[]>>; onToast: (title: string, description?: string) => void }) {
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("الكل");
  const [showModal, setShowModal] = useState(false);
  const filtered = students.filter((student) => `${student.name} ${student.studentNo}`.includes(query.trim()) && (classFilter === "الكل" || student.className === classFilter));
  const addStudent = () => { setStudents((current) => [{ ...seedStudents[0], id: `s${Date.now()}`, name: "طالب تجريبي جديد", initials: "ط ج", studentNo: "2026-099", className: "الصف التاسع / أ", attendance: 100, average: 0, feeStatus: "جزئي" }, ...current]); setShowModal(false); onToast("تمت إضافة الطالب", "تم حفظ السجل محليًا في بيانات النموذج التجريبي."); };
  return <div className="space-y-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-black text-slate-950">قائمة الطلاب</h2><p className="mt-1 text-xs text-slate-500">{formatNumber(students.length)} سجلات نشطة · آخر مزامنة محلية منذ دقيقتين</p></div><button onClick={() => setShowModal(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 active:scale-[.98]"><Plus className="h-4 w-4" />إضافة طالب</button></div><SectionCard><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الرقم الطلابي" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pr-10 text-xs font-medium outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-500/10" /></div><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none"><option>الكل</option><option>الصف التاسع / أ</option><option>الصف السادس / ب</option><option>الصف الثامن / ج</option><option>الصف السابع / أ</option><option>الصف العاشر / ب</option></select><button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"><Filter className="h-4 w-4" />تصفية متقدمة</button></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-right"><thead className="bg-slate-50/80 text-[11px] font-extrabold text-slate-500"><tr><th className="px-5 py-3 font-extrabold">الطالب</th><th className="px-4 py-3 font-extrabold">الرقم الطلابي</th><th className="px-4 py-3 font-extrabold">الفصل</th><th className="px-4 py-3 font-extrabold">الحضور</th><th className="px-4 py-3 font-extrabold">التحصيل</th><th className="px-4 py-3 font-extrabold">الرسوم</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((student, index) => <tr key={student.id} className="transition hover:bg-slate-50/70"><td className="px-5 py-3.5"><div className="flex items-center gap-3"><Avatar initials={student.initials} tone={index % 2 ? "blue" : "green"} size="sm" /><div><p className="text-xs font-extrabold text-slate-800">{student.name}</p><p className="mt-1 text-[10px] text-slate-400">{student.grade} سنوات · {student.status}</p></div></div></td><td className="px-4 py-3.5 text-xs font-bold tabular text-slate-600">{student.studentNo}</td><td className="px-4 py-3.5 text-xs font-medium text-slate-600">{student.className}</td><td className="px-4 py-3.5"><span className={cn("text-xs font-black", student.attendance < 85 ? "text-rose-600" : "text-emerald-700")}>{student.attendance}%</span></td><td className="px-4 py-3.5"><div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${student.average}%` }} /></div><span className="text-[11px] font-bold text-slate-600">{student.average}%</span></div></td><td className="px-4 py-3.5"><StatusPill tone={student.feeStatus === "مكتمل" ? "green" : student.feeStatus === "متأخر" ? "red" : "amber"}>{student.feeStatus}</StatusPill></td><td className="px-4 py-3.5"><button className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600"><MoreHorizontal className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>{filtered.length === 0 && <div className="p-12 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-600">لا توجد نتائج مطابقة</p><p className="mt-1 text-xs text-slate-400">جرّب تعديل كلمة البحث أو الفلتر.</p></div>}<div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400"><span>عرض {formatNumber(filtered.length)} من {formatNumber(students.length)} سجلًا</span><div className="flex items-center gap-1"><button className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400"><ArrowLeft className="h-3.5 w-3.5 rotate-180" /></button><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white">١</span><button className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400"><ArrowLeft className="h-3.5 w-3.5" /></button></div></div></SectionCard>{showModal && <Modal title="إضافة طالب جديد" description="أدخل البيانات الأساسية. الحقول تحفظ محليًا في النموذج التجريبي." onClose={() => setShowModal(false)}><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 text-xs font-bold text-slate-600"><span>اسم الطالب</span><input autoFocus placeholder="الاسم الرباعي" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10" /></label><label className="space-y-1.5 text-xs font-bold text-slate-600"><span>الرقم الطلابي</span><input placeholder="2026-000" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10" /></label><label className="space-y-1.5 text-xs font-bold text-slate-600"><span>الفصل</span><select className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none"><option>الصف التاسع / أ</option><option>الصف السادس / ب</option><option>الصف الثامن / ج</option></select></label><label className="space-y-1.5 text-xs font-bold text-slate-600"><span>تاريخ الميلاد</span><input type="date" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10" /></label></div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowModal(false)} className="min-h-11 rounded-xl px-4 text-xs font-bold text-slate-500 hover:bg-slate-100">إلغاء</button><button onClick={addStudent} className="min-h-11 rounded-xl bg-emerald-600 px-5 text-xs font-black text-white hover:bg-emerald-700">حفظ الطالب</button></div></Modal>}</div>;
}

function AttendanceView({ students, attendance, setAttendance, onToast }: { students: Student[]; attendance: Record<string, AttendanceState>; setAttendance: React.Dispatch<React.SetStateAction<Record<string, AttendanceState>>>; onToast: (title: string, description?: string) => void }) {
  const [selectedClass, setSelectedClass] = useState("الصف التاسع / أ");
  const classStudents = students.filter((student) => student.className === selectedClass);
  const counts = Object.values(attendance).reduce((acc, status) => { acc[status] = (acc[status] || 0) + 1; return acc; }, {} as Record<string, number>);
  const options: AttendanceState[] = ["حاضر", "غائب", "متأخر", "بعذر", "مستأذن"];
  const toneFor = (status: AttendanceState) => status === "حاضر" ? "green" : status === "غائب" ? "red" : status === "متأخر" ? "amber" : status === "بعذر" ? "blue" : "slate";
  return <div className="space-y-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-black text-slate-950">كشف الحضور اليومي</h2><p className="mt-1 text-xs text-slate-500">الأحد، ٢٣ أغسطس ٢٠٢٦ · يتم استبعاد الإجازات والعطل من النسبة تلقائيًا.</p></div><div className="flex gap-2"><select value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none"><option>الصف التاسع / أ</option><option>الصف السادس / ب</option><option>الصف الثامن / ج</option></select><button onClick={() => onToast("تم حفظ كشف الحضور", "سُجلت العملية في سجل العمليات المحلي.")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-sm hover:bg-emerald-700"><Check className="h-4 w-4" />حفظ الكشف</button></div></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-[11px] font-bold text-emerald-700">حاضر</p><p className="mt-1 text-2xl font-black text-emerald-800">{counts["حاضر"] || 0}</p></div><div className="rounded-2xl border border-rose-100 bg-rose-50 p-4"><p className="text-[11px] font-bold text-rose-700">غائب</p><p className="mt-1 text-2xl font-black text-rose-800">{counts["غائب"] || 0}</p></div><div className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><p className="text-[11px] font-bold text-amber-700">متأخر</p><p className="mt-1 text-2xl font-black text-amber-800">{counts["متأخر"] || 0}</p></div><div className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><p className="text-[11px] font-bold text-blue-700">بعذر</p><p className="mt-1 text-2xl font-black text-blue-800">{counts["بعذر"] || 0}</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[11px] font-bold text-slate-600">نسبة الحضور</p><p className="mt-1 text-2xl font-black text-slate-800">٩٢٪</p></div></div><SectionCard><SectionHeader title="الصف التاسع / أ" subtitle="الحالة الافتراضية عند بدء الكشف: حاضر · يمكن تعديل طالب منفرد" action={<button className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-500"><Download className="h-4 w-4" />تصدير</button>} /><div className="divide-y divide-slate-100">{classStudents.map((student, index) => <div key={student.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:gap-5 sm:px-6"><div className="flex min-w-[240px] flex-1 items-center gap-3"><Avatar initials={student.initials} tone={index % 2 ? "blue" : "green"} size="sm" /><div><p className="text-xs font-extrabold text-slate-800">{student.name}</p><p className="mt-1 text-[10px] text-slate-400">{student.studentNo}</p></div></div><div className="flex flex-wrap gap-2">{options.map((option) => <button key={option} onClick={() => setAttendance((current) => ({ ...current, [student.id]: option }))} className={cn("min-h-10 rounded-xl px-3 text-[11px] font-extrabold transition", attendance[student.id] === option ? option === "حاضر" ? "bg-emerald-600 text-white shadow-sm" : option === "غائب" ? "bg-rose-600 text-white shadow-sm" : option === "متأخر" ? "bg-amber-500 text-white shadow-sm" : option === "بعذر" ? "bg-blue-600 text-white shadow-sm" : "bg-slate-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50")}>{option}</button>)}</div><div className="flex items-center gap-2 lg:w-28 lg:justify-end"><StatusPill tone={toneFor(attendance[student.id] || "حاضر")}>{attendance[student.id] || "حاضر"}</StatusPill><button className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600"><MoreHorizontal className="h-4 w-4" /></button></div></div>)}</div><div className="flex items-center gap-2 border-t border-slate-100 bg-amber-50/60 px-5 py-3 text-[11px] font-bold text-amber-800 sm:px-6"><ShieldAlert className="h-4 w-4 shrink-0" />يظهر تنبيه للمدير عند تجاوز حد الغياب القابل للضبط.</div></SectionCard></div>;
}

function GradesView({ role, students }: { role: Role; students: Student[] }) {
  const subjects = [{ name: "الرياضيات", score: 93, max: 100, status: "منشورة", color: "blue" }, { name: "اللغة العربية", score: 88, max: 100, status: "منشورة", color: "amber" }, { name: "العلوم", score: 91, max: 100, status: "منشورة", color: "green" }, { name: "اللغة الإنجليزية", score: 84, max: 100, status: role === "director" ? "مسودة" : "منشورة", color: "violet" }, { name: "الدراسات الاجتماعية", score: 89, max: 100, status: "منشورة", color: "slate" }];
  const student = role === "guardian" ? students[0] : students[0];
  return <div className="space-y-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-black text-slate-950">{role === "director" ? "الدرجات والتقييمات" : "درجاتي وشهاداتي"}</h2><p className="mt-1 text-xs text-slate-500">الفترة الدراسية الأولى · آخر تحديث ٢٠ أغسطس ٢٠٢٦</p></div><div className="flex gap-2"><select className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none"><option>الفترة الأولى</option><option>الفترة الثانية</option></select><button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50"><Printer className="h-4 w-4" />طباعة الشهادة</button></div></div><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-[20px] bg-[#0d7054] p-5 text-white shadow-[0_12px_28px_rgba(13,112,84,0.15)]"><p className="text-xs font-bold text-emerald-100">المتوسط العام</p><p className="mt-2 text-4xl font-black">{student.average}%</p><p className="mt-1 text-[11px] text-emerald-100/70">ممتاز · أعلى من ٧٨٪ من الصف</p></div><div className="rounded-[20px] border border-blue-100 bg-blue-50 p-5"><p className="text-xs font-bold text-blue-700">المواد المنشورة</p><p className="mt-2 text-4xl font-black text-blue-800">٤ / ٥</p><p className="mt-1 text-[11px] text-blue-700/70">توجد درجة واحدة في المسودة</p></div><div className="rounded-[20px] border border-amber-100 bg-amber-50 p-5"><p className="text-xs font-bold text-amber-700">الترتيب التقريبي</p><p className="mt-2 text-4xl font-black text-amber-800">٧</p><p className="mt-1 text-[11px] text-amber-700/70">من أصل ٣٢ طالبًا</p></div></div><SectionCard><SectionHeader title="كشف الدرجات" subtitle="تظهر للطالب وولي الأمر الدرجات المنشورة فقط" action={role === "director" ? <button className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-700"><Plus className="h-4 w-4" />إضافة تقييم</button> : <StatusPill tone="blue"><Eye className="h-3.5 w-3.5" />عرض فقط</StatusPill>} /><div className="divide-y divide-slate-100">{subjects.map((subject) => <div key={subject.name} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6"><div className="flex min-w-[210px] items-center gap-3"><div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", subject.color === "blue" ? "bg-blue-50 text-blue-600" : subject.color === "amber" ? "bg-amber-50 text-amber-600" : subject.color === "green" ? "bg-emerald-50 text-emerald-600" : subject.color === "violet" ? "bg-violet-50 text-violet-600" : "bg-slate-100 text-slate-600")}><BookOpen className="h-4 w-4" /></div><div><p className="text-xs font-extrabold text-slate-800">{subject.name}</p><p className="mt-1 text-[10px] text-slate-400">اختبار قصير · وزن ٢٠٪</p></div></div><div className="flex flex-1 items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", subject.score >= 90 ? "bg-emerald-500" : subject.score >= 80 ? "bg-blue-500" : "bg-amber-500")} style={{ width: `${subject.score}%` }} /></div><span className="w-12 text-left text-sm font-black text-slate-800">{subject.score} / {subject.max}</span></div><div className="flex items-center justify-between gap-3 sm:w-28 sm:justify-end"><StatusPill tone={subject.status === "مسودة" ? "amber" : "green"}>{subject.status}</StatusPill><button className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4" /></button></div></div>)}</div><div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] font-bold text-slate-500 sm:px-6"><FileCheck2 className="h-4 w-4 text-emerald-600" />الشهادة النهائية لا تصدر قبل نشر جميع الدرجات الإلزامية.</div></SectionCard></div>;
}

function FinanceView({ role, students }: { role: Role; students: Student[] }) {
  const isPersonal = role !== "director";
  const transactions = [{ name: "رسوم دراسية · الفترة الأولى", student: isPersonal ? students[0].name : "الصفوف ٦–١٠", amount: isPersonal ? "١٢٠ ر.ع" : "١٢,٨٥٠ ر.ع", status: "مسدد", date: "٢٠ أغسطس" }, { name: "رسوم الأنشطة المدرسية", student: isPersonal ? students[0].name : "الصف التاسع / أ", amount: isPersonal ? "٣٥ ر.ع" : "٢,١٠٠ ر.ع", status: "جزئي", date: "١٧ أغسطس" }, { name: "مستلزمات المختبر", student: "مصروفات المدرسة", amount: "٨٧٥ ر.ع", status: "مصروف", date: "١٥ أغسطس" }, { name: "رسوم النقل المدرسي", student: isPersonal ? students[0].name : "الصف السادس / ب", amount: isPersonal ? "١٢٠ ر.ع" : "١,٤٤٠ ر.ع", status: "متأخر", date: "٠١ أغسطس" }];
  return <div className="space-y-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-black text-slate-950">{isPersonal ? "الرسوم والمدفوعات" : "الرسوم والمصروفات"}</h2><p className="mt-1 text-xs text-slate-500">العام الدراسي ٢٠٢٦/٢٠٢٧ · العملة: الريال العماني</p></div>{role === "director" && <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-sm hover:bg-emerald-700"><Plus className="h-4 w-4" />تسجيل دفعة</button>}</div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard icon={WalletCards} label={isPersonal ? "المستحق" : "إجمالي المحصل"} value={isPersonal ? "٢٧٥" : "١٢,٨٥٠"} meta="ريال عماني" tone="green" /><MetricCard icon={CircleDollarSign} label={isPersonal ? "المدفوع" : "المصروفات"} value={isPersonal ? "١٥٥" : "٤,٦٨٠"} meta="منذ بداية الفترة" tone="blue" /><MetricCard icon={ReceiptText} label="المتبقي" value={isPersonal ? "١٢٠" : "٣,٤٨٠"} meta="الرصيد المستحق" tone="amber" /><MetricCard icon={ArrowUpRight} label="نسبة التحصيل" value={isPersonal ? "٥٦٪" : "٧٨٪"} meta="مقارنة بالفترة السابقة" tone="rose" trend="up" /></div><SectionCard><SectionHeader title={isPersonal ? "تفاصيل الالتزامات" : "آخر الحركات المالية"} subtitle={isPersonal ? "يمكنك طباعة إيصال لكل دفعة معتمدة" : "الإيرادات والمصروفات المسجلة محليًا"} action={<button className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-500"><Download className="h-4 w-4" />تصدير التقرير</button>} /><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-right"><thead className="bg-slate-50/80 text-[11px] font-extrabold text-slate-500"><tr><th className="px-5 py-3">البند</th><th className="px-4 py-3">الجهة</th><th className="px-4 py-3">المبلغ</th><th className="px-4 py-3">الحالة</th><th className="px-4 py-3">التاريخ</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{transactions.map((transaction, index) => <tr key={`${transaction.name}-${index}`} className="transition hover:bg-slate-50/70"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", transaction.status === "مصروف" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600")}>{transaction.status === "مصروف" ? <ArrowDownLeft className="h-4 w-4" /> : <ReceiptText className="h-4 w-4" />}</div><span className="text-xs font-extrabold text-slate-800">{transaction.name}</span></div></td><td className="px-4 py-4 text-xs text-slate-500">{transaction.student}</td><td className="px-4 py-4 text-xs font-black tabular text-slate-800">{transaction.amount}</td><td className="px-4 py-4"><StatusPill tone={transaction.status === "مسدد" ? "green" : transaction.status === "متأخر" ? "red" : transaction.status === "مصروف" ? "blue" : "amber"}>{transaction.status}</StatusPill></td><td className="px-4 py-4 text-[11px] text-slate-400">{transaction.date}</td><td className="px-4 py-4"><button className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4" /></button></td></tr>)}</tbody></table></div></SectionCard></div>;
}

function AnnouncementsView({ role, onToast }: { role: Role; onToast: (title: string, description?: string) => void }) {
  const [readIds, setReadIds] = useState(() => new Set(announcements.filter((item) => item.read).map((item) => item.id)));
  return <div className="space-y-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-black text-slate-950">الإعلانات والإشعارات</h2><p className="mt-1 text-xs text-slate-500">ابقَ على اطلاع بآخر أخبار المدرسة والمواعيد المهمة.</p></div>{role === "director" && <button onClick={() => onToast("مسودة إعلان جديدة", "تم فتح نموذج الإعلان في النسخة التجريبية.")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-sm hover:bg-emerald-700"><Plus className="h-4 w-4" />إنشاء إعلان</button>}</div><div className="grid gap-4 lg:grid-cols-2">{announcements.map((announcement) => { const isRead = readIds.has(announcement.id); return <article key={announcement.id} className={cn("rounded-[22px] border bg-white p-5 shadow-[0_8px_24px_rgba(23,60,52,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(23,60,52,0.08)]", !isRead ? "border-emerald-200 ring-2 ring-emerald-500/5" : "border-slate-200/80")}><div className="flex items-start gap-3"><div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", announcement.tone === "blue" ? "bg-blue-50 text-blue-600" : announcement.tone === "amber" ? "bg-amber-50 text-amber-600" : announcement.tone === "green" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600")}><Bell className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><StatusPill tone={announcement.tone === "blue" ? "blue" : announcement.tone === "amber" ? "amber" : announcement.tone === "green" ? "green" : "slate"}>{announcement.target}</StatusPill>{!isRead && <span className="text-[10px] font-black text-rose-600">جديد</span>}</div><h3 className="mt-3 text-sm font-black leading-6 text-slate-900">{announcement.title}</h3></div><button onClick={() => onToast("خيارات الإعلان", "الحذف والأرشفة تتطلب تأكيدًا من المدير.")} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4" /></button></div><p className="mt-2 text-xs leading-6 text-slate-500">{announcement.body}</p><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-[11px] font-medium text-slate-400">{announcement.date}</span><button onClick={() => { setReadIds((current) => new Set(Array.from(current).concat(announcement.id))); onToast("تم تعليم الإعلان كمقروء"); }} className={cn("inline-flex items-center gap-1.5 text-[11px] font-extrabold", isRead ? "text-slate-400" : "text-emerald-700")}>{isRead ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{isRead ? "مقروء" : "تحديد كمقروء"}</button></div></div></div></article>; })}</div></div>;
}

function ScheduleView({ role }: { role: Role }) {
  return <div className="space-y-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-black text-slate-950">الجدول الأسبوعي</h2><p className="mt-1 text-xs text-slate-500">{role === "director" ? "عرض جدول المدرسة · يمكنك مراجعة التعارضات قبل النشر" : "جدول الحصص الخاص بك"}</p></div><div className="flex gap-2"><button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50"><Printer className="h-4 w-4" />طباعة الجدول</button>{role === "director" && <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-700"><Plus className="h-4 w-4" />إضافة حصة</button>}</div></div><div className="grid gap-4 xl:grid-cols-5">{schedule.map((day, dayIndex) => <SectionCard key={day.day} className={cn("overflow-hidden", dayIndex === 0 && "ring-2 ring-emerald-500/15")}><div className={cn("border-b border-slate-100 px-4 py-4", dayIndex === 0 ? "bg-emerald-50/70" : "bg-slate-50/70")}><div className="flex items-center justify-between"><div><h3 className="text-sm font-black text-slate-900">{day.day}</h3><p className="mt-1 text-[10px] font-medium text-slate-400">{day.date}</p></div>{dayIndex === 0 && <StatusPill tone="green">اليوم</StatusPill>}</div></div><div className="space-y-2 p-3">{day.items.map((item) => <div key={`${day.day}-${item.time}`} className={cn("rounded-2xl border p-3", item.color === "blue" ? "border-blue-100 bg-blue-50/50" : item.color === "amber" ? "border-amber-100 bg-amber-50/50" : item.color === "green" ? "border-emerald-100 bg-emerald-50/50" : item.color === "violet" ? "border-violet-100 bg-violet-50/50" : "border-slate-200 bg-slate-50/70")}><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black text-slate-500">{item.time}</span><Clock3 className="h-3.5 w-3.5 text-slate-400" /></div><p className="mt-3 text-xs font-black leading-5 text-slate-800">{item.subject}</p><p className="mt-1 text-[10px] font-medium text-slate-500">{item.teacher}</p><div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-slate-400"><PanelRight className="h-3 w-3" />{item.room}</div></div>)}</div></SectionCard>)}</div><div className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-[11px] font-bold text-blue-800"><ShieldCheck className="h-4 w-4 shrink-0" />تم التحقق من عدم وجود تعارضات زمنية للمعلم أو الفصل في العرض الحالي.</div></div>;
}

function ReportsView({ onToast }: { onToast: (title: string, description?: string) => void }) {
  const reports = [{ title: "تقرير الحضور والغياب", description: "تحليل الحضور حسب الصف والفترة مع قائمة المتجاوزين للحد.", icon: ClipboardCheck, tone: "green", meta: "آخر تحديث اليوم" }, { title: "كشف الدرجات", description: "نتائج الطلاب ونسب التحصيل مع متوسط كل مادة.", icon: Award, tone: "blue", meta: "الفترة الأولى" }, { title: "ملخص الرسوم", description: "المستحق والمدفوع والمتأخرات حسب الصف.", icon: CircleDollarSign, tone: "amber", meta: "حتى ٢٣ أغسطس" }, { title: "حركة البوابة", description: "دخول وخروج الطلاب خلال فترة زمنية قابلة للتحديد.", icon: DoorOpen, tone: "violet", meta: "هذا الأسبوع" }];
  return <div className="space-y-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-black text-slate-950">التقارير</h2><p className="mt-1 text-xs text-slate-500">تقارير قابلة للبحث والتصفية والطباعة على مقاس A4.</p></div><button onClick={() => onToast("تم تجهيز التقرير", "تم فتح معاينة الطباعة للتقرير المحدد.")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50"><Printer className="h-4 w-4" />طباعة التقرير</button></div><div className="grid gap-4 sm:grid-cols-2">{reports.map((report) => <SectionCard key={report.title} className="p-5"><div className="flex items-start gap-4"><div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", report.tone === "green" ? "bg-emerald-50 text-emerald-700" : report.tone === "blue" ? "bg-blue-50 text-blue-700" : report.tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-violet-50 text-violet-700")}><report.icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h3 className="text-sm font-black text-slate-900">{report.title}</h3><p className="mt-2 text-xs leading-6 text-slate-500">{report.description}</p><div className="mt-4 flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-slate-400">{report.meta}</span><button onClick={() => onToast("جاري فتح التقرير", report.title)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black text-white hover:bg-slate-700"><Eye className="h-3.5 w-3.5" />فتح التقرير</button></div></div></div></SectionCard>)}</div><SectionCard><SectionHeader title="ملخص المؤشرات" subtitle="الفترة الحالية · ١ أغسطس – ٢٣ أغسطس ٢٠٢٦" action={<button className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-500"><SlidersHorizontal className="h-4 w-4" />الفلاتر</button>} /><div className="grid gap-5 p-5 md:grid-cols-3"><div><div className="flex items-center justify-between text-xs font-bold"><span className="text-slate-500">انتظام الحضور</span><span className="text-emerald-700">٩٢٪</span></div><div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-full w-[92%] rounded-full bg-emerald-500" /></div></div><div><div className="flex items-center justify-between text-xs font-bold"><span className="text-slate-500">نسبة التحصيل</span><span className="text-blue-700">٧٨٪</span></div><div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-full w-[78%] rounded-full bg-blue-500" /></div></div><div><div className="flex items-center justify-between text-xs font-bold"><span className="text-slate-500">نشر الدرجات</span><span className="text-amber-700">٨٤٪</span></div><div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-full w-[84%] rounded-full bg-amber-400" /></div></div></div></SectionCard></div>;
}

function AiView({ onToast }: { onToast: (title: string, description?: string) => void }) {
  const [prompt, setPrompt] = useState("لخّص لي اتجاهات الحضور والتحصيل خلال الأسبوعين الماضيين.");
  const [generated, setGenerated] = useState(false);
  return <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]"><section className="rounded-[26px] bg-gradient-to-br from-[#183b56] via-[#204d66] to-[#0d7054] p-6 text-white shadow-[0_18px_45px_rgba(24,59,86,0.18)] sm:p-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Sparkles className="h-6 w-6 text-amber-200" /></div><p className="mt-6 text-xs font-bold text-sky-100">مساعد المدير · مسودة مقترحة</p><h2 className="mt-2 max-w-md text-2xl font-black leading-[1.5]">حوّل الأرقام إلى صورة واضحة تساعدك على المتابعة.</h2><p className="mt-3 max-w-lg text-sm leading-7 text-white/70">تُحسب المؤشرات برمجيًا أولًا، ثم يشرحها المساعد دون الوصول إلى قاعدة البيانات الخام. لا ينشر إعلانًا ولا يعدّل سجلًا من تلقاء نفسه.</p><div className="mt-7 rounded-2xl border border-white/15 bg-white/10 p-4"><label className="text-[11px] font-extrabold text-white/80">ماذا تريد أن تعرف؟</label><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} className="mt-3 w-full resize-none rounded-xl border-0 bg-white/10 p-3 text-sm leading-7 text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-white/20" /><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-medium text-white/50">البيانات: ١ أغسطس – ٢٣ أغسطس ٢٠٢٦</span><button onClick={() => { setGenerated(true); onToast("تم إعداد مسودة التحليل", "راجع نطاق البيانات قبل اعتماد أي إجراء."); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-black text-[#183b56] hover:bg-sky-50"><Sparkles className="h-4 w-4" />إنشاء مسودة</button></div></div></section><SectionCard><SectionHeader title="نتيجة التحليل" subtitle="يظهر هنا وقت التوليد ونطاق البيانات" action={<StatusPill tone="amber">مسودة مقترحة</StatusPill>} /><div className="p-5">{generated ? <div className="space-y-4"><div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"><div className="flex items-center gap-2 text-xs font-black text-emerald-800"><CheckCircle2 className="h-4 w-4" />ملخص الاتجاه العام</div><p className="mt-2 text-xs leading-7 text-slate-600">تحسن متوسط الحضور من ٨٩٪ إلى ٩٢٪ خلال الأسبوعين الماضيين، مع استقرار التحصيل عند ٨٦٪. تظهر الحاجة إلى متابعة ثلاثة طلاب انخفض حضورهم عن الحد المحدد.</p></div><div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="flex items-center gap-2 text-xs font-black text-blue-800"><Activity className="h-4 w-4" />مؤشر يستحق المراجعة</div><p className="mt-2 text-xs leading-7 text-slate-600">تتركز حالات الغياب الأعلى في الصف الثامن / ج. يقترح المساعد مراجعة الأسباب مع رائد الفصل، دون اتخاذ إجراء آلي.</p></div><div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400"><span>تم التوليد: الآن · النموذج التجريبي المحلي</span><button onClick={() => onToast("تم نسخ المسودة", "يمكن مراجعتها قبل نشرها في الإعلانات.")} className="font-extrabold text-emerald-700">نسخ النص</button></div></div> : <div className="flex min-h-[290px] flex-col items-center justify-center text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><MessageSquareText className="h-6 w-6" /></div><h3 className="mt-4 text-sm font-black text-slate-700">لم تُنشأ مسودة بعد</h3><p className="mt-2 max-w-xs text-xs leading-6 text-slate-400">اكتب سؤالك أو استخدم النص المقترح، ثم اطلب من المساعد شرح المؤشرات.</p></div>}</div></SectionCard><div className="xl:col-span-2 flex items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-[11px] font-bold leading-6 text-amber-800"><ShieldAlert className="h-4 w-4 shrink-0" />الذكاء الاصطناعي اختياري، ولا تُرسل بيانات حساسة في النموذج التجريبي. أي مسودة تحتاج مراجعة بشرية قبل النشر.</div></div>;
}

function SettingsView({ onToast }: { onToast: (title: string, description?: string) => void }) {
  const settings = [{ title: "هوية المدرسة", description: "الاسم والشعار وبيانات الاتصال الظاهرة في المطبوعات.", icon: GraduationCap, value: "اسم المدرسة" }, { title: "العام الدراسي", description: "الفترة الحالية والفترات الدراسية وحالة النشر.", icon: CalendarDays, value: "٢٠٢٦ / ٢٠٢٧" }, { title: "نظام الدرجات", description: "سلم التقديرات والتقريب وحدود النشر.", icon: Award, value: "النظام الافتراضي" }, { title: "الحضور والغياب", description: "حد الغياب والمنطقة الزمنية وأيام العطل.", icon: ClipboardCheck, value: "Asia/Muscat" }, { title: "الخصوصية والذكاء الاصطناعي", description: "تفعيل الميزات وحدود الاستهلاك وسياسة البيانات.", icon: ShieldCheck, value: "مفعّل اختياريًا" }, { title: "استعادة البيانات التجريبية", description: "إرجاع النموذج إلى حالته الأولى بعد تأكيد واضح.", icon: RefreshCcw, value: "آخر ضبط: اليوم" }];
  return <div className="space-y-5"><div><h2 className="text-xl font-black text-slate-950">الإعدادات</h2><p className="mt-1 text-xs text-slate-500">تهيئة عامة للمدرسة · هذه النسخة تجريبية وتخزن التفضيلات على الجهاز.</p></div><div className="grid gap-4 sm:grid-cols-2">{settings.map((setting) => <button key={setting.title} onClick={() => onToast(setting.title, "سيتم فتح إعدادات هذه الوحدة في النسخة التالية.")} className="group flex items-start gap-4 rounded-[22px] border border-slate-200/80 bg-white p-5 text-right shadow-[0_8px_24px_rgba(23,60,52,0.04)] transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_14px_30px_rgba(23,60,52,0.08)]"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition group-hover:bg-emerald-50 group-hover:text-emerald-700"><setting.icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="text-sm font-black text-slate-900">{setting.title}</h3><ArrowLeft className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:-translate-x-1 group-hover:text-emerald-600" /></div><p className="mt-2 text-xs leading-6 text-slate-500">{setting.description}</p><span className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold text-slate-600">{setting.value}</span></div></button>)}</div><div className="flex flex-col gap-3 rounded-[22px] border border-rose-100 bg-rose-50/70 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black text-rose-900">بيانات تجريبية</p><p className="mt-1 text-xs leading-6 text-rose-800/70">لا تستخدم هذه النسخة كلمات مرور أو بيانات طلاب حقيقية. إعادة الضبط تعيد البيانات الأولية فقط.</p></div><button onClick={() => onToast("إعادة ضبط البيانات", "سيطلب النظام تأكيدًا قبل حذف أي تعديل محلي.")} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-xs font-black text-rose-700 hover:bg-rose-100"><RefreshCcw className="h-4 w-4" />إعادة ضبط النموذج</button></div></div>;
}

function GateView({ students, onToast }: { students: Student[]; onToast: (title: string, description?: string) => void }) {
  const [query, setQuery] = useState("");
  const [movement, setMovement] = useState<Array<{ name: string; action: string; time: string; tone: "green" | "blue" }>>([{ name: "سارة أحمد الخروصي", action: "دخول", time: "٠٧:١٢", tone: "green" }, { name: "خالد ناصر البوسعيدي", action: "دخول", time: "٠٧:٠٨", tone: "green" }, { name: "ليان خالد البلوشية", action: "خروج", time: "٠٨:١٥", tone: "blue" }]);
  const result = students.find((student) => `${student.name} ${student.studentNo}`.includes(query.trim())) || students[0];
  const addMovement = (action: "دخول" | "خروج") => { setMovement((current) => [{ name: result.name, action, time: "٠٨:٢٤", tone: action === "دخول" ? "green" : "blue" }, ...current]); onToast(`تم تسجيل ${action} الطالب`, `${result.name} · تم حفظ الحركة محليًا.`); };
  return <div className="space-y-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-black text-slate-950">حركة البوابة</h2><p className="mt-1 text-xs text-slate-500">واجهة سريعة لموظف الأمن · لا تعرض الدرجات أو الرسوم.</p></div><StatusPill tone="green"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />البوابة مفتوحة</StatusPill></div><SectionCard className="p-5"><div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder="ابحث بالاسم أو الرقم الطلابي" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pr-10 text-sm outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-500/10" /></div><div className="mt-4 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"><Avatar initials={result.initials} tone="blue" size="lg" /><div className="flex-1"><p className="text-sm font-black text-slate-900">{result.name}</p><p className="mt-1 text-xs text-slate-500">{result.studentNo} · {result.className}</p><div className="mt-2"><StatusPill tone="green">نشط في السجل</StatusPill></div></div><div className="flex gap-2"><button onClick={() => addMovement("دخول")} className="min-h-11 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-700">تسجيل دخول</button><button onClick={() => addMovement("خروج")} className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-700 hover:bg-slate-50">تسجيل خروج</button></div></div></SectionCard><SectionCard><SectionHeader title="سجل اليوم" subtitle="الحركات الأخيرة مرتبة من الأحدث" action={<button className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-500"><Download className="h-4 w-4" />تصدير</button>} /><div className="divide-y divide-slate-100">{movement.map((entry, index) => <div key={`${entry.name}-${entry.time}-${index}`} className="flex items-center gap-3 px-5 py-4"><div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", entry.tone === "green" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600")}>{entry.tone === "green" ? <ArrowDownLeft className="h-4 w-4 rotate-45" /> : <ArrowUpRight className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold text-slate-800">{entry.name}</p><p className="mt-1 text-[10px] text-slate-400">موظف الأمن · البوابة الرئيسية</p></div><StatusPill tone={entry.tone}>{entry.action}</StatusPill><span className="text-[11px] font-bold tabular text-slate-400">{entry.time}</span></div>)}</div></SectionCard></div>;
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[26px] bg-white p-5 shadow-2xl sm:rounded-[26px] sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-black text-slate-950">{title}</h2><p className="mt-1 text-xs leading-6 text-slate-500">{description}</p></div><button onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button></div><div className="mt-5">{children}</div></div></div>;
}

export default function SchoolPlatform() {
  const { toast } = useToast();
  const [role, setRole] = useState<Role>(() => (localStorage.getItem("school_demo_role") as Role) || "director");
  const [view, setView] = useState<View>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>(seedStudents);
  const [attendance, setAttendance] = useState<Record<string, AttendanceState>>(attendanceSeed);

  useEffect(() => { localStorage.setItem("school_demo_role", role); }, [role]);
  useEffect(() => { document.title = `اسم المدرسة · ${viewMeta[view].title}`; }, [view]);

  const allowedViews = roleNav[role];
  const visibleNav = useMemo(() => navGroups.map((group) => ({ ...group, items: group.items.filter((item) => allowedViews.includes(item.id)) })).filter((group) => group.items.length > 0), [allowedViews]);
  const chooseView = (nextView: View) => { setView(nextView); setMobileOpen(false); };
  const handleRole = (nextRole: Role) => { setRole(nextRole); setView("dashboard"); setMobileOpen(false); toast({ title: `تم التبديل إلى مساحة ${roleMeta[nextRole].label}`, description: "هذه جلسة تجريبية محلية وليست مصادقة إنتاجية." }); };
  const notify = (title: string, description?: string) => toast({ title, description });

  const renderContent = () => {
    if (view === "dashboard") return <DashboardView role={role} students={students} setView={chooseView} onToast={notify} />;
    if (view === "students") return role === "director" ? <StudentsView students={students} setStudents={setStudents} onToast={notify} /> : <AccessNotice />;
    if (view === "attendance") return <AttendanceView students={role === "student" ? [students[0]] : role === "guardian" ? students.slice(0, 2) : students} attendance={attendance} setAttendance={setAttendance} onToast={notify} />;
    if (view === "grades") return <GradesView role={role} students={students} />;
    if (view === "finance") return <FinanceView role={role} students={students} />;
    if (view === "announcements") return <AnnouncementsView role={role} onToast={notify} />;
    if (view === "schedule") return <ScheduleView role={role} />;
    if (view === "reports") return role === "director" ? <ReportsView onToast={notify} /> : <AccessNotice />;
    if (view === "ai") return role === "director" ? <AiView onToast={notify} /> : <AccessNotice />;
    if (view === "settings") return role === "director" ? <SettingsView onToast={notify} /> : <AccessNotice />;
    if (view === "gate") return <GateView students={students} onToast={notify} />;
    return <DashboardView role={role} students={students} setView={chooseView} onToast={notify} />;
  };

  return <div dir="rtl" className="min-h-screen bg-[#f3f7f6] text-slate-900"><aside className={cn("fixed inset-y-0 right-0 z-40 flex w-[268px] flex-col border-l border-slate-200/80 bg-white transition-transform duration-200 lg:translate-x-0", mobileOpen ? "translate-x-0" : "translate-x-full")}><div className="flex h-[84px] items-center gap-3 border-b border-slate-100 px-5"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0d7054] text-white shadow-[0_8px_18px_rgba(13,112,84,0.18)]"><GraduationCap className="h-6 w-6" /></div><div className="min-w-0"><p className="truncate text-sm font-black text-slate-950">اسم المدرسة</p><p className="mt-1 text-[10px] font-bold text-slate-400">نظام الإدارة المدرسية</p></div><button onClick={() => setMobileOpen(false)} aria-label="إغلاق القائمة" className="mr-auto flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 lg:hidden"><X className="h-5 w-5" /></button></div><div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-[#f5f8f7] p-3"><Avatar initials={roleMeta[role].initials} tone={role === "security" ? "blue" : "green"} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-800">{roleMeta[role].label}</p><p className="mt-1 text-[10px] text-slate-400">{roleMeta[role].subtitle}</p></div><ChevronDown className="h-4 w-4 text-slate-400" /></div><div className="flex-1 overflow-y-auto px-3 py-5">{visibleNav.map((group) => <div key={group.label} className="mb-5"><p className="px-3 pb-2 text-[10px] font-black tracking-wide text-slate-400">{group.label}</p><div className="space-y-1">{group.items.map((item) => <button key={item.id} onClick={() => chooseView(item.id)} className={cn("group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-right text-xs font-bold transition", view === item.id ? "bg-emerald-50 text-emerald-800" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800")}><item.icon className={cn("h-[18px] w-[18px] shrink-0", view === item.id ? "text-emerald-700" : "text-slate-400 group-hover:text-slate-600")} /><span className="flex-1">{item.label}</span>{item.badge && <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-black", view === item.id ? "bg-white text-emerald-700" : "bg-rose-50 text-rose-600")}>{item.badge}</span>}</button>)}</div></div>)}{role === "director" && <button onClick={() => chooseView("ai")} className={cn("group mt-2 flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-right text-xs font-extrabold transition", view === "ai" ? "bg-[#eaf4f1] text-emerald-800" : "bg-[#f7faf9] text-slate-600 hover:bg-emerald-50 hover:text-emerald-800")}><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><Sparkles className="h-4 w-4" /></div><span className="flex-1">المساعد الذكي</span><span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700">تجريبي</span></button>}</div><div className="border-t border-slate-100 p-3"><button onClick={() => chooseView("settings")} className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-right text-xs font-bold transition", view === "settings" ? "bg-emerald-50 text-emerald-800" : "text-slate-500 hover:bg-slate-50")}><Settings2 className="h-[18px] w-[18px] text-slate-400" /><span className="flex-1">الإعدادات</span></button><button onClick={() => notify("الجلسة التجريبية", "تسجيل الخروج الحقيقي يحتاج خادم مصادقة في مرحلة الإنتاج.")} className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-right text-xs font-bold text-slate-400 transition hover:bg-rose-50 hover:text-rose-700"><LogOut className="h-[18px] w-[18px]" /><span>تسجيل الخروج</span></button></div></aside><div className={cn("fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-[1px] transition-opacity lg:hidden", mobileOpen ? "opacity-100" : "pointer-events-none opacity-0")} onClick={() => setMobileOpen(false)} /><div className="min-h-screen lg:pr-[268px]"><header className="sticky top-0 z-20 flex h-[74px] items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8"><button onClick={() => setMobileOpen(true)} aria-label="فتح القائمة" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 lg:hidden"><Menu className="h-5 w-5" /></button><div className="min-w-0 flex-1"><p className="text-[10px] font-black text-emerald-700">{viewMeta[view].eyebrow}</p><h1 className="mt-1 truncate text-base font-black text-slate-950 sm:text-lg">{viewMeta[view].title}</h1></div><div className="hidden items-center gap-2 md:flex"><div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input placeholder="بحث سريع..." className="h-10 w-44 rounded-xl border border-slate-200 bg-slate-50 pr-9 text-xs outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 lg:w-56" /></div><button onClick={() => notify("الإشعارات", "لديك إشعاران جديدان من المدرسة.")} aria-label="الإشعارات" className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-white" /></button></div><div className="group relative"><button className="flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-slate-50"><Avatar initials={roleMeta[role].initials} tone={role === "security" ? "blue" : "green"} size="sm" /><span className="hidden text-right sm:block"><span className="block text-[11px] font-black text-slate-800">{roleMeta[role].label}</span><span className="mt-0.5 block text-[10px] text-slate-400">جلسة تجريبية</span></span><ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" /></button><div className="invisible absolute left-0 top-12 w-48 rounded-2xl border border-slate-200 bg-white p-2 opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:opacity-100"><p className="px-2 py-2 text-[10px] font-black text-slate-400">تبديل مساحة العمل</p>{(Object.keys(roleMeta) as Role[]).map((availableRole) => <button key={availableRole} onClick={() => handleRole(availableRole)} className={cn("flex min-h-10 w-full items-center gap-2 rounded-xl px-2 text-right text-xs font-bold transition hover:bg-slate-50", role === availableRole ? "bg-emerald-50 text-emerald-800" : "text-slate-600")}><span className={cn("h-2 w-2 rounded-full", role === availableRole ? "bg-emerald-600" : "bg-slate-300")} />{roleMeta[availableRole].label}</button>)}</div></div></header><main className="mx-auto max-w-[1480px] p-4 sm:p-6 lg:p-8">{renderContent()}</main><footer className="mx-auto flex max-w-[1480px] flex-col gap-2 px-4 pb-8 text-[10px] font-medium text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><span>اسم المدرسة · نسخة تجريبية محلية</span><span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />لا توجد بيانات حقيقية أو مفاتيح API داخل هذه النسخة</span></footer></div></div>;
}

function AccessNotice() {
  return <div className="flex min-h-[420px] items-center justify-center"><div className="max-w-md rounded-[26px] border border-slate-200 bg-white p-8 text-center shadow-[0_12px_35px_rgba(23,60,52,0.06)]"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><ShieldAlert className="h-7 w-7" /></div><h2 className="mt-5 text-lg font-black text-slate-900">هذه الصفحة غير متاحة</h2><p className="mt-2 text-sm leading-7 text-slate-500">لا تظهر هذه الوظيفة ضمن صلاحيات الدور الحالي. يتم تطبيق الصلاحيات على مستوى الواجهة في النموذج، ويجب تطبيقها على الخادم في الإنتاج.</p><button className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black text-white hover:bg-slate-700"><ArrowLeft className="h-4 w-4" />العودة للوحة التحكم</button></div></div>;
}
