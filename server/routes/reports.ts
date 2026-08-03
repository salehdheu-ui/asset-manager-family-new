import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated, isAdmin } from "../auth";
import { computeDashboardSummary } from "../services/dashboard";
import { loadRates } from "../services/rates";
import { computeCommitmentScore, projectCashflow, dueMonthsInYear, isInstallmentLate, recentDueMonths, MONTHLY_DUE_DAY, computeArrears, computeMemberShares, computeZakat, isHawlComplete, overdueInstallments, overdueAmount } from "@shared/finance";
import { rebalanceYear } from "../capital-engine";

export function registerReportRoutes(app: Express) {
  // درجة الالتزام لكل عضو — انتظام المساهمات 60٪ + سلوك السداد 40٪
  app.get("/api/reports/commitment-scores", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const [members, contributions, loans, payments, repayments] = await Promise.all([
        storage.getMembers(),
        storage.getContributions(),
        storage.getLoans(),
        storage.getAllLoanPayments(),
        storage.getAllLoanRepayments(),
      ]);

      const now = new Date();
      // النافذة تشمل آخر 12 شهراً مضت مهلتها فقط — الشهر الجاري لا يُحاسَب عليه قبل يوم 26
      const dueWindow = recentDueMonths(now, 12);
      const dueKeys = new Set(dueWindow.map((d) => `${d.year}-${d.month}`));
      const windowMonths = dueWindow.length;

      const scores = members.map((member) => {
        const memberContribs = contributions.filter(
          (c) => c.memberId === member.id && c.status === "approved" && dueKeys.has(`${c.year}-${c.month}`),
        );
        const contributedMonths = new Set(memberContribs.map((c) => `${c.year}-${c.month}`)).size;

        const memberLoans = loans.filter((l) => l.memberId === member.id && l.status === "approved");
        const loanIds = new Set(memberLoans.map((l) => l.id));
        const totalBorrowed = memberLoans.reduce((s, l) => s + Number(l.amount), 0);
        const totalRepaid = payments.filter((p) => loanIds.has(p.loanId)).reduce((s, p) => s + Number(p.amount), 0);
        // الأقساط تُغطّى بما دُفع على سلفتها — سلفة مسدّدة لا أقساط متأخرة عليها
        const lateCount = memberLoans.reduce((n, loan) => {
          const paidOnLoan = payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + Number(p.amount), 0);
          const own = repayments.filter((r) => r.loanId === loan.id);
          return n + overdueInstallments(own, paidOnLoan, now).length;
        }, 0);

        return {
          memberId: member.id,
          name: member.name,
          score: computeCommitmentScore({ monthsConsidered: windowMonths, contributedMonths, totalBorrowed, totalRepaid, overdueInstallments: lateCount }),
          contributedMonths,
          windowMonths,
          totalBorrowed: Number(totalBorrowed.toFixed(3)),
          totalRepaid: Number(totalRepaid.toFixed(3)),
          overdueInstallments: lateCount,
        };
      });

      res.json(scores.sort((a, b) => b.score - a.score));
    } catch (error) {
      console.error("Commitment scores error:", error);
      res.status(500).json({ error: "تعذر حساب درجات الالتزام" });
    }
  });

  // إسقاط السيولة للأشهر الستة القادمة
  app.get("/api/reports/cashflow-forecast", isAuthenticated, async (_req, res) => {
    try {
      const [summary, contributions, repayments] = await Promise.all([
        computeDashboardSummary(),
        storage.getContributions(),
        storage.getAllLoanRepayments(),
      ]);

      // متوسط المساهمات المعتمدة لآخر 6 أشهر مكتملة
      const now = new Date();
      const monthTotals = new Map<string, number>();
      for (const c of contributions) {
        if (c.status !== "approved") continue;
        const key = `${c.year}-${String(c.month).padStart(2, "0")}`;
        monthTotals.set(key, (monthTotals.get(key) ?? 0) + Number(c.amount));
      }
      const past6: number[] = [];
      for (let i = 1; i <= 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        past6.push(monthTotals.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`) ?? 0);
      }
      const nonZero = past6.filter((v) => v > 0);
      const avgMonthlyContributions = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;

      // الأقساط المجدولة حسب شهر استحقاقها
      const scheduledByMonth: Record<string, number> = {};
      for (const r of repayments) {
        if (r.status !== "scheduled" || !r.dueDate) continue;
        const d = new Date(r.dueDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        scheduledByMonth[key] = (scheduledByMonth[key] ?? 0) + Number(r.amount);
      }

      const months: string[] = [];
      for (let i = 1; i <= 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }

      const forecast = projectCashflow({
        startBalance: summary.netCapital,
        avgMonthlyContributions,
        scheduledByMonth,
        months,
      });

      res.json({
        currentBalance: summary.netCapital,
        avgMonthlyContributions: Number(avgMonthlyContributions.toFixed(3)),
        forecast,
        note: "الإسقاط مبني على متوسط المساهمات المعتمدة لآخر 6 أشهر والأقساط المجدولة — السلف والمصروفات المستقبلية غير المعروفة ليست محسوبة",
      });
    } catch (error) {
      console.error("Cashflow forecast error:", error);
      res.status(500).json({ error: "تعذر حساب إسقاط السيولة" });
    }
  });

  // متأخرات المساهمات بالريال لكل عضو — تعتمد الاشتراك الشهري المتوقع ومهلة يوم 26
  app.get("/api/reports/arrears", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const [members, contributions, rates] = await Promise.all([
        storage.getMembers(),
        storage.getContributions(),
        loadRates(),
      ]);

      const now = new Date();
      const dueMonths = recentDueMonths(now, 12);

      const rows = members.map((member) => {
        const paidByMonth: Record<string, number> = {};
        for (const c of contributions) {
          if (c.memberId !== member.id || c.status !== "approved") continue;
          const key = `${c.year}-${c.month}`;
          paidByMonth[key] = (paidByMonth[key] ?? 0) + Number(c.amount);
        }
        return {
          memberId: member.id,
          name: member.name,
          expectedMonthly: rates.currentRate(member.id, now),
          ...computeArrears({ rates: rates.ratesFor(member.id), joinedAt: member.createdAt, dueMonths, paidByMonth }),
        };
      });

      res.json({
        windowMonths: dueMonths.length,
        familyDefault: rates.currentRate("", now),
        totalArrears: Number(rows.reduce((s, r) => s + r.arrears, 0).toFixed(3)),
        members: rows.sort((a, b) => b.arrears - a.arrears),
      });
    } catch (error) {
      console.error("Arrears report error:", error);
      res.status(500).json({ error: "تعذر حساب المتأخرات" });
    }
  });

  // حصة كل عضو من الصندوق — مرجّحة بالزمن على صافي الأصول الحالي
  app.get("/api/reports/member-shares", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const [members, contributions, summary] = await Promise.all([
        storage.getMembers(),
        storage.getContributions(),
        computeDashboardSummary(),
      ]);

      const approved = contributions
        .filter((c) => c.status === "approved")
        .map((c) => ({
          memberId: c.memberId,
          amount: Number(c.amount),
          at: c.approvedAt ?? c.createdAt ?? new Date(c.year, c.month - 1, 1),
        }));

      const shares = computeMemberShares(approved, summary.netCapital);
      const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "عضو";

      res.json({
        netAssets: summary.netCapital,
        note: "الحصة مرجّحة بالزمن — ريال بقي في الصندوق سنة أثقل من ريال دخل الشهر الماضي",
        shares: shares.map((s) => ({ ...s, name: nameOf(s.memberId) })),
      });
    } catch (error) {
      console.error("Member shares error:", error);
      res.status(500).json({ error: "تعذر حساب حصص الأعضاء" });
    }
  });

  // كشف حساب العضو الكامل: سجل زمني لكل حركة مع رصيد «كم عليه» الجاري بعد كل حركة
  app.get("/api/reports/member-statement/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const memberId = req.params.id as string;
      const filterYear = req.query.year ? Number(req.query.year) : null;

      const member = await storage.getMember(memberId);
      if (!member) {
        return res.status(404).json({ error: "العضو غير موجود" });
      }

      const [contributions, memberLoans, allPayments, settings] = await Promise.all([
        storage.getContributionsByMember(memberId),
        storage.getLoansByMember(memberId),
        storage.getAllLoanPayments(),
        storage.getFamilySettings(),
      ]);

      const approvedLoans = memberLoans.filter((l) => l.status === "approved");
      const loanIds = new Set(approvedLoans.map((l) => l.id));
      const payments = allPayments
        .filter((p) => loanIds.has(p.loanId))
        .sort((a, b) => new Date(a.paidAt ?? 0).getTime() - new Date(b.paidAt ?? 0).getTime());

      // السجل الزمني الكامل بترتيب التاريخ
      type Entry = {
        date: string;
        type: "contribution" | "loan" | "repayment";
        label: string;
        amount: number;
        debtAfter: number;        // كم عليه بعد هذه الحركة
        contributedAfter: number; // كم له (إجمالي مساهماته) بعد هذه الحركة
      };
      const raw: Array<Omit<Entry, "debtAfter" | "contributedAfter">> = [];

      for (const c of contributions) {
        if (c.status !== "approved") continue;
        const date = c.approvedAt ?? c.createdAt ?? new Date(c.year, c.month - 1, 1);
        raw.push({ date: new Date(date).toISOString(), type: "contribution", label: `مساهمة ${c.month}/${c.year}`, amount: Number(c.amount) });
      }
      for (const l of approvedLoans) {
        const date = l.approvedAt ?? l.createdAt ?? new Date();
        raw.push({ date: new Date(date).toISOString(), type: "loan", label: `سلفة: ${l.title}`, amount: Number(l.amount) });
      }
      for (const p of payments) {
        const loan = approvedLoans.find((l) => l.id === p.loanId);
        raw.push({
          date: new Date(p.paidAt ?? new Date()).toISOString(),
          type: "repayment",
          label: `سداد${loan ? ` (${loan.title})` : ""}${p.note ? ` — ${p.note}` : ""}`,
          amount: Number(p.amount),
        });
      }

      raw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let debt = 0;
      let contributed = 0;
      const timeline: Entry[] = raw.map((e) => {
        if (e.type === "loan") debt += e.amount;
        if (e.type === "repayment") debt = Math.max(0, debt - e.amount);
        if (e.type === "contribution") contributed += e.amount;
        return { ...e, debtAfter: Number(debt.toFixed(3)), contributedAfter: Number(contributed.toFixed(3)) };
      });

      // تفاصيل كل سلفة مع دفعات سدادها بتواريخها
      const loansDetail = memberLoans.map((l) => {
        const loanPays = allPayments
          .filter((p) => p.loanId === l.id)
          .sort((a, b) => new Date(a.paidAt ?? 0).getTime() - new Date(b.paidAt ?? 0).getTime());
        const totalPaid = loanPays.reduce((s, p) => s + Number(p.amount), 0);
        const remaining = l.status === "approved" ? Math.max(0, Number(l.amount) - totalPaid) : 0;
        return {
          id: l.id,
          title: l.title,
          type: l.type,
          status: l.status,
          amount: Number(l.amount),
          borrowedAt: l.approvedAt ?? l.createdAt, // متى تسلّف
          totalPaid: Number(totalPaid.toFixed(3)),
          remaining: Number(remaining.toFixed(3)),
          settled: l.status === "approved" && remaining <= 0.0005,
          payments: loanPays.map((p) => ({ date: p.paidAt, amount: Number(p.amount), note: p.note })), // متى سدّد
        };
      });

      const totalBorrowed = approvedLoans.reduce((s, l) => s + Number(l.amount), 0);
      const totalRepaid = payments.reduce((s, p) => s + Number(p.amount), 0);
      const currentDebt = Math.max(0, totalBorrowed - totalRepaid);

      // متأخرات المساهمات بالريال عن آخر 12 شهراً مضت مهلتها
      const rates = await loadRates();
      const expectedMonthly = rates.currentRate(memberId);
      const paidByMonth: Record<string, number> = {};
      for (const c of contributions) {
        if (c.status !== "approved") continue;
        const key = `${c.year}-${c.month}`;
        paidByMonth[key] = (paidByMonth[key] ?? 0) + Number(c.amount);
      }
      const arrears = computeArrears({
        rates: rates.ratesFor(memberId),
        joinedAt: member.createdAt,
        dueMonths: recentDueMonths(new Date(), 12),
        paidByMonth,
      });

      // شبكة المساهمات مجمعة بالسنوات
      const contribYears = new Map<number, Array<{ month: number; amount: number; status: string }>>();
      for (const c of contributions) {
        if (!contribYears.has(c.year)) contribYears.set(c.year, []);
        contribYears.get(c.year)!.push({ month: c.month, amount: Number(c.amount), status: c.status });
      }
      let contributionsByYear = Array.from(contribYears.entries())
        .map(([year, months]) => ({ year, months: months.sort((a, b) => a.month - b.month) }))
        .sort((a, b) => b.year - a.year);

      // مرشح السنة (اختياري) — الأرصدة الجارية تبقى صحيحة لأنها حُسبت على كامل التاريخ
      const filteredTimeline = filterYear
        ? timeline.filter((e) => new Date(e.date).getFullYear() === filterYear)
        : timeline;
      if (filterYear) {
        contributionsByYear = contributionsByYear.filter((y) => y.year === filterYear);
      }

      res.json({
        member: { id: member.id, name: member.name, role: member.role },
        generatedAt: new Date().toISOString(),
        filterYear,
        summary: {
          totalContributed: Number(contributed.toFixed(3)), // كم له
          totalBorrowed: Number(totalBorrowed.toFixed(3)),  // كم تسلّف إجمالاً
          totalRepaid: Number(totalRepaid.toFixed(3)),      // كم سدّد
          currentDebt: Number(currentDebt.toFixed(3)),      // كم عليه الآن بالضبط
        },
        arrears: { expectedMonthly, ...arrears },           // متأخرات المساهمات بالريال
        timeline: filteredTimeline,
        loans: loansDetail,
        contributionsByYear,
      });
    } catch (error) {
      console.error("Member statement error:", error);
      res.status(500).json({ error: "تعذر إعداد كشف الحساب" });
    }
  });

  // بطاقة «يحتاج انتباهك» — تنبيهات تشغيلية للوصي
  app.get("/api/reports/alerts", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const now = new Date();
      const [members, contributions, loans, repayments, auditResult] = await Promise.all([
        storage.getMembers(),
        storage.getContributions(),
        storage.getLoans(),
        storage.getAllLoanRepayments(),
        storage.getAuditLogs(1, 50),
      ]);
      const allocation = await rebalanceYear(now.getFullYear());

      const alerts: Array<{ severity: "high" | "medium" | "info"; title: string; detail: string }> = [];
      const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "عضو";
      const approvedLoanIds = new Set(loans.filter((l) => l.status === "approved").map((l) => l.id));

      // أقساط متأخرة — بعد مرور مهلة يوم 26 من شهر الاستحقاق
      const loanPayments = await storage.getAllLoanPayments();
      const overdue: Array<{ loanId: string }> = [];
      let overdueTotal = 0;
      for (const loan of loans.filter((l) => approvedLoanIds.has(l.id))) {
        const paidOnLoan = loanPayments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + Number(p.amount), 0);
        const own = repayments.filter((r) => r.loanId === loan.id);
        const late = overdueInstallments(own, paidOnLoan, now);
        overdue.push(...late.map(() => ({ loanId: loan.id })));
        overdueTotal += overdueAmount(own, paidOnLoan, now);
      }
      if (overdue.length > 0) {
        const total = overdueTotal;
        const names = Array.from(new Set(overdue.map((r) => {
          const loan = loans.find((l) => l.id === r.loanId);
          return loan ? memberName(loan.memberId) : "عضو";
        })));
        alerts.push({
          severity: "high",
          title: `${overdue.length} قسطاً تجاوز مهلته (${total.toFixed(3)} ر.ع)`,
          detail: `الأعضاء: ${names.join("، ")} — المهلة حتى ${MONTHLY_DUE_DAY} من شهر الاستحقاق`,
        });
      }

      // طلبات سلف معلقة قديمة
      const staleLoans = loans.filter((l) => l.status === "pending" && l.createdAt && (now.getTime() - new Date(l.createdAt).getTime()) > 7 * 24 * 3600 * 1000);
      if (staleLoans.length > 0) {
        alerts.push({
          severity: "medium",
          title: `${staleLoans.length} طلب سلفة معلق منذ أكثر من أسبوع`,
          detail: staleLoans.map((l) => `${memberName(l.memberId)} (${Number(l.amount).toLocaleString()} ر.ع)`).join("، "),
        });
      }

      // متأخرات مساهمات بالريال (إن حُدد اشتراك شهري)
      const settings = await storage.getFamilySettings();
      const rateBook = await loadRates();
      const dueWindow = recentDueMonths(now, 12);
      const arrearsRows = members.map((m) => {
        const paidByMonth: Record<string, number> = {};
        for (const c of contributions) {
          if (c.memberId !== m.id || c.status !== "approved") continue;
          const key = `${c.year}-${c.month}`;
          paidByMonth[key] = (paidByMonth[key] ?? 0) + Number(c.amount);
        }
        return { name: m.name, ...computeArrears({ rates: rateBook.ratesFor(m.id), joinedAt: m.createdAt, dueMonths: dueWindow, paidByMonth }) };
      }).filter((r) => r.arrears > 0);

      if (arrearsRows.length > 0) {
        const total = arrearsRows.reduce((s, r) => s + r.arrears, 0);
        alerts.push({
          severity: "high",
          title: `متأخرات مساهمات بقيمة ${total.toFixed(3)} ر.ع على ${arrearsRows.length} عضواً`,
          detail: arrearsRows
            .sort((a, b) => b.arrears - a.arrears)
            .slice(0, 5)
            .map((r) => `${r.name}: ${r.arrears.toFixed(3)}`)
            .join("، "),
        });
      }

      // أعضاء منقطعون عن المساهمة 3 أشهر — تُحسب من الأشهر التي مضت مهلتها فقط
      const lastThreeDue = recentDueMonths(now, 3);
      const oldestDue = lastThreeDue[lastThreeDue.length - 1];
      const threeMonthsAgo = new Date(oldestDue.year, oldestDue.month - 1, 1);
      const inactive = members.filter((m) => {
        const latest = contributions
          .filter((c) => c.memberId === m.id)
          .map((c) => new Date(c.year, c.month - 1, 1))
          .sort((a, b) => b.getTime() - a.getTime())[0];
        return !latest || latest < threeMonthsAgo;
      });
      if (inactive.length > 0) {
        alerts.push({
          severity: "medium",
          title: `${inactive.length} عضواً بلا مساهمة منذ 3 أشهر أو أكثر`,
          detail: inactive.map((m) => m.name).join("، "),
        });
      }

      // استنفاد طبقات رأس المال
      const usedPercent = allocation.flexible.amount > 0 ? (allocation.flexible.used / allocation.flexible.amount) * 100 : 0;
      const overspent = allocation.flexible.used > allocation.flexible.amount;
      if (allocation.flexible.amount > 0 && usedPercent > 80) {
        alerts.push({
          severity: "high",
          title: overspent
            ? `رأس المال المرن تجاوز المخصص له بـ ${(allocation.flexible.used - allocation.flexible.amount).toFixed(3)} ر.ع`
            : "رأس المال المرن اقترب من الاستنفاد",
          detail: overspent
            ? `المستخدم ${allocation.flexible.used.toFixed(3)} ر.ع من مخصص ${allocation.flexible.amount.toFixed(3)} ر.ع — المخصص محسوب على صافي أصول السنة عند إقفالها، فأعد احتسابه من صفحة توزيع رأس المال إن نما الصندوق منذ ذلك الحين`
            : `المستخدم ${usedPercent.toFixed(0)}٪ — المتاح ${allocation.flexible.available.toFixed(3)} ر.ع فقط`,
        });
      }
      if (allocation.emergency.amount > 0 && allocation.emergency.used / allocation.emergency.amount > 0.5) {
        alerts.push({
          severity: "medium",
          title: "احتياطي الطوارئ استُهلك أكثر من نصفه",
          detail: `المتاح ${allocation.emergency.available.toFixed(3)} ر.ع من أصل ${allocation.emergency.amount.toFixed(3)}`,
        });
      }

      // وجوب الزكاة — دورة اكتمل حولها ولم تُخرج زكاتها بعد
      const openCycle = await storage.getOpenZakatCycle();
      if (openCycle && isHawlComplete(openCycle.cycleStart, now)) {
        const nisab = Number(settings?.zakatNisab ?? 0);
        const zakat = computeZakat(allocation.netAssets, nisab);
        alerts.push({
          severity: "high",
          title: zakat.reachesNisab
            ? `وجبت زكاة الصندوق: ${zakat.amount.toFixed(3)} ر.ع`
            : "اكتمل حول الزكاة",
          detail: nisab <= 0
            ? "حدّد قيمة النصاب في الإعدادات ليحسب النظام الزكاة الواجبة"
            : zakat.reachesNisab
              ? `2.5٪ من صافي أصول ${zakat.netAssets.toFixed(3)} ر.ع — النصاب ${zakat.nisab.toFixed(3)} ر.ع`
              : `صافي الأصول (${zakat.netAssets.toFixed(3)} ر.ع) دون النصاب (${zakat.nisab.toFixed(3)} ر.ع) — لا زكاة`,
        });
      }

      // أخطاء نظام حديثة (آخر 7 أيام)
      const weekAgo = now.getTime() - 7 * 24 * 3600 * 1000;
      const systemErrors = auditResult.data.filter((l) => l.action === "system_error" && new Date(l.createdAt).getTime() > weekAgo);
      if (systemErrors.length > 0) {
        alerts.push({
          severity: "high",
          title: `${systemErrors.length} خطأ نظام خلال الأسبوع الأخير`,
          detail: systemErrors[0].description,
        });
      }

      res.json(alerts);
    } catch (error) {
      console.error("Alerts error:", error);
      res.status(500).json({ error: "تعذر تحميل التنبيهات" });
    }
  });

  app.get("/api/reports/monthly", isAuthenticated, async (req, res) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      
      const [contributions, yearLoans, yearExpenses] = await Promise.all([
        storage.getContributionsByYearAndMonth(year, month),
        storage.getLoansByYear(year),
        storage.getExpensesByYear(year)
      ]);
      
      const monthlyContributions = contributions.filter(c => c.status === 'approved');
      const monthlyLoans = yearLoans.filter(l => {
        const d = l.approvedAt || l.createdAt;
        return l.status === 'approved' && d && d.getMonth() + 1 === month;
      });
      const monthlyExpenses = yearExpenses.filter(e => {
        const d = e.createdAt;
        return d && d.getMonth() + 1 === month;
      });
      
      const totalContributions = monthlyContributions.reduce((sum, c) => sum + Number(c.amount), 0);
      const totalLoans = monthlyLoans.reduce((sum, l) => sum + Number(l.amount), 0);
      const totalExpenses = monthlyExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const activeMembers = new Set(monthlyContributions.map(c => c.memberId)).size;
      
      res.json({
        year,
        month,
        totalContributions,
        totalLoans,
        totalExpenses,
        activeMembers,
        netFlow: totalContributions - totalLoans - totalExpenses,
        contributionCount: monthlyContributions.length,
        loanCount: monthlyLoans.length,
        expenseCount: monthlyExpenses.length
      });
    } catch (error) {
      console.error("Monthly report error:", error);
      res.status(500).json({ error: "Failed to fetch monthly report" });
    }
  });

  app.get("/api/reports/yearly", isAuthenticated, async (req, res) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      
      const [yearContributions, allYearLoans, yearExpenses] = await Promise.all([
        storage.getApprovedContributionsByYear(year),
        storage.getLoansByYear(year),
        storage.getExpensesByYear(year)
      ]);
      
      const yearLoans = allYearLoans.filter(l => l.status === 'approved');
      
      // Monthly breakdown
      const monthlyData = [];
      for (let m = 1; m <= 12; m++) {
        const monthContributions = yearContributions.filter(c => c.month === m);
        const monthLoans = yearLoans.filter(l => {
          const d = l.approvedAt || l.createdAt;
          return d && d.getMonth() + 1 === m;
        });
        const monthExpenses = yearExpenses.filter(e => {
          const d = e.createdAt;
          return d && d.getMonth() + 1 === m;
        });
        
        monthlyData.push({
          month: m,
          monthName: new Date(year, m - 1).toLocaleString('ar-OM', { month: 'short' }),
          contributions: monthContributions.reduce((sum, c) => sum + Number(c.amount), 0),
          loans: monthLoans.reduce((sum, l) => sum + Number(l.amount), 0),
          expenses: monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0),
          contributionCount: monthContributions.length,
          loanCount: monthLoans.length,
          expenseCount: monthExpenses.length
        });
      }
      
      res.json({
        year,
        summary: {
          totalContributions: yearContributions.reduce((sum, c) => sum + Number(c.amount), 0),
          totalLoans: yearLoans.reduce((sum, l) => sum + Number(l.amount), 0),
          totalExpenses: yearExpenses.reduce((sum, e) => sum + Number(e.amount), 0),
          contributionCount: yearContributions.length,
          loanCount: yearLoans.length,
          expenseCount: yearExpenses.length
        },
        monthlyData
      });
    } catch (error) {
      console.error("Yearly report error:", error);
      res.status(500).json({ error: "Failed to fetch yearly report" });
    }
  });

  app.get("/api/reports/members-performance", isAuthenticated, async (req, res) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

      const [members, yearContributions, allYearLoans, allContributions, summary] = await Promise.all([
        storage.getMembers(),
        storage.getApprovedContributionsByYear(year),
        storage.getLoansByYear(year),
        storage.getContributions(),
        computeDashboardSummary(),
      ]);

      const yearLoans = allYearLoans.filter(l => l.status === 'approved');
      // نسبة الالتزام تُقاس على الأشهر التي مضت مهلتها فقط (لا على 12 شهراً كاملة في سنة جارية)
      const expectedMonths = Math.max(1, dueMonthsInYear(year, new Date()));

      // الحصة الحقيقية من الصندوق: مرجّحة بالزمن على كل تاريخ العضو، لا «مساهمات السنة − سلف السنة»
      const shares = computeMemberShares(
        allContributions
          .filter(c => c.status === "approved")
          .map(c => ({
            memberId: c.memberId,
            amount: Number(c.amount),
            at: c.approvedAt ?? c.createdAt ?? new Date(c.year, c.month - 1, 1),
          })),
        summary.netCapital,
      );
      const shareOf = (id: string) => shares.find(s => s.memberId === id);

      const allMemberStats = members.map(m => {
        const memberContributions = yearContributions.filter(c => c.memberId === m.id);
        const memberLoans = yearLoans.filter(l => l.memberId === m.id);
        
        const totalContributions = memberContributions.reduce((sum, c) => sum + Number(c.amount), 0);
        const totalLoans = memberLoans.reduce((sum, l) => sum + Number(l.amount), 0);
        const contributionMonths = new Set(memberContributions.map(c => c.month)).size;
        
        return {
          memberId: m.id,
          name: m.name,
          role: m.role,
          totalContributions,
          totalLoans,
          contributionCount: memberContributions.length,
          loanCount: memberLoans.length,
          contributionMonths,
          attendanceRate: Math.min(100, Math.round((contributionMonths / expectedMonths) * 100)),
          sharePercent: shareOf(m.id)?.percent ?? 0,
          shareValue: shareOf(m.id)?.value ?? 0,
        };
      }).sort((a, b) => b.totalContributions - a.totalContributions);

      const total = allMemberStats.length;
      const memberStats = allMemberStats.slice((page - 1) * limit, page * limit);

      res.json({
        year,
        members: memberStats,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        totals: {
          contributions: yearContributions.reduce((sum, c) => sum + Number(c.amount), 0),
          loans: yearLoans.reduce((sum, l) => sum + Number(l.amount), 0),
          activeMembers: allMemberStats.filter(m => m.contributionCount > 0).length
        }
      });
    } catch (error) {
      console.error("Members performance error:", error);
      res.status(500).json({ error: "Failed to fetch members performance" });
    }
  });

  app.get("/api/reports/loans-analysis", isAuthenticated, async (req, res) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      
      const [allYearLoans, members, payments] = await Promise.all([
        storage.getLoansByYear(year),
        storage.getMembers(),
        storage.getAllLoanPayments()
      ]);
      
      const yearLoans = allYearLoans.filter(l => l.status === 'approved');
      
      // Analysis by type
      const byType = {
        urgent: { count: 0, total: 0, avgAmount: 0 },
        standard: { count: 0, total: 0, avgAmount: 0 },
        emergency: { count: 0, total: 0, avgAmount: 0 }
      };
      
      yearLoans.forEach(loan => {
        const type = loan.type as keyof typeof byType;
        if (byType[type]) {
          byType[type].count++;
          byType[type].total += Number(loan.amount);
        }
      });
      
      Object.keys(byType).forEach(key => {
        const k = key as keyof typeof byType;
        byType[k].avgAmount = byType[k].count > 0 ? byType[k].total / byType[k].count : 0;
      });
      
      // Repayment analysis
      let totalPaid = 0;
      let totalAmount = 0;
      
      for (const loan of yearLoans) {
        const loanPayments = payments.filter(p => p.loanId === loan.id);
        totalPaid += loanPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        totalAmount += Number(loan.amount);
      }
      
      res.json({
        year,
        summary: {
          totalLoans: yearLoans.length,
          totalAmount: yearLoans.reduce((sum, l) => sum + Number(l.amount), 0),
          avgLoanAmount: yearLoans.length > 0 ? yearLoans.reduce((sum, l) => sum + Number(l.amount), 0) / yearLoans.length : 0,
          repaymentRate: totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0,
          totalPaid,
          totalRemaining: totalAmount - totalPaid
        },
        byType,
        recentLoans: yearLoans.slice(0, 10).map(l => ({
          id: l.id,
          memberName: members.find(m => m.id === l.memberId)?.name || 'غير معروف',
          type: l.type,
          amount: Number(l.amount),
          createdAt: l.createdAt,
          status: l.status
        }))
      });
    } catch (error) {
      console.error("Loans analysis error:", error);
      res.status(500).json({ error: "Failed to fetch loans analysis" });
    }
  });

  app.get("/api/reports/member/:id", isAuthenticated, async (req, res) => {
    try {
      const memberId = req.params.id as string;
      const year = Number(req.query.year) || new Date().getFullYear();

      const [member, allContributions, memberLoans, allPayments] = await Promise.all([
        storage.getMember(memberId),
        storage.getContributionsByMember(memberId),
        storage.getLoansByMember(memberId),
        storage.getAllLoanPayments()
      ]);

      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      // الشهر لا يُحسب غائباً قبل مرور مهلته (يوم 26)
      const maxMonth = dueMonthsInYear(year, new Date());

      // Monthly contributions grid for selected year
      const contributionsGrid = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const contribution = allContributions.find(c => c.year === year && c.month === m);
        let status: string;
        if (contribution) {
          status = contribution.status;
        } else if (m <= maxMonth) {
          status = 'missing';
        } else {
          status = 'upcoming';
        }
        return {
          month: m,
          monthName: new Date(year, m - 1).toLocaleString('ar-OM', { month: 'long' }),
          status,
          amount: contribution ? Number(contribution.amount) : 0,
          paidAt: contribution?.approvedAt || contribution?.createdAt || null,
          contributionId: contribution?.id || null
        };
      });

      // Loans with payment details
      const loansWithPayments = memberLoans.map(loan => {
        const payments = allPayments.filter(p => p.loanId === loan.id);
        const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const remaining = Math.max(0, Number(loan.amount) - totalPaid);
        return {
          id: loan.id,
          title: loan.title,
          type: loan.type,
          amount: Number(loan.amount),
          status: loan.status,
          repaymentType: loan.repaymentType,
          repaymentMonths: loan.repaymentMonths,
          totalPaid,
          remaining,
          createdAt: loan.createdAt,
          approvedAt: loan.approvedAt,
          description: loan.description
        };
      });

      // Summary aggregates (all-time)
      const approvedContributions = allContributions.filter(c => c.status === 'approved');
      const approvedLoans = memberLoans.filter(l => l.status === 'approved');
      const totalContributions = approvedContributions.reduce((sum, c) => sum + Number(c.amount), 0);
      const totalLoaned = approvedLoans.reduce((sum, l) => sum + Number(l.amount), 0);
      const approvedLoansPayments = loansWithPayments.filter(l => l.status === 'approved');
      const totalLoanPaid = approvedLoansPayments.reduce((sum, l) => sum + l.totalPaid, 0);
      const totalLoanRemaining = approvedLoansPayments.reduce((sum, l) => sum + l.remaining, 0);

      // Performance for selected year
      const yearPaidContributions = allContributions.filter(c => c.year === year && c.status === 'approved');
      const paidMonths = yearPaidContributions.length;
      const expectedMonths = maxMonth;
      // لا شهر مستحق بعد في هذه السنة ⇒ لا تأخير على أحد (100٪)
      const commitmentRate = expectedMonths > 0
        ? Math.min(100, Math.round((paidMonths / expectedMonths) * 100))
        : 100;
      let rating = 'متأخر';
      if (commitmentRate >= 90) rating = 'ممتاز';
      else if (commitmentRate >= 70) rating = 'جيد';

      res.json({
        member: { id: member.id, name: member.name, role: member.role, avatar: member.avatar },
        year,
        summary: {
          totalContributions,
          totalLoaned,
          totalLoanPaid,
          totalLoanRemaining,
          contributionCount: approvedContributions.length,
          loanCount: approvedLoans.length,
          pendingCount: allContributions.filter(c => c.status === 'pending_approval').length,
        },
        performance: {
          paidMonths,
          expectedMonths,
          commitmentRate,
          rating
        },
        contributionsGrid,
        loans: loansWithPayments
      });
    } catch (error) {
      console.error("Member report error:", error);
      res.status(500).json({ error: "Failed to fetch member report" });
    }
  });

  app.get("/api/reports/chart-data", isAuthenticated, async (req, res) => {
    try {
      const type = req.query.type as string || 'overview';
      const period = req.query.period as string || '6months';
      const chartYear = Number(req.query.year) || new Date().getFullYear();
      
      const [contributions, loans, expenses, members] = await Promise.all([
        storage.getContributions(),
        storage.getLoans(),
        storage.getExpenses(),
        storage.getMembers()
      ]);
      
      let data: any = {};
      
      switch (type) {
        case 'capital-distribution': {
          const summary = await computeDashboardSummary();
          data = summary.layers.map((l: any) => ({
            name: l.name,
            value: l.amount || 0,
            percentage: l.percentage,
            color: l.id === 'protected' ? '#3b82f6' :
                   l.id === 'emergency' ? '#f59e0b' :
                   l.id === 'flexible' ? '#10b981' :
                   l.id === 'growth' ? '#6366f1' : '#6b7280'
          }));
          break;
        }
        
        case 'contributions-trend': {
          const months = period === '12months' ? 12 : period === '3months' ? 3 : 6;
          const now = new Date();
          const trend = [];
          
          for (let i = months - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthContributions = contributions.filter(c => 
              c.status === 'approved' && c.year === d.getFullYear() && c.month === d.getMonth() + 1
            );
            
            trend.push({
              month: d.toLocaleString('ar-OM', { month: 'short' }),
              year: d.getFullYear(),
              amount: monthContributions.reduce((sum, c) => sum + Number(c.amount), 0),
              count: monthContributions.length
            });
          }
          data = trend;
          break;
        }
        
        case 'members-comparison': {
          const yearContributions = contributions.filter(c => 
            c.status === 'approved' && c.year === chartYear
          );
          
          data = members.map(m => {
            const memberContributions = yearContributions.filter(c => c.memberId === m.id);
            return {
              name: m.name,
              amount: memberContributions.reduce((sum, c) => sum + Number(c.amount), 0),
              count: memberContributions.length
            };
          }).sort((a, b) => b.amount - a.amount).slice(0, 10);
          break;
        }
        
        case 'expenses-categories': {
          const yearExpenses = expenses.filter(e => 
            e.createdAt?.getFullYear() === chartYear
          );
          
          const categories = ['zakat', 'charity', 'general', 'emergency'];
          const labels: Record<string, string> = {
            zakat: 'الزكاة',
            charity: 'الصدقة',
            general: 'عام',
            emergency: 'طوارئ'
          };
          
          data = categories.map(cat => ({
            name: labels[cat] || cat,
            value: yearExpenses.filter(e => e.category === cat).reduce((sum, e) => sum + Number(e.amount), 0),
            color: cat === 'zakat' ? '#8b5cf6' :
                   cat === 'charity' ? '#ec4899' :
                   cat === 'emergency' ? '#ef4444' : '#6b7280'
          })).filter(d => d.value > 0);
          break;
        }
        
        default: {
          data = { error: 'Invalid chart type' };
        }
      }
      
      res.json({ type, period, data });
    } catch (error) {
      console.error("Chart data error:", error);
      res.status(500).json({ error: "Failed to fetch chart data" });
    }
  });
}
