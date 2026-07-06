import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated, isAdmin } from "../auth";
import { computeDashboardSummary } from "../services/dashboard";
import { computeCommitmentScore, projectCashflow } from "@shared/finance";
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
      const windowMonths = 12;
      const windowStart = new Date(now.getFullYear(), now.getMonth() - (windowMonths - 1), 1);

      const scores = members.map((member) => {
        const memberContribs = contributions.filter(
          (c) => c.memberId === member.id && c.status === "approved" &&
            new Date(c.year, c.month - 1, 1) >= windowStart,
        );
        const contributedMonths = new Set(memberContribs.map((c) => `${c.year}-${c.month}`)).size;

        const memberLoans = loans.filter((l) => l.memberId === member.id && l.status === "approved");
        const loanIds = new Set(memberLoans.map((l) => l.id));
        const totalBorrowed = memberLoans.reduce((s, l) => s + Number(l.amount), 0);
        const totalRepaid = payments.filter((p) => loanIds.has(p.loanId)).reduce((s, p) => s + Number(p.amount), 0);
        const overdueInstallments = repayments.filter(
          (r) => loanIds.has(r.loanId) && r.status === "scheduled" && r.dueDate && new Date(r.dueDate) < now,
        ).length;

        return {
          memberId: member.id,
          name: member.name,
          score: computeCommitmentScore({ monthsConsidered: windowMonths, contributedMonths, totalBorrowed, totalRepaid, overdueInstallments }),
          contributedMonths,
          windowMonths,
          totalBorrowed: Number(totalBorrowed.toFixed(3)),
          totalRepaid: Number(totalRepaid.toFixed(3)),
          overdueInstallments,
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

      // أقساط متأخرة
      const overdue = repayments.filter((r) => approvedLoanIds.has(r.loanId) && r.status === "scheduled" && r.dueDate && new Date(r.dueDate) < now);
      if (overdue.length > 0) {
        const total = overdue.reduce((s, r) => s + Number(r.amount), 0);
        const names = Array.from(new Set(overdue.map((r) => {
          const loan = loans.find((l) => l.id === r.loanId);
          return loan ? memberName(loan.memberId) : "عضو";
        })));
        alerts.push({
          severity: "high",
          title: `${overdue.length} قسطاً تجاوز استحقاقه (${total.toFixed(3)} ر.ع)`,
          detail: `الأعضاء: ${names.join("، ")}`,
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

      // أعضاء منقطعون عن المساهمة 3 أشهر
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
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
      if (allocation.flexible.amount > 0 && allocation.flexible.used / allocation.flexible.amount > 0.8) {
        alerts.push({
          severity: "high",
          title: "رأس المال المرن اقترب من الاستنفاد",
          detail: `المستخدم ${((allocation.flexible.used / allocation.flexible.amount) * 100).toFixed(0)}٪ — المتاح ${allocation.flexible.available.toFixed(3)} ر.ع فقط`,
        });
      }
      if (allocation.emergency.amount > 0 && allocation.emergency.used / allocation.emergency.amount > 0.5) {
        alerts.push({
          severity: "medium",
          title: "احتياطي الطوارئ استُهلك أكثر من نصفه",
          detail: `المتاح ${allocation.emergency.available.toFixed(3)} ر.ع من أصل ${allocation.emergency.amount.toFixed(3)}`,
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

      const [members, yearContributions, allYearLoans] = await Promise.all([
        storage.getMembers(),
        storage.getApprovedContributionsByYear(year),
        storage.getLoansByYear(year)
      ]);
      
      const yearLoans = allYearLoans.filter(l => l.status === 'approved');
      
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
          attendanceRate: Math.round((contributionMonths / 12) * 100),
          netBalance: totalContributions - totalLoans
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

      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const maxMonth = year === currentYear ? currentMonth : 12;

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
      const commitmentRate = expectedMonths > 0 ? Math.round((paidMonths / expectedMonths) * 100) : 0;
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
