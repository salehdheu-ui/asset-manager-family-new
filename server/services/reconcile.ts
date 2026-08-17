import { pool } from "../db";

/**
 * تدقيق مالي متكامل.
 *
 * الفكرة: لا تصدّق رقماً معروضاً، بل أعد بناءه من الصفوف الأولية ثم قارن.
 * فرق ريال واحد بين ما يعرضه النظام وما تقوله الصفوف يعني خللاً في مكان ما،
 * وهذا الملف يسمّي المكان بدل أن يترك صاحب الصندوق يبحث في الجداول بيده.
 *
 * كل الحساب هنا يقع في بوستجرس بنوع numeric لا في جافاسكربت: جمع العشريات
 * بالفاصلة العائمة يلد فروقاً من العدم (0.1 + 0.2 ليست 0.3)، وهي آخر ما يحتاجه
 * من يبحث عن فرق في حسابه.
 */

/** ما دون هذا الحد كسورٌ لا معنى لها — العملة بثلاث خانات عشرية */
const TOLERANCE = 0.0005;

export type Severity = "critical" | "warning" | "info";

export interface ReconcileFinding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** الأثر المالي إن كان له أثر */
  amount?: number;
  /** أمثلة من الصفوف المعنية — للوصول إليها مباشرة */
  samples?: string[];
}

export interface ReconcileReport {
  generatedAt: string;
  /** الرصيد كما يُعاد بناؤه من الصفوف الأولية */
  rebuilt: {
    contributionsApproved: number;
    contributionsPending: number;
    deposits: number;
    withdrawals: number;
    loansApproved: number;
    loansPending: number;
    repayments: number;
    expenses: number;
    netAssets: number;
    activeInvestments: number;
  };
  /** ما يعرضه النظام في مواضعه المختلفة */
  displayed: {
    allocationYear: number | null;
    allocationNetAssets: number | null;
    allocationLockedAt: string | null;
  };
  differences: {
    /** صف التخصيص المقفل مقابل الرصيد المعاد بناؤه */
    allocationVsRebuilt: number | null;
  };
  findings: ReconcileFinding[];
  /** تغطية سجل التدقيق لكل حركة مالية */
  coverage: { table: string; label: string; rows: number; audited: number }[];
}

async function scalar(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await pool.query<{ value: string }>(sql, params);
  return Number(rows[0]?.value ?? 0);
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** العدد بالعربية يوافق معدوده: واحد ومثنى وجمع */
function arabicCount(n: number, one: string, two: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${many}`;
}

/** مجاميع كل بند من بنود الصندوق */
async function rebuildBalance() {
  const [
    contributionsApproved,
    contributionsPending,
    deposits,
    withdrawals,
    loansApproved,
    loansPending,
    repayments,
    expenses,
    activeInvestments,
  ] = await Promise.all([
    scalar("select coalesce(sum(amount), 0)::text as value from contributions where status = 'approved'"),
    scalar("select coalesce(sum(amount), 0)::text as value from contributions where status <> 'approved'"),
    scalar("select coalesce(sum(amount), 0)::text as value from fund_adjustments where type = 'deposit'"),
    scalar("select coalesce(sum(amount), 0)::text as value from fund_adjustments where type = 'withdrawal'"),
    scalar("select coalesce(sum(amount), 0)::text as value from loans where status = 'approved'"),
    scalar("select coalesce(sum(amount), 0)::text as value from loans where status = 'pending'"),
    scalar(`select coalesce(sum(p.amount), 0)::text as value
            from loan_payments p join loans l on l.id = p.loan_id
            where l.status = 'approved'`),
    scalar("select coalesce(sum(amount), 0)::text as value from expenses"),
    scalar("select coalesce(sum(amount), 0)::text as value from investments where status = 'active'"),
  ]);

  const netAssets =
    contributionsApproved + deposits - withdrawals - loansApproved + repayments - expenses;

  return {
    contributionsApproved: round(contributionsApproved),
    contributionsPending: round(contributionsPending),
    deposits: round(deposits),
    withdrawals: round(withdrawals),
    loansApproved: round(loansApproved),
    loansPending: round(loansPending),
    repayments: round(repayments),
    expenses: round(expenses),
    activeInvestments: round(activeInvestments),
    netAssets: round(netAssets),
  };
}

/** حركات مالية لا أثر لها في سجل التدقيق */
async function auditCoverage() {
  const tables = [
    { table: "expenses", entity: "expense", label: "المصروفات" },
    { table: "fund_adjustments", entity: "fund_adjustment", label: "العمليات المباشرة" },
    { table: "contributions", entity: "contribution", label: "المساهمات" },
    { table: "loans", entity: "loan", label: "السلف" },
    { table: "loan_payments", entity: "loan_payment", label: "سداد السلف" },
    { table: "investments", entity: "investment", label: "الاستثمارات" },
  ];

  const coverage = [];
  for (const entry of tables) {
    const rows = await scalar(`select count(*)::text as value from ${entry.table}`);
    const audited = await scalar(
      `select count(distinct t.id)::text as value
       from ${entry.table} t
       join audit_logs a on a.entity_id = t.id and a.entity_type = $1`,
      [entry.entity],
    );
    coverage.push({ table: entry.table, label: entry.label, rows, audited });
  }

  return coverage;
}

async function findAnomalies(rebuilt: Awaited<ReturnType<typeof rebuildBalance>>): Promise<ReconcileFinding[]> {
  const findings: ReconcileFinding[] = [];

  // ————— سداد على سلف غير معتمدة —————
  // المال وصل الصندوق فعلاً، لكن الحساب لا يعدّه لأن السلفة ليست معتمدة.
  // هذا بالضبط ما يحدث حين تُعتمد سلفة ويُسجَّل سدادها ثم تُعاد إلى «معلقة».
  {
    const { rows } = await pool.query<{ id: string; total: string; status: string; title: string }>(
      `select l.id, l.title, l.status, sum(p.amount)::text as total
       from loan_payments p join loans l on l.id = p.loan_id
       where l.status <> 'approved'
       group by l.id, l.title, l.status`,
    );

    if (rows.length > 0) {
      const total = rows.reduce((sum, row) => sum + Number(row.total), 0);
      findings.push({
        id: "payments-on-unapproved-loans",
        severity: "critical",
        title: "سداد مسجَّل على سلف غير معتمدة",
        detail:
          `${arabicCount(rows.length, "سلفة واحدة حالتها", "سلفتان حالتهما", "سلف حالتها")} ` +
          `ليست «معتمدة» ولها سداد مسجَّل. المال دخل الصندوق ` +
          `ولا يُحتسب في الرصيد، لأن الحساب لا يعدّ إلا سداد السلف المعتمدة. ` +
          `الغالب أن السلفة أُعيدت إلى «معلقة» أو «مرفوضة» بعد تسجيل سدادها.`,
        amount: round(total),
        samples: rows.map((row) => `${row.title} (${row.status}) — ${Number(row.total).toFixed(3)}`),
      });
    }
  }

  // ————— سلف سُدِّد فيها أكثر من مبلغها —————
  {
    const { rows } = await pool.query<{ id: string; title: string; amount: string; paid: string }>(
      `select l.id, l.title, l.amount::text, sum(p.amount)::text as paid
       from loans l join loan_payments p on p.loan_id = l.id
       group by l.id, l.title, l.amount
       having sum(p.amount) > l.amount + $1`,
      [TOLERANCE],
    );

    if (rows.length > 0) {
      const excess = rows.reduce((sum, row) => sum + (Number(row.paid) - Number(row.amount)), 0);
      findings.push({
        id: "overpaid-loans",
        severity: "critical",
        title: "سلف سُدِّد فيها أكثر من مبلغها",
        detail:
          "المسدَّد يتجاوز أصل السلفة. أشيع سببه تسجيل دفعة حرة ثم تعليم القسط نفسه مدفوعاً، " +
          "فيُحتسب المبلغ مرتين ويرتفع الرصيد بلا مقابل.",
        amount: round(excess),
        samples: rows.map(
          (row) => `${row.title} — أصلها ${Number(row.amount).toFixed(3)} والمسدَّد ${Number(row.paid).toFixed(3)}`,
        ),
      });
    }
  }

  // ————— أقساط معلَّمة مدفوعة بلا سداد يقابلها —————
  {
    const { rows } = await pool.query<{ id: string; title: string; marked: string; paid: string }>(
      `select l.id, l.title,
              coalesce((select sum(r.amount) from loan_repayments r
                        where r.loan_id = l.id and r.status = 'paid'), 0)::text as marked,
              coalesce((select sum(p.amount) from loan_payments p
                        where p.loan_id = l.id), 0)::text as paid
       from loans l
       where coalesce((select sum(r.amount) from loan_repayments r
                       where r.loan_id = l.id and r.status = 'paid'), 0)
             > coalesce((select sum(p.amount) from loan_payments p
                         where p.loan_id = l.id), 0) + $1`,
      [TOLERANCE],
    );

    if (rows.length > 0) {
      const gap = rows.reduce((sum, row) => sum + (Number(row.marked) - Number(row.paid)), 0);
      findings.push({
        id: "paid-installments-without-payment",
        severity: "critical",
        title: "أقساط معلَّمة مدفوعة بلا قيد سداد",
        detail:
          "جدول الأقساط يقول إنها سُدِّدت، ودفتر السداد لا يعرف عنها شيئاً. " +
          "الرصيد يتبع دفتر السداد، فهذا المبلغ ينقص من الصندوق وهو مقبوض فعلاً.",
        amount: round(gap),
        samples: rows.map(
          (row) => `${row.title} — أقساط مدفوعة ${Number(row.marked).toFixed(3)} وسداد مسجَّل ${Number(row.paid).toFixed(3)}`,
        ),
      });
    }
  }

  // ————— جدول أقساط لا يساوي مبلغ سلفته —————
  {
    const { rows } = await pool.query<{ title: string; amount: string; scheduled: string }>(
      `select l.title, l.amount::text, sum(r.amount)::text as scheduled
       from loans l join loan_repayments r on r.loan_id = l.id
       group by l.id, l.title, l.amount
       having abs(sum(r.amount) - l.amount) > $1`,
      [TOLERANCE],
    );

    if (rows.length > 0) {
      findings.push({
        id: "schedule-mismatch",
        severity: "warning",
        title: "جدول أقساط لا يطابق مبلغ سلفته",
        detail: "مجموع الأقساط يختلف عن أصل السلفة — يظهر عادة بعد تعديل مبلغ سلفة معتمدة.",
        samples: rows.map(
          (row) => `${row.title} — أصلها ${Number(row.amount).toFixed(3)} ومجموع أقساطها ${Number(row.scheduled).toFixed(3)}`,
        ),
      });
    }
  }

  // ————— مبالغ غير موجبة —————
  for (const entry of [
    { table: "contributions", label: "مساهمة" },
    { table: "expenses", label: "مصروف" },
    { table: "loans", label: "سلفة" },
    { table: "fund_adjustments", label: "عملية مباشرة" },
    { table: "loan_payments", label: "سداد" },
  ]) {
    const count = await scalar(`select count(*)::text as value from ${entry.table} where amount <= 0`);
    if (count > 0) {
      findings.push({
        id: `non-positive-${entry.table}`,
        severity: "warning",
        title: `${entry.label}: ${arabicCount(count, "صف واحد", "صفان", "صفوف")} بمبلغ صفر أو سالب`,
        detail: "المبالغ غير الموجبة تعبث بالمجاميع وتُقرأ خطأً في التقارير.",
      });
    }
  }

  // ————— مساهمة مكرّرة لنفس الشهر —————
  {
    const { rows } = await pool.query<{ member_id: string; year: number; month: number; count: string }>(
      `select member_id, year, month, count(*)::text as count
       from contributions group by member_id, year, month having count(*) > 1`,
    );

    if (rows.length > 0) {
      findings.push({
        id: "duplicate-contributions",
        severity: "critical",
        title: "مساهمات مكرّرة لنفس العضو في نفس الشهر",
        detail: "الشهر الواحد لا يقبل إلا مساهمة واحدة لكل عضو — التكرار يضاعف الإيداع.",
        samples: rows.map((row) => `العضو ${row.member_id} — ${row.month}/${row.year} (${row.count} صفوف)`),
      });
    }
  }

  // ————— انحراف التخصيص المقفل عن الواقع —————
  {
    const { rows } = await pool.query<{ year: number; net_assets: string }>(
      "select year, net_assets::text from capital_allocations order by year desc limit 1",
    );

    if (rows[0]) {
      const drift = rebuilt.netAssets - Number(rows[0].net_assets);
      if (Math.abs(drift) > TOLERANCE) {
        findings.push({
          id: "allocation-drift",
          severity: "info",
          title: "التخصيص المقفل يخالف صافي الأصول الحالي",
          detail:
            `صف التخصيص لسنة ${rows[0].year} مقفل على ${Number(rows[0].net_assets).toFixed(3)} ر.ع، ` +
            `وصافي الأصول اليوم ${rebuilt.netAssets.toFixed(3)} ر.ع. هذا متوقع كلما دخل الصندوق مالٌ ` +
            `بعد القفل — ويصحَّح بإعادة تعيين تخصيص السنة.`,
          amount: round(drift),
        });
      }
    }
  }

  // ————— صافي أصول سالب —————
  if (rebuilt.netAssets < 0) {
    findings.push({
      id: "negative-net-assets",
      severity: "critical",
      title: "صافي الأصول سالب",
      detail:
        "الخارج من الصندوق أكثر من الداخل إليه. الواجهة تعرض صفراً في هذه الحالة، " +
        "وهو ما يخفي العجز بدل أن يظهره.",
      amount: rebuilt.netAssets,
    });
  }

  return findings;
}

export async function reconcileFund(): Promise<ReconcileReport> {
  const rebuilt = await rebuildBalance();
  const [findings, coverage] = await Promise.all([findAnomalies(rebuilt), auditCoverage()]);

  const { rows } = await pool.query<{ year: number; net_assets: string; locked_at: string | null }>(
    "select year, net_assets::text, locked_at from capital_allocations order by year desc limit 1",
  );
  const allocation = rows[0];

  return {
    generatedAt: new Date().toISOString(),
    rebuilt,
    displayed: {
      allocationYear: allocation?.year ?? null,
      allocationNetAssets: allocation ? Number(allocation.net_assets) : null,
      allocationLockedAt: allocation?.locked_at ? new Date(allocation.locked_at).toISOString() : null,
    },
    differences: {
      allocationVsRebuilt: allocation ? round(rebuilt.netAssets - Number(allocation.net_assets)) : null,
    },
    findings,
    coverage,
  };
}

export interface AmountMatch {
  source: string;
  id: string;
  amount: number;
  description: string;
  createdAt: string | null;
}

/**
 * يبحث عن مبلغ بعينه في كل جداول المال.
 *
 * حين يقول صاحب الصندوق «ينقصني ٣٦»، أسرع طريق إلى الجواب أن نُريه كل صف
 * بهذا المبلغ في كل جدول — ومعه ما في سجل التدقيق من أثر.
 */
export async function findAmount(value: number): Promise<AmountMatch[]> {
  const target = Number(value);
  if (!Number.isFinite(target)) return [];

  const queries: { source: string; sql: string }[] = [
    {
      source: "مساهمة",
      sql: `select c.id, c.amount::text as amount, c.created_at,
                   coalesce(m.name, 'عضو محذوف') || ' — ' || c.month || '/' || c.year || ' (' || c.status || ')' as description
            from contributions c left join members m on m.id = c.member_id
            where abs(c.amount - $1) <= $2`,
    },
    {
      source: "مصروف",
      sql: `select id, amount::text as amount, created_at, title || ' (' || category || ')' as description
            from expenses where abs(amount - $1) <= $2`,
    },
    {
      source: "سلفة",
      sql: `select l.id, l.amount::text as amount, l.created_at,
                   l.title || ' — ' || coalesce(m.name, 'عضو محذوف') || ' (' || l.status || ')' as description
            from loans l left join members m on m.id = l.member_id
            where abs(l.amount - $1) <= $2`,
    },
    {
      source: "سداد",
      sql: `select p.id, p.amount::text as amount, p.paid_at as created_at,
                   coalesce(l.title, 'سلفة محذوفة') || ' — ' || coalesce(p.note, 'بلا ملاحظة') as description
            from loan_payments p left join loans l on l.id = p.loan_id
            where abs(p.amount - $1) <= $2`,
    },
    {
      source: "عملية مباشرة",
      sql: `select id, amount::text as amount, created_at,
                   (case when type = 'deposit' then 'إيداع' else 'سحب' end) || ' — ' || coalesce(description, 'بلا وصف') as description
            from fund_adjustments where abs(amount - $1) <= $2`,
    },
    {
      source: "قسط",
      sql: `select r.id, r.amount::text as amount, r.due_date as created_at,
                   coalesce(l.title, 'سلفة محذوفة') || ' — قسط ' || r.installment_number || ' (' || r.status || ')' as description
            from loan_repayments r left join loans l on l.id = r.loan_id
            where abs(r.amount - $1) <= $2`,
    },
    {
      source: "استثمار",
      sql: `select id, amount::text as amount, started_at as created_at, title || ' (' || status || ')' as description
            from investments where abs(amount - $1) <= $2`,
    },
  ];

  const matches: AmountMatch[] = [];
  for (const query of queries) {
    const { rows } = await pool.query<{ id: string; amount: string; created_at: Date | null; description: string }>(
      query.sql,
      [target, TOLERANCE],
    );
    for (const row of rows) {
      matches.push({
        source: query.source,
        id: row.id,
        amount: Number(row.amount),
        description: row.description,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      });
    }
  }

  return matches.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
