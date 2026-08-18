import { describe, expect, it } from "vitest";
import {
  availableInLayer,
  computeLayerUsage,
  isWithinYear,
  layerView,
  buildRepaymentSchedule,
  computeArrears,
  computeCommitmentScore,
  computeInvestmentReturn,
  computeMemberShares,
  computeNetAssets,
  computeZakat,
  rateForMonth,
  overdueInstallments,
  overdueAmount,
  upcomingInstallments,
  nextMonthOf,
  daysUntilHawl,
  dueMonthsInYear,
  isHawlComplete,
  isInstallmentLate,
  isMonthDue,
  projectCashflow,
  recentDueMonths,
  splitAllocation,
} from "./finance";

describe("buildRepaymentSchedule", () => {
  const baseLoan = {
    id: "loan-1",
    repaymentType: "scheduled",
    approvedAt: new Date(2026, 0, 15),
    createdAt: new Date(2026, 0, 10),
  };

  it("مجموع الأقساط يساوي مبلغ السلفة تماماً حتى مع كسور القسمة", () => {
    const schedule = buildRepaymentSchedule({ ...baseLoan, amount: "100", repaymentMonths: 3 });
    const total = schedule.reduce((sum, r) => sum + Number(r.amount), 0);
    expect(schedule.map((r) => r.amount)).toEqual(["33.333", "33.333", "33.334"]);
    expect(total).toBeCloseTo(100, 9);
  });

  it("يطابق المجموع لمبالغ وأشهر متنوعة", () => {
    for (const [amount, months] of [[1000, 7], [250.5, 12], [77.777, 5], [1, 3]] as const) {
      const schedule = buildRepaymentSchedule({ ...baseLoan, amount, repaymentMonths: months });
      const total = schedule.reduce((sum, r) => sum + Number(r.amount), 0);
      expect(total).toBeCloseTo(amount, 9);
      expect(schedule).toHaveLength(months);
    }
  });

  it("يرقّم الأقساط تسلسلياً ويستحقها شهرياً بدءاً من الشهر التالي للاعتماد", () => {
    const schedule = buildRepaymentSchedule({ ...baseLoan, amount: "300", repaymentMonths: 3 });
    expect(schedule.map((r) => r.installmentNumber)).toEqual([1, 2, 3]);
    expect(schedule[0].dueDate.getMonth()).toBe(1); // فبراير
    expect(schedule[2].dueDate.getMonth()).toBe(3); // أبريل
    expect(schedule.every((r) => r.status === "scheduled")).toBe(true);
  });

  it("يرجع جدولاً فارغاً للسداد المفتوح أو عدد أشهر غير صالح", () => {
    expect(buildRepaymentSchedule({ ...baseLoan, amount: "100", repaymentType: "open", repaymentMonths: 3 })).toEqual([]);
    expect(buildRepaymentSchedule({ ...baseLoan, amount: "100", repaymentMonths: 0 })).toEqual([]);
    expect(buildRepaymentSchedule({ ...baseLoan, amount: "100", repaymentMonths: null })).toEqual([]);
  });

  it("يستخدم تاريخ الإنشاء عند غياب تاريخ الاعتماد", () => {
    const schedule = buildRepaymentSchedule({
      ...baseLoan,
      approvedAt: null,
      amount: "60",
      repaymentMonths: 2,
    });
    expect(schedule[0].dueDate.getMonth()).toBe(1); // فبراير (الإنشاء في يناير)
  });
});

describe("computeNetAssets", () => {
  it("يجمع الإيداعات والمساهمات والسداد ويطرح السلف والمصروفات والسحوبات", () => {
    expect(
      computeNetAssets({ contributions: 1000, deposits: 200, withdrawals: 50, loans: 300, repayments: 100, expenses: 150 }),
    ).toBe(800);
  });

  it("لا يهبط تحت الصفر", () => {
    expect(
      computeNetAssets({ contributions: 100, deposits: 0, withdrawals: 0, loans: 500, repayments: 0, expenses: 0 }),
    ).toBe(0);
  });
});

describe("splitAllocation", () => {
  it("يوزع صافي الأصول على الطبقات الأربع حسب النسب", () => {
    const split = splitAllocation(1000, { protected: 45, emergency: 15, flexible: 20, growth: 20 });
    expect(split).toEqual({ protected: 450, emergency: 150, flexible: 200, growth: 200 });
    expect(split.protected + split.emergency + split.flexible + split.growth).toBe(1000);
  });
});

describe("availableInLayer", () => {
  it("يحسب المتاح ولا يسمح بقيمة سالبة عند تجاوز الاستخدام", () => {
    expect(availableInLayer(200, 80)).toBe(120);
    expect(availableInLayer(200, 250)).toBe(0);
  });
});

describe("computeLayerUsage", () => {
  const base = { approvedLoans: 0, loanRepayments: 0, generalExpenses: 0, emergencyExpenses: 0, activeInvestments: 0 };

  it("السلف والمصروف العام يستهلكان الطبقة المرنة", () => {
    const used = computeLayerUsage({ ...base, approvedLoans: 500, generalExpenses: 120 });
    expect(used.flexibleUsed).toBe(620);
  });

  it("السداد يعيد المال إلى الطبقة المرنة", () => {
    const used = computeLayerUsage({ ...base, approvedLoans: 500, loanRepayments: 200 });
    expect(used.flexibleUsed).toBe(300);
  });

  it("سداد يفوق ما أُقرض لا يجعل المستهلَك سالباً", () => {
    const used = computeLayerUsage({ ...base, approvedLoans: 100, loanRepayments: 400 });
    expect(used.flexibleUsed).toBe(0);
  });

  it("مصروف الطوارئ يُخصم من طبقته لا من المرنة", () => {
    const used = computeLayerUsage({ ...base, emergencyExpenses: 300, generalExpenses: 50 });
    expect(used.emergencyUsed).toBe(300);
    expect(used.flexibleUsed).toBe(50);
  });

  it("الاستثمار القائم يستهلك طبقة النمو وحدها", () => {
    const used = computeLayerUsage({ ...base, activeInvestments: 900 });
    expect(used).toEqual({ flexibleUsed: 0, growthUsed: 900, emergencyUsed: 0 });
  });
});

describe("layerView", () => {
  it("يجمع المخصَّص والمستهلَك والمتاح", () => {
    expect(layerView(1000, 20, 250)).toEqual({ amount: 1000, percent: 20, used: 250, available: 750 });
  });

  it("لا يعرض متاحاً سالباً عند تجاوز المخصَّص", () => {
    expect(layerView(1000, 20, 1400).available).toBe(0);
  });
});

describe("isWithinYear", () => {
  it("يقبل أول لحظة في السنة ويرفض أول لحظة في التي تليها", () => {
    expect(isWithinYear(new Date(2026, 0, 1), 2026)).toBe(true);
    expect(isWithinYear(new Date(2026, 11, 31), 2026)).toBe(true);
    expect(isWithinYear(new Date(2027, 0, 1), 2026)).toBe(false);
    expect(isWithinYear(new Date(2025, 11, 31), 2026)).toBe(false);
  });

  it("التاريخ الغائب لا ينتمي لأي سنة", () => {
    expect(isWithinYear(null, 2026)).toBe(false);
    expect(isWithinYear(undefined, 2026)).toBe(false);
  });
});

describe("upcomingInstallments", () => {
  const now = new Date(2026, 4, 24);   // 24 مايو — قبل مهلة 26 بيومين
  const inst = (n: number, month: number, status = "scheduled") => ({
    id: `r${n}`, installmentNumber: n, amount: "50", dueDate: new Date(2026, month, 1), status,
  });

  it("يذكّر بقسط اقتربت مهلته ولم تمض", () => {
    const soon = upcomingInstallments([inst(1, 4)], 0, 3, now);
    expect(soon.map((i) => i.id)).toEqual(["r1"]);
  });

  it("لا يذكّر بقسط مضت مهلته — ذاك شأن التنبيه المتأخر", () => {
    expect(upcomingInstallments([inst(1, 3)], 0, 3, now)).toHaveLength(0);
  });

  it("لا يذكّر بقسط بعيد عن النافذة", () => {
    expect(upcomingInstallments([inst(1, 7)], 0, 3, now)).toHaveLength(0);
  });

  it("لا يذكّر بقسط مُعلَّم مدفوعاً", () => {
    expect(upcomingInstallments([inst(1, 4, "paid")], 0, 3, now)).toHaveLength(0);
  });

  it("لا يذكّر بقسط غطّاه سداد حر على السلفة", () => {
    expect(upcomingInstallments([inst(1, 4)], 50, 3, now)).toHaveLength(0);
  });

  it("يذكّر بالتالي حين يغطي السداد الأول وحده", () => {
    const soon = upcomingInstallments([inst(1, 3), inst(2, 4)], 50, 3, now);
    expect(soon.map((i) => i.id)).toEqual(["r2"]);
  });
});

describe("computeCommitmentScore", () => {
  it("عضو مثالي: مساهمات كاملة وسداد كامل = 100", () => {
    expect(computeCommitmentScore({ monthsConsidered: 12, contributedMonths: 12, totalBorrowed: 500, totalRepaid: 500, overdueInstallments: 0 })).toBe(100);
  });

  it("من لا سلف عليه لا يُعاقب على جزء السداد", () => {
    expect(computeCommitmentScore({ monthsConsidered: 12, contributedMonths: 6, totalBorrowed: 0, totalRepaid: 0, overdueInstallments: 0 })).toBe(70); // 30 + 40
  });

  it("الأقساط المتأخرة تخصم من درجة السداد", () => {
    const clean = computeCommitmentScore({ monthsConsidered: 12, contributedMonths: 12, totalBorrowed: 100, totalRepaid: 100, overdueInstallments: 0 });
    const late = computeCommitmentScore({ monthsConsidered: 12, contributedMonths: 12, totalBorrowed: 100, totalRepaid: 100, overdueInstallments: 2 });
    expect(clean - late).toBe(4); // خصم 0.10 × 40
  });

  it("الدرجة محصورة بين 0 و100", () => {
    expect(computeCommitmentScore({ monthsConsidered: 12, contributedMonths: 0, totalBorrowed: 100, totalRepaid: 0, overdueInstallments: 20 })).toBe(0);
  });
});

describe("مهلة يوم 26 من الشهر", () => {
  it("الشهر غير مستحق يوم 26 نفسه، ويصبح مستحقاً في 27", () => {
    expect(isMonthDue(2026, 8, new Date(2026, 7, 26, 23, 0))).toBe(false);
    expect(isMonthDue(2026, 8, new Date(2026, 7, 27, 0, 30))).toBe(true);
  });

  it("الشهر الجاري لا يُحتسب في أشهر السنة المستحقة قبل مرور مهلته", () => {
    expect(dueMonthsInYear(2026, new Date(2026, 7, 10))).toBe(7);  // أغسطس لم يستحق بعد
    expect(dueMonthsInYear(2026, new Date(2026, 7, 27))).toBe(8);  // أغسطس استحق
    expect(dueMonthsInYear(2025, new Date(2026, 7, 10))).toBe(12); // سنة ماضية
    expect(dueMonthsInYear(2027, new Date(2026, 7, 10))).toBe(0);  // سنة قادمة
  });

  it("نافذة الأشهر المستحقة تتراجع شهراً كاملاً قبل يوم 26", () => {
    const before = recentDueMonths(new Date(2026, 7, 10), 3);
    expect(before[0]).toEqual({ year: 2026, month: 7 });
    const after = recentDueMonths(new Date(2026, 7, 27), 3);
    expect(after[0]).toEqual({ year: 2026, month: 8 });
    expect(after).toHaveLength(3);
  });

  it("نافذة الأشهر تعبر رأس السنة بشكل صحيح", () => {
    const months = recentDueMonths(new Date(2026, 0, 10), 2); // يناير قبل المهلة
    expect(months).toEqual([{ year: 2025, month: 12 }, { year: 2025, month: 11 }]);
  });

  it("القسط لا يُعد متأخراً قبل مرور مهلة شهره", () => {
    const due = new Date(2026, 7, 5); // مستحق 5 أغسطس
    expect(isInstallmentLate(due, new Date(2026, 7, 20))).toBe(false); // قبل 26
    expect(isInstallmentLate(due, new Date(2026, 7, 27))).toBe(true);  // بعد 26
  });

  it("القسط المستحق بعد يوم 26 يُحسب من تاريخه هو", () => {
    const due = new Date(2026, 7, 28); // مستحق 28 أغسطس
    expect(isInstallmentLate(due, new Date(2026, 7, 27))).toBe(false);
    expect(isInstallmentLate(due, new Date(2026, 7, 29))).toBe(true);
  });
});

describe("computeArrears", () => {
  const dueMonths = [
    { year: 2026, month: 5 },
    { year: 2026, month: 6 },
    { year: 2026, month: 7 },
  ];

  it("يحسب المتأخر بالريال لا بعدد الأشهر", () => {
    const r = computeArrears({ expectedMonthly: 50, dueMonths, paidByMonth: { "2026-5": 50, "2026-6": 20 } });
    expect(r.expectedTotal).toBe(150);
    expect(r.paidTotal).toBe(70);
    expect(r.arrears).toBe(80);       // 30 نقص يونيو + 50 يوليو كاملاً
    expect(r.missedMonths).toBe(1);
    expect(r.partialMonths).toBe(1);
  });

  it("الدفع الزائد في شهر لا يغطي شهراً آخر", () => {
    const r = computeArrears({ expectedMonthly: 50, dueMonths, paidByMonth: { "2026-5": 500 } });
    expect(r.arrears).toBe(100); // يونيو ويوليو ما زالا مستحقين
  });

  it("الملتزم بالكامل لا متأخرات عليه", () => {
    const r = computeArrears({ expectedMonthly: 50, dueMonths, paidByMonth: { "2026-5": 50, "2026-6": 50, "2026-7": 50 } });
    expect(r.arrears).toBe(0);
    expect(r.missedMonths).toBe(0);
  });

  it("بلا اشتراك محدد لا يُحسب تأخر", () => {
    expect(computeArrears({ expectedMonthly: 0, dueMonths, paidByMonth: {} }).arrears).toBe(0);
  });
});

describe("computeMemberShares", () => {
  const now = new Date(2026, 7, 1);

  it("الحصة مرجّحة بالزمن: الأقدم أثقل عند تساوي المبلغ", () => {
    const shares = computeMemberShares([
      { memberId: "a", amount: 100, at: new Date(2025, 7, 1) }, // سنة كاملة
      { memberId: "b", amount: 100, at: new Date(2026, 6, 1) }, // شهر واحد
    ], 1000, now);
    expect(shares[0].memberId).toBe("a");
    expect(shares[0].percent).toBeGreaterThan(shares[1].percent);
    expect(shares[0].percent + shares[1].percent).toBeCloseTo(100, 1);
  });

  it("قيمة الحصة تعادل نسبتها من صافي الأصول", () => {
    const shares = computeMemberShares([
      { memberId: "a", amount: 100, at: new Date(2025, 7, 1) },
      { memberId: "b", amount: 100, at: new Date(2025, 7, 1) },
    ], 2000, now);
    expect(shares[0].percent).toBeCloseTo(50, 1);
    expect(shares[0].value).toBeCloseTo(1000, 0);
  });

  it("عند تساوي التواريخ تماماً تُوزع بنسبة المبالغ", () => {
    const at = new Date(2026, 7, 1);
    const shares = computeMemberShares([
      { memberId: "a", amount: 300, at },
      { memberId: "b", amount: 100, at },
    ], 400, at);
    expect(shares[0].percent).toBe(75);
    expect(shares[0].value).toBe(300);
  });
});

describe("projectCashflow", () => {
  it("يراكم الرصيد شهراً بشهر من المساهمات والأقساط المجدولة", () => {
    const result = projectCashflow({
      startBalance: 1000,
      avgMonthlyContributions: 100,
      scheduledByMonth: { "2026-08": 50 },
      months: ["2026-07", "2026-08"],
    });
    expect(result[0].projectedBalance).toBe(1100);
    expect(result[1].projectedBalance).toBe(1250);
    expect(result[1].scheduledRepayments).toBe(50);
  });
});

describe("الزكاة", () => {
  it("لا زكاة على مال دون النصاب", () => {
    const r = computeZakat(500, 1000);
    expect(r.reachesNisab).toBe(false);
    expect(r.amount).toBe(0);
  });

  it("ربع العشر على ما بلغ النصاب", () => {
    const r = computeZakat(10000, 1000);
    expect(r.reachesNisab).toBe(true);
    expect(r.amount).toBe(250); // 2.5٪
  });

  it("بلوغ النصاب بالضبط توجب الزكاة", () => {
    expect(computeZakat(1000, 1000).amount).toBe(25);
  });

  it("نصاب غير محدد يوقف الحساب بدل إخراج رقم عشوائي", () => {
    const r = computeZakat(10000, 0);
    expect(r.reachesNisab).toBe(false);
    expect(r.amount).toBe(0);
  });

  it("الحول يكتمل بعد 354 يوماً لا قبلها", () => {
    const start = new Date(2026, 0, 1);
    expect(isHawlComplete(start, new Date(2026, 11, 1))).toBe(false); // 334 يوماً
    expect(daysUntilHawl(start, new Date(2026, 11, 1))).toBe(20);
    expect(isHawlComplete(start, new Date(2026, 11, 21, 12))).toBe(true);
    expect(daysUntilHawl(start, new Date(2026, 11, 21, 12))).toBe(0);
  });
});

describe("عائد الاستثمار", () => {
  it("يحسب الربح ونسبته", () => {
    expect(computeInvestmentReturn({ amount: 1000, currentValue: 1250 })).toEqual({ gain: 250, returnPercent: 25 });
  });

  it("يحسب الخسارة بإشارة سالبة", () => {
    expect(computeInvestmentReturn({ amount: 1000, currentValue: 800 })).toEqual({ gain: -200, returnPercent: -20 });
  });

  it("استثمار بصفر لا يقسم على صفر", () => {
    expect(computeInvestmentReturn({ amount: 0, currentValue: 0 }).returnPercent).toBe(0);
  });
});


describe("الاشتراك الشهري المتغيّر بين السنوات", () => {
  // 25 ر.ع من يناير 2025، ثم 30 ر.ع من يناير 2026
  const rates = [
    { amount: 25, year: 2025, month: 1 },
    { amount: 30, year: 2026, month: 1 },
  ];

  it("كل شهر يُحاسَب بالسعر الذي كان سارياً فيه", () => {
    expect(rateForMonth(rates, 2025, 6)).toBe(25);
    expect(rateForMonth(rates, 2025, 12)).toBe(25);
    expect(rateForMonth(rates, 2026, 1)).toBe(30);
    expect(rateForMonth(rates, 2026, 8)).toBe(30);
  });

  it("الأشهر السابقة لأول سعر لا سعر لها ⇒ لا متأخرات عليها", () => {
    expect(rateForMonth(rates, 2024, 11)).toBe(0);
    const r = computeArrears({
      rates,
      dueMonths: [{ year: 2024, month: 10 }, { year: 2024, month: 11 }],
      paidByMonth: {},
    });
    expect(r.arrears).toBe(0);
    expect(r.chargedMonths).toBe(0);
    expect(r.missedMonths).toBe(0);
  });

  it("رفع المبلغ لا يُعيد حساب الماضي", () => {
    // لم يدفع شيئاً: شهران بـ25 وشهران بـ30 ⇒ 110 لا 120
    const r = computeArrears({
      rates,
      dueMonths: [
        { year: 2025, month: 11 }, { year: 2025, month: 12 },
        { year: 2026, month: 1 }, { year: 2026, month: 2 },
      ],
      paidByMonth: {},
    });
    expect(r.expectedTotal).toBe(110);
    expect(r.arrears).toBe(110);
    expect(r.chargedMonths).toBe(4);
  });

  it("الدفع بالسعر القديم في شهر قديم يُبرئ ذمته كاملاً", () => {
    const r = computeArrears({
      rates,
      dueMonths: [{ year: 2025, month: 12 }, { year: 2026, month: 1 }],
      paidByMonth: { "2025-12": 25, "2026-1": 30 },
    });
    expect(r.arrears).toBe(0);
    expect(r.missedMonths).toBe(0);
  });

  it("السعر الجديد يبدأ من الشهر القادم لا الجاري", () => {
    expect(nextMonthOf(2026, 8)).toEqual({ year: 2026, month: 9 });
    expect(nextMonthOf(2026, 12)).toEqual({ year: 2027, month: 1 });

    // سُجّل 30 في أغسطس ليسري من سبتمبر ⇒ أغسطس يبقى على 25
    const withNext = [...rates, { amount: 40, year: 2026, month: 9 }];
    expect(rateForMonth(withNext, 2026, 8)).toBe(30);
    expect(rateForMonth(withNext, 2026, 9)).toBe(40);
  });

  it("السعر الثابت القديم ما زال يعمل للاستدعاءات التي لا تمرر سجلاً", () => {
    const r = computeArrears({
      expectedMonthly: 25,
      dueMonths: [{ year: 2026, month: 1 }, { year: 2026, month: 2 }],
      paidByMonth: { "2026-1": 25 },
    });
    expect(r.arrears).toBe(25);
    expect(r.chargedMonths).toBe(2);
  });
});


describe("الأقساط المتأخرة فعلاً", () => {
  // سلفة 300 على 3 أقساط، كلها مضت مهلتها
  const inst = [
    { installmentNumber: 1, amount: 100, dueDate: new Date(2026, 0, 5), status: "scheduled" },
    { installmentNumber: 2, amount: 100, dueDate: new Date(2026, 1, 5), status: "scheduled" },
    { installmentNumber: 3, amount: 100, dueDate: new Date(2026, 2, 5), status: "scheduled" },
  ];
  const now = new Date(2026, 7, 1);

  it("سلفة سُدّدت بالكامل لا أقساط متأخرة عليها", () => {
    expect(overdueInstallments(inst, 300, now)).toHaveLength(0);
    expect(overdueAmount(inst, 300, now)).toBe(0);
  });

  it("السداد الحر يغطي الأقساط بالترتيب", () => {
    const late = overdueInstallments(inst, 100, now);
    expect(late.map((i) => i.installmentNumber)).toEqual([2, 3]);
    expect(overdueAmount(inst, 100, now)).toBe(200);
  });

  it("القسط المغطى جزئياً يُحسب متأخراً بما تبقّى منه فقط", () => {
    expect(overdueAmount(inst, 150, now)).toBe(150); // 50 من الثاني + 100 الثالث
    expect(overdueInstallments(inst, 150, now).map((i) => i.installmentNumber)).toEqual([2, 3]);
  });

  it("بلا سداد إطلاقاً كلها متأخرة", () => {
    expect(overdueInstallments(inst, 0, now)).toHaveLength(3);
    expect(overdueAmount(inst, 0, now)).toBe(300);
  });

  it("القسط الذي لم تمض مهلته ليس متأخراً وإن لم يُدفع", () => {
    const future = [{ installmentNumber: 1, amount: 100, dueDate: new Date(2026, 8, 5), status: "scheduled" }];
    expect(overdueInstallments(future, 0, now)).toHaveLength(0);
  });

  it("القسط المعلَّم مسدَّداً لا يُحسب ولا يستهلك الدفع", () => {
    const mixed = [
      { installmentNumber: 1, amount: 100, dueDate: new Date(2026, 0, 5), status: "paid" },
      { installmentNumber: 2, amount: 100, dueDate: new Date(2026, 1, 5), status: "scheduled" },
    ];
    expect(overdueInstallments(mixed, 100, now)).toHaveLength(0); // الدفع غطّى الثاني
    expect(overdueInstallments(mixed, 0, now).map((i) => i.installmentNumber)).toEqual([2]);
  });
});

describe("الانضمام يحدّ من المتأخرات", () => {
  const rates = [{ amount: 25, year: 2025, month: 1 }];
  const dueMonths = [
    { year: 2026, month: 4 }, { year: 2026, month: 5 },
    { year: 2026, month: 6 }, { year: 2026, month: 7 },
  ];

  it("العضو لا يُحاسَب على شهر سبق انضمامه", () => {
    const r = computeArrears({ rates, joinedAt: new Date(2026, 5, 10), dueMonths, paidByMonth: {} });
    expect(r.chargedMonths).toBe(2);   // يونيو ويوليو فقط
    expect(r.arrears).toBe(50);
  });

  it("عضو قديم يُحاسَب على كل الأشهر", () => {
    const r = computeArrears({ rates, joinedAt: new Date(2024, 0, 1), dueMonths, paidByMonth: {} });
    expect(r.chargedMonths).toBe(4);
    expect(r.arrears).toBe(100);
  });

  it("بلا تاريخ انضمام تُحاسَب كل الأشهر كما كان", () => {
    expect(computeArrears({ rates, dueMonths, paidByMonth: {} }).chargedMonths).toBe(4);
  });
});

describe("جدول الأقساط عند نهايات الأشهر", () => {
  it("لا يقفز شهراً حين تُعتمد السلفة في يوم لا تبلغه الأشهر القصيرة", () => {
    // ٣١ يناير: setMonth وحدها كانت تعطي ٣ مارس للقسط الأول فيضيع فبراير
    const schedule = buildRepaymentSchedule({
      id: "loan-1",
      amount: "300.000",
      repaymentType: "scheduled",
      repaymentMonths: 3,
      approvedAt: new Date(2026, 0, 31),
      createdAt: null,
    });

    const months = schedule.map((installment) => installment.dueDate.getMonth());
    expect(months).toEqual([1, 2, 3]); // فبراير، مارس، أبريل
    expect(schedule[0].dueDate.getDate()).toBe(28); // آخر يوم في فبراير ٢٠٢٦
  });

  it("يبقي المجموع مطابقاً لمبلغ السلفة تماماً", () => {
    const schedule = buildRepaymentSchedule({
      id: "loan-2",
      amount: "1000.000",
      repaymentType: "scheduled",
      repaymentMonths: 7,
      approvedAt: new Date(2026, 0, 31),
      createdAt: null,
    });

    const total = schedule.reduce((sum, installment) => sum + Number(installment.amount), 0);
    expect(Number(total.toFixed(3))).toBe(1000);
    expect(new Set(schedule.map((i) => `${i.dueDate.getFullYear()}-${i.dueDate.getMonth()}`)).size).toBe(7);
  });
});

describe("المتأخرات وأشهر بلا سعر ساري", () => {
  it("لا تحسب مدفوع شهر لم يكن له سعر", () => {
    const result = computeArrears({
      rates: [{ amount: 100, year: 2026, month: 3 }],
      dueMonths: [
        { year: 2026, month: 1 }, // قبل أول سعر — لا يُحاسَب عليه
        { year: 2026, month: 3 },
      ],
      paidByMonth: { "2026-1": 50, "2026-3": 100 },
    });

    expect(result.chargedMonths).toBe(1);
    expect(result.expectedTotal).toBe(100);
    expect(result.paidTotal).toBe(100); // لا ٥٠ الزائدة عن شهر غير محاسَب عليه
    expect(result.arrears).toBe(0);
  });
});
