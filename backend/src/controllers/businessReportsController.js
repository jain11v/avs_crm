const XLSX = require('xlsx');
const db = require('../config/db');
const { computeExpectedCommission, round2 } = require('./commissionReconciliationController');

// Downloadable business reports — one Excel sheet per report, filtered to a
// date range. Each entry in REPORTS runs one query and describes its
// columns; the download handler turns that into an .xlsx. Admin-only by
// default (the `reports` page key) since several of these are bulk lists
// of customer/policy data.
//
// Every query takes the range as $1 (from) / $2 (to), inclusive. Timestamp
// columns are cast to ::date so the whole of the "to" day is included.

const EMPLOYEE_NAME = (alias) => `NULLIF(TRIM(CONCAT(${alias}.first_name, ' ', ${alias}.last_name)), '')`;

// Premium split per policy: third-party rows vs everything else, same split
// the commission reconciliation uses (premiums.is_third_party).
const PREMIUM_SPLIT = `
  SELECT policy_id,
         COALESCE(SUM(prem) FILTER (WHERE NOT is_third_party), 0) AS non_tp_premium,
         COALESCE(SUM(prem) FILTER (WHERE is_third_party), 0) AS tp_premium,
         COALESCE(SUM(gst), 0) AS gst_amount
  FROM premiums
  GROUP BY policy_id
`;

const col = (header, key, type = 'text') => ({ header, key, type });

const REPORTS = {
  new_business: {
    label: 'New business register',
    description: 'New (non-renewal) policies whose start date falls in the range.',
    columns: [
      col('Policy no.', 'policy_number'), col('Customer', 'customer'), col('Insurer', 'insurer'),
      col('Vertical', 'vertical'), col('Sub-vertical', 'sub_vertical'), col('Sum insured', 'sum_insured', 'number'),
      col('Premium', 'premium_amount', 'number'), col('Start date', 'policy_start_date', 'date'),
      col('End date', 'policy_end_date', 'date'), col('Created by', 'created_by'), col('Branch', 'branch'),
    ],
    sql: `
      SELECT p.policy_number, c.name AS customer, i.name AS insurer, v.name AS vertical, sv.name AS sub_vertical,
             p.sum_insured, p.premium_amount, p.policy_start_date, p.policy_end_date,
             ${EMPLOYEE_NAME('e')} AS created_by, bb.name AS branch
      FROM policies p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN insurers i ON p.insurer_id = i.id
      LEFT JOIN verticals v ON p.vertical_id = v.id
      LEFT JOIN sub_verticals sv ON p.sub_vertical_id = sv.id
      LEFT JOIN employees e ON p.user_id = e.id
      LEFT JOIN broker_branches bb ON p.issued_from_branch_id = bb.id
      WHERE p.renewed_from_policy_id IS NULL AND p.policy_start_date BETWEEN $1 AND $2
      ORDER BY p.policy_start_date, p.policy_number`,
  },

  renewals_done: {
    label: 'Renewals done',
    description: 'Renewal policies whose start date falls in the range, with the policy they renewed.',
    columns: [
      col('New policy no.', 'policy_number'), col('Previous policy no.', 'previous_policy_number'),
      col('Customer', 'customer'), col('Insurer', 'insurer'), col('Premium', 'premium_amount', 'number'),
      col('Start date', 'policy_start_date', 'date'), col('Created by', 'created_by'),
    ],
    sql: `
      SELECT p.policy_number, prev.policy_number AS previous_policy_number, c.name AS customer, i.name AS insurer,
             p.premium_amount, p.policy_start_date, ${EMPLOYEE_NAME('e')} AS created_by
      FROM policies p
      JOIN policies prev ON p.renewed_from_policy_id = prev.id
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN insurers i ON p.insurer_id = i.id
      LEFT JOIN employees e ON p.user_id = e.id
      WHERE p.policy_start_date BETWEEN $1 AND $2
      ORDER BY p.policy_start_date, p.policy_number`,
  },

  renewal_status: {
    label: 'Renewal status (policies ending in period)',
    description: 'Renewable policies whose end date falls in the range, and whether each was renewed, lost, or is still pending.',
    columns: [
      col('Policy no.', 'policy_number'), col('Customer', 'customer'), col('Insurer', 'insurer'),
      col('Premium', 'premium_amount', 'number'), col('End date', 'policy_end_date', 'date'),
      col('Outcome', 'outcome'), col('Renewed as', 'renewed_as'), col('Marked lost by', 'lost_by'),
    ],
    sql: `
      SELECT p.policy_number, c.name AS customer, i.name AS insurer, p.premium_amount, p.policy_end_date,
             CASE WHEN r.id IS NOT NULL THEN 'Renewed'
                  WHEN p.status = 'Not Renewed' THEN 'Not renewed'
                  ELSE 'Pending' END AS outcome,
             r.policy_number AS renewed_as, ${EMPLOYEE_NAME('lb')} AS lost_by
      FROM policies p
      LEFT JOIN policies r ON r.renewed_from_policy_id = p.id
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN insurers i ON p.insurer_id = i.id
      LEFT JOIN employees lb ON p.lost_by = lb.id
      WHERE p.renewable = true AND p.policy_end_date BETWEEN $1 AND $2
      ORDER BY p.policy_end_date, p.policy_number`,
  },

  premium_register: {
    label: 'Premium register',
    description: 'Premium breakdown (own damage / third party / GST) for policies starting in the range.',
    columns: [
      col('Policy no.', 'policy_number'), col('Customer', 'customer'), col('Insurer', 'insurer'),
      col('Vertical', 'vertical'), col('Start date', 'policy_start_date', 'date'),
      col('Premium excl. TP', 'non_tp_premium', 'number'), col('TP premium', 'tp_premium', 'number'),
      col('GST', 'gst_amount', 'number'), col('Total premium', 'premium_amount', 'number'),
    ],
    sql: `
      SELECT p.policy_number, c.name AS customer, i.name AS insurer, v.name AS vertical, p.policy_start_date,
             COALESCE(ps.non_tp_premium, 0) AS non_tp_premium, COALESCE(ps.tp_premium, 0) AS tp_premium,
             COALESCE(ps.gst_amount, 0) AS gst_amount, p.premium_amount
      FROM policies p
      LEFT JOIN (${PREMIUM_SPLIT}) ps ON ps.policy_id = p.id
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN insurers i ON p.insurer_id = i.id
      LEFT JOIN verticals v ON p.vertical_id = v.id
      WHERE p.policy_start_date BETWEEN $1 AND $2
      ORDER BY p.policy_start_date, p.policy_number`,
  },

  commission: {
    label: 'Commission: expected vs received',
    description: 'For policies starting in the range: commission rates, expected commission (incl. GST), what was received, and the difference.',
    columns: [
      col('Policy no.', 'policy_number'), col('Insurer', 'insurer'), col('Start date', 'policy_start_date', 'date'),
      col('Brokerage %', 'brok_percent', 'number'), col('TP brokerage %', 'tp_brok_percent', 'number'),
      col('Reward %', 'reward_percent', 'number'), col('Commission status', 'commission_status'),
      col('Expected (incl. GST)', 'expected', 'number'), col('Received', 'received', 'number'),
      col('Received on', 'received_date', 'date'), col('Difference', 'difference', 'number'),
    ],
    sql: `
      SELECT p.policy_number, i.name AS insurer, p.policy_start_date,
             cm.brok_percent, cm.tp_brok_percent, cm.reward_percent, cm.gst AS commission_gst_percent,
             cm.status AS commission_status,
             COALESCE(ps.non_tp_premium, 0) AS non_tp_premium, COALESCE(ps.tp_premium, 0) AS tp_premium,
             cr.amount AS received, cr.received_date
      FROM policies p
      LEFT JOIN (${PREMIUM_SPLIT}) ps ON ps.policy_id = p.id
      LEFT JOIN commission cm ON cm.policy_id = p.id
      LEFT JOIN commission_receipts cr ON cr.policy_id = p.id
      LEFT JOIN insurers i ON p.insurer_id = i.id
      WHERE p.policy_start_date BETWEEN $1 AND $2
      ORDER BY p.policy_start_date, p.policy_number`,
    // Same formula the Commission Reconciliation page uses.
    transform: (rows) => rows.map((r) => {
      const expected = r.brok_percent === null ? null : computeExpectedCommission(r).total;
      const received = r.received === null ? null : Number(r.received);
      return {
        ...r,
        expected,
        received,
        difference: expected === null ? null : round2((received || 0) - expected),
      };
    }),
  },

  customer_collections: {
    label: 'Customer collections',
    description: 'Payments received from customers with a payment date in the range.',
    columns: [
      col('Date', 'payment_date', 'date'), col('Customer', 'customer'), col('Policy no.', 'policies'),
      col('Amount', 'amount', 'number'), col('Received into', 'bank_account'), col('Reference', 'reference_id'),
      col('Received by', 'received_by'),
    ],
    sql: `
      SELECT cp.payment_date, c.name AS customer,
             (SELECT string_agg(p.policy_number, ', ') FROM customer_payment_allocations a
              JOIN policies p ON a.policy_id = p.id WHERE a.payment_id = cp.id) AS policies,
             cp.amount, ba.name AS bank_account, cp.reference_id, ${EMPLOYEE_NAME('e')} AS received_by
      FROM customer_payments cp
      LEFT JOIN customers c ON cp.customer_id = c.id
      LEFT JOIN bank_accounts ba ON cp.bank_account_id = ba.id
      LEFT JOIN employees e ON cp.received_by = e.id
      WHERE cp.payment_date BETWEEN $1 AND $2
      ORDER BY cp.payment_date, cp.id`,
  },

  insurer_payments: {
    label: 'Insurer payments',
    description: 'Premium paid to insurers with a payment date in the range.',
    columns: [
      col('Date', 'payment_date', 'date'), col('Policy no.', 'policy_number'), col('Insurer', 'insurer'),
      col('Amount', 'amount', 'number'), col('Paid from', 'bank_account'), col('Reference', 'reference_id'),
    ],
    sql: `
      SELECT ip.payment_date, p.policy_number, i.name AS insurer, ip.amount, ba.name AS bank_account, ip.reference_id
      FROM insurer_payments ip
      LEFT JOIN policies p ON ip.policy_id = p.id
      LEFT JOIN insurers i ON p.insurer_id = i.id
      LEFT JOIN bank_accounts ba ON ip.bank_account_id = ba.id
      WHERE ip.payment_date BETWEEN $1 AND $2
      ORDER BY ip.payment_date, ip.id`,
  },

  discounts_cashback: {
    label: 'Discounts & cashback',
    description: 'Discount and cashback requests created in the range, with approval status.',
    columns: [
      col('Date', 'created_date', 'date'), col('Policy no.', 'policy_number'), col('Customer', 'customer'),
      col('Type', 'type'), col('Amount', 'amount', 'number'), col('Status', 'status'),
      col('Requested by', 'requested_by'), col('Approved by', 'approved_by'), col('Remarks', 'remarks'),
    ],
    sql: `
      SELECT pa.created_at::date AS created_date, p.policy_number, c.name AS customer,
             INITCAP(pa.type) AS type, pa.amount, INITCAP(pa.status) AS status,
             ${EMPLOYEE_NAME('rq')} AS requested_by, ${EMPLOYEE_NAME('ap')} AS approved_by, pa.remarks
      FROM policy_adjustments pa
      LEFT JOIN policies p ON pa.policy_id = p.id
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN employees rq ON pa.created_by = rq.id
      LEFT JOIN employees ap ON pa.approved_by = ap.id
      WHERE pa.created_at::date BETWEEN $1 AND $2
      ORDER BY pa.created_at, pa.id`,
  },

  expenses: {
    label: 'Expenses',
    description: 'Expenses with an expense date in the range, by head, with approval status.',
    columns: [
      col('Date', 'expense_date', 'date'), col('Head', 'head'), col('Description', 'description'),
      col('Amount', 'amount', 'number'), col('Status', 'status'), col('Filed by', 'filed_by'),
      col('Approved by', 'approved_by'), col('Paid from', 'bank_account'),
    ],
    sql: `
      SELECT ex.expense_date, h.name AS head, ex.description, ex.amount, INITCAP(ex.status) AS status,
             ${EMPLOYEE_NAME('f')} AS filed_by, ${EMPLOYEE_NAME('ap')} AS approved_by, ba.name AS bank_account
      FROM expense ex
      LEFT JOIN heads h ON ex.head_id = h.id
      LEFT JOIN employees f ON ex.user_id = f.id
      LEFT JOIN employees ap ON ex.approved_by = ap.id
      LEFT JOIN bank_accounts ba ON ex.bank_account_id = ba.id
      WHERE ex.expense_date BETWEEN $1 AND $2
      ORDER BY ex.expense_date, ex.id`,
  },

  bank_book: {
    label: 'Bank book',
    description: 'Every approved bank transaction (credit/debit) dated in the range, by account.',
    columns: [
      col('Date', 'txn_date', 'date'), col('Bank account', 'bank_account'), col('Type', 'type_of_transaction'),
      col('Credit', 'credit', 'number'), col('Debit', 'debit', 'number'), col('Head', 'head'),
      col('Policy no.', 'policy_number'), col('Reference', 'reference_id'), col('Remarks', 'remarks'),
    ],
    sql: `
      SELECT t.date_of_transaction::date AS txn_date, ba.name AS bank_account, t.type_of_transaction,
             CASE WHEN t.type_of_transaction = 'Credit' THEN t.amount END AS credit,
             CASE WHEN t.type_of_transaction = 'Debit' THEN t.amount END AS debit,
             h.name AS head, p.policy_number, t.reference_id, t.remarks
      FROM transactions t
      LEFT JOIN bank_accounts ba ON t.bank_id = ba.id
      LEFT JOIN heads h ON t.head = h.id
      LEFT JOIN policies p ON t.policy_id = p.id
      WHERE t.status = 'approved' AND t.date_of_transaction::date BETWEEN $1 AND $2
      ORDER BY ba.name, t.date_of_transaction, t.id`,
  },

  profit_loss: {
    label: 'Profit & loss summary',
    description: 'Cash-basis P&L for the range: commission received, less cashback and expenses by head (same rules as the dashboard Financial reports).',
    columns: [col('Line item', 'item'), col('Amount', 'amount', 'number')],
    // Same definitions as financialReportsController.js: revenue is only
    // commission received; premium in/out is pass-through; discounts post no
    // transaction; cashback and expenses are costs.
    sql: `
      WITH t AS (
        SELECT * FROM transactions
        WHERE status = 'approved' AND date_of_transaction::date BETWEEN $1 AND $2
      ),
      lines AS (
        SELECT 1 AS ord, 'Revenue: commission received' AS item, COALESCE(SUM(amount) FILTER (WHERE commission_receipt_id IS NOT NULL), 0) AS amount FROM t
        UNION ALL
        SELECT 2, 'Less: cashback paid', -COALESCE(SUM(amount) FILTER (WHERE policy_adjustment_id IS NOT NULL), 0) FROM t
        UNION ALL
        SELECT 3, 'Less expense: ' || COALESCE(h.name, 'Uncategorized'), -SUM(t.amount)
        FROM t LEFT JOIN heads h ON t.head = h.id
        WHERE t.expense_id IS NOT NULL
        GROUP BY h.name
      )
      SELECT item, amount FROM (
        SELECT ord, item, amount FROM lines
        UNION ALL
        SELECT 9, 'Net profit / (loss)', COALESCE(SUM(amount), 0) FROM lines
      ) x
      ORDER BY ord, item`,
  },

  employee_performance: {
    label: 'Employee performance',
    description: 'Per employee: new policies and renewals started in the range, premium written, and renewals marked lost in the range.',
    columns: [
      col('Employee', 'employee'), col('New policies', 'new_policies', 'number'),
      col('Renewals done', 'renewals_done', 'number'), col('Premium written', 'premium_written', 'number'),
      col('Renewals lost', 'renewals_lost', 'number'),
    ],
    sql: `
      SELECT ${EMPLOYEE_NAME('e')} AS employee,
             COUNT(p.id) FILTER (WHERE p.renewed_from_policy_id IS NULL) AS new_policies,
             COUNT(p.id) FILTER (WHERE p.renewed_from_policy_id IS NOT NULL) AS renewals_done,
             COALESCE(SUM(p.premium_amount), 0) AS premium_written,
             (SELECT COUNT(*) FROM policies l WHERE l.lost_by = e.id AND l.lost_at::date BETWEEN $1 AND $2) AS renewals_lost
      FROM employees e
      LEFT JOIN policies p ON p.user_id = e.id AND p.policy_start_date BETWEEN $1 AND $2
      GROUP BY e.id, e.first_name, e.last_name
      HAVING COUNT(p.id) > 0
          OR (SELECT COUNT(*) FROM policies l WHERE l.lost_by = e.id AND l.lost_at::date BETWEEN $1 AND $2) > 0
      ORDER BY premium_written DESC, employee`,
  },
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function runReport(key, from, to) {
  const report = REPORTS[key];
  const result = await db.query(report.sql, [from, to]);
  const rows = report.transform ? report.transform(result.rows) : result.rows;
  return { report, rows };
}

// 'YYYY-MM-DD' strings (pg DATE parser is overridden in config/db.js) and
// Date objects both become real Excel dates; numerics come back from pg as
// strings and become real Excel numbers.
function cellValue(value, type) {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'number') return Number(value);
  if (type === 'date') {
    const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  return String(value);
}

function buildWorkbook(report, rows) {
  const aoa = [report.columns.map((c) => c.header)];
  for (const r of rows) aoa.push(report.columns.map((c) => cellValue(r[c.key], c.type)));

  const sheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'dd-mm-yyyy' });
  sheet['!cols'] = report.columns.map((c, i) => {
    const longest = aoa.reduce((max, row) => {
      const v = row[i];
      const len = v instanceof Date ? 10 : v === null ? 0 : String(v).length;
      return Math.max(max, len);
    }, 0);
    return { wch: Math.min(Math.max(longest + 2, 10), 50) };
  });

  const workbook = XLSX.utils.book_new();
  // Excel sheet names: max 31 chars, none of : \ / ? * [ ]
  XLSX.utils.book_append_sheet(workbook, sheet, report.label.replace(/[:\\/?*[\]]/g, ' -').slice(0, 31));
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellDates: true });
}

// GET /api/reports — the dropdown's options.
function list(req, res) {
  res.json(Object.entries(REPORTS).map(([key, r]) => ({ key, label: r.label, description: r.description })));
}

// GET /api/reports/:key/download?from=YYYY-MM-DD&to=YYYY-MM-DD
async function download(req, res, next) {
  try {
    const { key } = req.params;
    const from = (req.query.from || '').trim();
    const to = (req.query.to || '').trim();

    if (!REPORTS[key]) {
      return res.status(404).json({ error: 'Unknown report.' });
    }
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return res.status(400).json({ error: 'Choose both a From and a To date.' });
    }
    if (from > to) {
      return res.status(400).json({ error: 'The From date must be on or before the To date.' });
    }

    const { report, rows } = await runReport(key, from, to);
    const buffer = buildWorkbook(report, rows);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${key.replace(/_/g, '-')}-${from}-to-${to}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, download, REPORTS, runReport, buildWorkbook };
