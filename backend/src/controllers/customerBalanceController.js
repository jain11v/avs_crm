const db = require('../config/db');

// Shared by list() and exportCsv() — for each customer, what they owe =
// total premium across their policies, minus payments they've allocated
// against those policies, minus discounts approved against those policies.
// Cashback is a separate payout and does not affect this balance.
const BALANCE_CTE = `
  WITH policy_totals AS (
    SELECT p.customer_id,
           COALESCE(SUM(p.premium_amount), 0) AS total_premium,
           array_agg(p.id ORDER BY p.id) AS policy_ids,
           array_agg(p.policy_number ORDER BY p.id) AS policy_numbers
    FROM policies p
    GROUP BY p.customer_id
  ),
  payment_totals AS (
    SELECT cp.customer_id,
           COALESCE(SUM(cp.amount), 0) AS total_paid
    FROM customer_payments cp
    GROUP BY cp.customer_id
  ),
  discount_totals AS (
    SELECT p.customer_id,
           COALESCE(SUM(pa.amount), 0) AS total_discount
    FROM policy_adjustments pa
    JOIN policies p ON pa.policy_id = p.id
    WHERE pa.type = 'discount' AND pa.status = 'approved'
    GROUP BY p.customer_id
  )
  SELECT c.id AS customer_id, c.name AS customer_name,
         pt.policy_ids, pt.policy_numbers,
         COALESCE(pt.total_premium, 0) AS total_premium,
         COALESCE(pay.total_paid, 0) AS total_paid,
         COALESCE(dt.total_discount, 0) AS total_discount,
         COALESCE(pt.total_premium, 0) - COALESCE(pay.total_paid, 0) - COALESCE(dt.total_discount, 0) AS balance
  FROM customers c
  JOIN policy_totals pt ON pt.customer_id = c.id
  LEFT JOIN payment_totals pay ON pay.customer_id = c.id
  LEFT JOIN discount_totals dt ON dt.customer_id = c.id
`;

function balanceFilters(req) {
  const search = (req.query.search || '').trim();
  const onlyOutstanding = req.query.only_outstanding === 'true';

  const conditions = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`c.name ILIKE $${params.length}`);
  }
  if (onlyOutstanding) {
    conditions.push(`(COALESCE(pt.total_premium, 0) - COALESCE(pay.total_paid, 0) - COALESCE(dt.total_discount, 0)) > 0.01`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

// GET /api/customer-balances?search=&only_outstanding=true&page=&limit=
async function list(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const { whereClause, params } = balanceFilters(req);

    const totalResult = await db.query(
      `SELECT COUNT(*) FROM (${BALANCE_CTE} ${whereClause}) sub`,
      params
    );
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `${BALANCE_CTE} ${whereClause}
       ORDER BY balance DESC, c.name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/customer-balances/export.csv?search=&only_outstanding=true
// Same figures as list(), but every matching row at once (no pagination),
// for month-end filing.
function csvField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCsv(req, res, next) {
  try {
    const { whereClause, params } = balanceFilters(req);
    const dataResult = await db.query(
      `${BALANCE_CTE} ${whereClause} ORDER BY balance DESC, c.name`,
      params
    );

    const header = ['Customer', 'Policies', 'Total Premium', 'Total Paid', 'Total Discount', 'Balance'];
    const lines = [header.join(',')];
    for (const r of dataResult.rows) {
      lines.push([
        csvField(r.customer_name),
        csvField((r.policy_numbers || []).join('; ')),
        r.total_premium,
        r.total_paid,
        r.total_discount,
        r.balance,
      ].join(','));
    }

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="customer-balances-${today}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
}

// GET /api/customer-balances/:customerId
// Drill-down: per-policy premium/paid/discount breakdown, plus the raw
// payment and adjustment history for this customer.
async function getByCustomer(req, res, next) {
  try {
    const customerId = req.params.customerId;

    const customerResult = await db.query('SELECT id, name FROM customers WHERE id = $1', [customerId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const policiesResult = await db.query(
      `SELECT p.id AS policy_id, p.policy_number, p.premium_amount,
              COALESCE(alloc.paid, 0) AS paid,
              COALESCE(disc.discount, 0) AS discount,
              p.premium_amount - COALESCE(alloc.paid, 0) - COALESCE(disc.discount, 0) AS balance
       FROM policies p
       LEFT JOIN (
         SELECT cpa.policy_id, SUM(cpa.amount) AS paid
         FROM customer_payment_allocations cpa
         GROUP BY cpa.policy_id
       ) alloc ON alloc.policy_id = p.id
       LEFT JOIN (
         SELECT pa.policy_id, SUM(pa.amount) AS discount
         FROM policy_adjustments pa
         WHERE pa.type = 'discount' AND pa.status = 'approved'
         GROUP BY pa.policy_id
       ) disc ON disc.policy_id = p.id
       WHERE p.customer_id = $1
       ORDER BY p.policy_start_date DESC NULLS LAST, p.id DESC`,
      [customerId]
    );

    const paymentsResult = await db.query(
      `SELECT cp.id, cp.amount, cp.payment_date, cp.reference_id, cp.remarks, ba.name AS bank_account_name
       FROM customer_payments cp
       LEFT JOIN bank_accounts ba ON cp.bank_account_id = ba.id
       WHERE cp.customer_id = $1
       ORDER BY cp.payment_date DESC, cp.id DESC`,
      [customerId]
    );

    const adjustmentsResult = await db.query(
      `SELECT pa.id, pa.type, pa.amount, pa.status, pa.remarks, p.policy_number
       FROM policy_adjustments pa
       JOIN policies p ON pa.policy_id = p.id
       WHERE p.customer_id = $1
       ORDER BY pa.created_at DESC`,
      [customerId]
    );

    const totals = policiesResult.rows.reduce(
      (acc, row) => ({
        total_premium: acc.total_premium + Number(row.premium_amount || 0),
        total_paid: acc.total_paid + Number(row.paid || 0),
        total_discount: acc.total_discount + Number(row.discount || 0),
      }),
      { total_premium: 0, total_paid: 0, total_discount: 0 }
    );

    res.json({
      customer_id: customerResult.rows[0].id,
      customer_name: customerResult.rows[0].name,
      ...totals,
      balance: totals.total_premium - totals.total_paid - totals.total_discount,
      policies: policiesResult.rows,
      payments: paymentsResult.rows,
      adjustments: adjustmentsResult.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getByCustomer, exportCsv };
