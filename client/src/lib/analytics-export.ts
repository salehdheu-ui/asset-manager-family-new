import type { ExcelSheetSpec } from "./excel";

// بناء أوراق تقرير التحليلات — دالة صرفة تُبقي صفحة التحليلات مركّزة على العرض
export interface AnalyticsExportInput<T extends string = string> {
  periodLabel: string;
  monthNames: string[];
  formatCurrency: (value: number) => string;
  getTransactionTypeLabel: (type: T) => string;
  totals: {
    contributions: number;
    loans: number;
    expenses: number;
    netFlow: number;
    repayments: number;
    activeMembers: number;
    averageContribution: number;
  };
  topContributor?: { name: string; filteredContributionsTotal: number } | null;
  transactions: Array<{
    date: string;
    type: T;
    title: string;
    amount: number;
    memberName: string;
    status: string;
    year: number;
    month?: number | null;
  }>;
  memberStats: Array<{
    name: string;
    role: string;
    totalPaid: number;
    totalBorrowed: number;
    filteredContributionsTotal: number;
    filteredLoansTotal: number;
    contributionCount: number;
    loanCount: number;
    netPosition: number;
  }>;
}

export function buildAnalyticsSheets<T extends string>(input: AnalyticsExportInput<T>): ExcelSheetSpec[] {
  const { totals, monthNames } = input;

  const summaryRows = [
    { المؤشر: "الفترة", القيمة: input.periodLabel },
    { المؤشر: "إجمالي المساهمات", القيمة: totals.contributions },
    { المؤشر: "إجمالي السلف", القيمة: totals.loans },
    { المؤشر: "إجمالي المصروفات", القيمة: totals.expenses },
    { المؤشر: "صافي التدفق", القيمة: totals.netFlow },
    { المؤشر: "المسدد من السلف", القيمة: totals.repayments },
    { المؤشر: "الأعضاء النشطون", القيمة: totals.activeMembers },
    { المؤشر: "عدد الحركات", القيمة: input.transactions.length },
    { المؤشر: "متوسط المساهمة", القيمة: Math.round(totals.averageContribution) },
    {
      المؤشر: "أعلى مساهم",
      القيمة: input.topContributor
        ? `${input.topContributor.name} - ${input.formatCurrency(input.topContributor.filteredContributionsTotal)}`
        : "لا يوجد",
    },
  ];

  const txRows = input.transactions.map((t) => ({
    التاريخ: t.date,
    النوع: input.getTransactionTypeLabel(t.type),
    العنوان: t.title,
    المبلغ: t.amount,
    العضو: t.memberName,
    الحالة: t.status,
    السنة: t.year,
    الشهر: t.month ? monthNames[t.month - 1] : "",
  }));

  const memberRows = input.memberStats.map((m, i) => ({
    الترتيب: i + 1,
    الاسم: m.name,
    الصفة: m.role === "guardian" ? "الوصي" : "عضو",
    إجمالي_المساهمات: m.totalPaid,
    إجمالي_السلف_القائمة: m.totalBorrowed,
    مساهمات_الفترة: m.filteredContributionsTotal,
    سلف_الفترة: m.filteredLoansTotal,
    عدد_المساهمات: m.contributionCount,
    عدد_السلف: m.loanCount,
    صافي_المركز: m.netPosition,
  }));

  return [
    { name: "الملخص", rows: summaryRows, columnWidths: [28, 28] },
    { name: "الحركات", rows: txRows, columnWidths: [16, 14, 30, 14, 20, 14] },
    { name: "الأعضاء", rows: memberRows, columnWidths: [8, 22, 12, 16, 16, 16, 16, 16, 16, 16] },
  ];
}
