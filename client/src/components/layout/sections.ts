import {
  Home,
  Wallet,
  Users,
  BarChart3,
  Landmark,
  Settings,
  type LucideIcon,
} from "lucide-react";

// خريطة أقسام النظام: ستة أقسام بدل أربع عشرة أيقونة متشابكة.
// كل قسم يجمع الصفحات التي تخدم غرضاً واحداً، والصفحات نفسها لم تتغير —
// مساراتها القديمة كلها باقية تعمل، وإنما صارت تبويبات داخل قسمها.
export interface SectionTab {
  href: string;
  label: string;
  adminOnly?: boolean;
}

export interface Section {
  key: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  tabs: SectionTab[];
  /** مسارات تنتمي للقسم بلا تبويب خاص (مثل صفحة تفاصيل عضو) */
  extraPaths?: string[];
}

export const SECTIONS: Section[] = [
  {
    key: "home",
    label: "الرئيسية",
    desc: "نظرة عامة على الصندوق",
    icon: Home,
    tabs: [{ href: "/dashboard", label: "لوحة الصندوق" }],
  },
  {
    key: "transactions",
    label: "الحركات",
    desc: "كل ما يدخل الصندوق ويخرج منه",
    icon: Wallet,
    tabs: [
      { href: "/payments", label: "المساهمات" },
      { href: "/loans", label: "السلف" },
      { href: "/expenses", label: "الإنفاق", adminOnly: true },
      { href: "/fund-ops", label: "إجراءات مباشرة", adminOnly: true },
    ],
  },
  {
    key: "members",
    label: "الأعضاء",
    desc: "أفراد العائلة وحساباتهم",
    icon: Users,
    adminOnly: true,
    tabs: [{ href: "/members", label: "قائمة الأعضاء" }],
    extraPaths: ["/members/"],
  },
  {
    key: "reports",
    label: "التقارير",
    desc: "الأرقام والكشوف والسجل",
    icon: BarChart3,
    tabs: [
      { href: "/analytics", label: "التحليلات" },
      { href: "/report-builder", label: "كشف حساب", adminOnly: true },
      { href: "/annual-report", label: "التقرير السنوي", adminOnly: true },
      { href: "/platform-review", label: "خارطة التطوير", adminOnly: true },
      { href: "/audit-log", label: "سجل التدقيق" },
    ],
  },
  {
    key: "fund",
    label: "الصندوق",
    desc: "قرارات العائلة واستثمار المال",
    icon: Landmark,
    tabs: [
      { href: "/proposals", label: "قرارات العائلة" },
      { href: "/investments", label: "الاستثمار والزكاة", adminOnly: true },
      { href: "/governance", label: "الحوكمة" },
    ],
  },
  {
    key: "settings",
    label: "الإعدادات",
    desc: "حسابك وإعدادات الصندوق",
    icon: Settings,
    tabs: [
      { href: "/profile", label: "حسابي" },
      { href: "/settings", label: "إعدادات الصندوق", adminOnly: true },
      { href: "/notifications", label: "الإشعارات", adminOnly: true },
      { href: "/admin", label: "الإدارة والمستخدمون", adminOnly: true },
    ],
  },
];

export function visibleSections(isAdmin: boolean): Array<Section & { tabs: SectionTab[]; href: string }> {
  return SECTIONS
    .filter((s) => !s.adminOnly || isAdmin)
    .map((s) => {
      const tabs = s.tabs.filter((t) => !t.adminOnly || isAdmin);
      return { ...s, tabs, href: tabs[0]?.href ?? "/dashboard" };
    })
    .filter((s) => s.tabs.length > 0);
}

// القسم الذي ينتمي إليه المسار الحالي
export function sectionOf(location: string, isAdmin: boolean) {
  const sections = visibleSections(isAdmin);
  return (
    sections.find((s) => s.tabs.some((t) => t.href === location)) ??
    sections.find((s) => s.extraPaths?.some((p) => location.startsWith(p))) ??
    null
  );
}
