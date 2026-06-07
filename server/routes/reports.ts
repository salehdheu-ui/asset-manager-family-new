import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { computeDashboardSummary } from "../services/dashboard";

export function registerReportRoutes(app: Express) {
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
      
      const [members, yearContributions, allYearLoans] = await Promise.all([
        storage.getMembers(),
        storage.getApprovedContributionsByYear(year),
        storage.getLoansByYear(year)
      ]);
      
      const yearLoans = allYearLoans.filter(l => l.status === 'approved');
      
      const memberStats = members.map(m => {
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
      
      res.json({
        year,
        members: memberStats,
        totals: {
          contributions: yearContributions.reduce((sum, c) => sum + Number(c.amount), 0),
          loans: yearLoans.reduce((sum, l) => sum + Number(l.amount), 0),
          activeMembers: memberStats.filter(m => m.contributionCount > 0).length
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
      const memberId = req.params.id;
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
