const db = require('../config/db');
const { diffFields, logChange } = require('../utils/auditLog');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function friendlyForeignKeyError(err) {
  const names = {
    payroll_payments_employee_id_fkey: 'Employee',
    payroll_payments_bank_account_id_fkey: 'Bank account',
    payroll_payments_head_id_fkey: 'Head',
  };
  return `${names[err.constraint] || 'One of the selected values'} does not refer to a valid record. Please re-select it and try again.`;
}

function normalizeMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null;
  return `${month}-01`;
}

function monthLabel(monthStr) {
  const [y, m] = monthStr.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(m) - 1]} ${y}`;
}

// POST /api/payroll/generate  { month: 'YYYY-MM' }
// Idempotent: only inserts a draft row for an active, salaried employee who
// doesn't already have one for that month — never touches an existing row
// (manually adjusted or already paid), so this is safe to re-run.
// unpaid_leave_days comes from approved leave_requests (leave_type='unpaid')
// overlapping the month; deduction is a straight pro-rata of salary over
// the month's calendar days, clamped so net_amount never goes negative.
async function generate(req, res, next) {
  try {
    const month = normalizeMonth(req.body.month);
    if (!month) {
      return res.status(400).json({ error: 'month is required, in YYYY-MM format.' });
    }

    const result = await db.query(
      `WITH month_bounds AS (
         SELECT $1::date AS month_start, ($1::date + INTERVAL '1 month - 1 day')::date AS month_end
       ),
       unpaid AS (
         SELECT lr.employee_id,
                SUM(GREATEST(0, LEAST(lr.end_date, mb.month_end) - GREATEST(lr.start_date, mb.month_start) + 1)) AS days
         FROM leave_requests lr, month_bounds mb
         WHERE lr.status = 'approved' AND lr.leave_type = 'unpaid'
           AND lr.start_date <= mb.month_end AND lr.end_date >= mb.month_start
         GROUP BY lr.employee_id
       ),
       computed AS (
         SELECT e.id AS employee_id, mb.month_start, e.salary,
                COALESCE(u.days, 0) AS unpaid_leave_days,
                LEAST(e.salary, ROUND(e.salary / (mb.month_end - mb.month_start + 1) * COALESCE(u.days, 0), 2)) AS deduction
         FROM employees e
         CROSS JOIN month_bounds mb
         LEFT JOIN unpaid u ON u.employee_id = e.id
         WHERE e.is_active = true AND e.salary IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM payroll_payments pp WHERE pp.employee_id = e.id AND pp.month = mb.month_start)
       )
       INSERT INTO payroll_payments (employee_id, month, base_salary, unpaid_leave_days, deduction, net_amount, generated_by)
       SELECT employee_id, month_start, salary, unpaid_leave_days, deduction, salary - deduction, $2
       FROM computed
       RETURNING id`,
      [month, req.employee.id]
    );

    res.status(201).json({ created: result.rows.length });
  } catch (err) {
    next(err);
  }
}

// GET /api/payroll?month=YYYY-MM
async function list(req, res, next) {
  try {
    const month = normalizeMonth(req.query.month);
    if (!month) {
      return res.status(400).json({ error: 'month is required, in YYYY-MM format.' });
    }

    const result = await db.query(
      `SELECT pp.*, e.first_name, e.last_name,
              ba.name AS bank_account_name, h.name AS head_name
       FROM payroll_payments pp
       JOIN employees e ON pp.employee_id = e.id
       LEFT JOIN bank_accounts ba ON pp.bank_account_id = ba.id
       LEFT JOIN heads h ON pp.head_id = h.id
       WHERE pp.month = $1
       ORDER BY e.first_name, e.last_name`,
      [month]
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
}

const EDITABLE_FIELDS = ['deduction', 'bank_account_id', 'head_id', 'remarks'];

// PUT /api/payroll/:id — draft only. net_amount is always re-derived from
// base_salary - deduction server-side, never trusted from the client.
async function update(req, res, next) {
  try {
    const existing = await db.query('SELECT status, base_salary FROM payroll_payments WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll entry not found.' });
    }
    if (existing.rows[0].status !== 'draft') {
      return res.status(409).json({ error: 'This payroll entry has already been paid and cannot be edited.' });
    }

    const fields = {};
    for (const f of EDITABLE_FIELDS) {
      if (req.body[f] !== undefined) fields[f] = req.body[f] === '' ? null : req.body[f];
    }
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    if ('deduction' in fields) {
      const deduction = Number(fields.deduction) || 0;
      // Not clamped to 0 — an oversized deduction should hit the
      // payroll_payments_net_amount_check constraint below and be
      // rejected, not silently floor net pay to zero.
      fields.net_amount = round2(Number(existing.rows[0].base_salary) - deduction);
    }

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

    const result = await db.query(
      `UPDATE payroll_payments SET ${setClause} WHERE id = $${columns.length + 1} RETURNING id`,
      [...values, req.params.id]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'Deduction cannot exceed the base salary.' });
    }
    next(err);
  }
}

// PATCH /api/payroll/:id/pay  { bank_account_id, head_id, remarks }
// Posts an already-approved expense + Debit transaction directly — the
// approval already happened via the explicit generate-then-pay action on
// this admin-gated page, same trust level as commission-receipt/cashback
// posting elsewhere in the app (see commissionReconciliationController.js).
async function pay(req, res, next) {
  const client = await db.pool.connect();
  try {
    const existing = await client.query(
      `SELECT pp.*, e.first_name, e.last_name
       FROM payroll_payments pp JOIN employees e ON pp.employee_id = e.id
       WHERE pp.id = $1`,
      [req.params.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll entry not found.' });
    }
    const row = existing.rows[0];
    if (row.status !== 'draft') {
      return res.status(409).json({ error: 'This payroll entry has already been paid.' });
    }

    const bankAccountId = req.body.bank_account_id || row.bank_account_id;
    const headId = req.body.head_id || row.head_id;
    const remarks = req.body.remarks || row.remarks;
    if (!bankAccountId || !headId) {
      return res.status(400).json({ error: 'A bank account and a head are required to mark this paid.' });
    }

    await client.query('BEGIN');

    const monthStr = row.month; // already a 'YYYY-MM-DD' string (see config/db.js DATE parsing)
    const description = `Salary — ${monthLabel(monthStr.slice(0, 7))} (${row.first_name} ${row.last_name})`;

    const expenseResult = await client.query(
      `INSERT INTO expense (user_id, description, amount, expense_date, head_id, bank_account_id, remarks, status, approved_by, approved_at)
       VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, 'approved', $7, CURRENT_TIMESTAMP)
       RETURNING id`,
      [row.employee_id, description, row.net_amount, headId, bankAccountId, remarks || null, req.employee.id]
    );
    const expenseId = expenseResult.rows[0].id;

    await client.query(
      `INSERT INTO transactions (user_id, date_of_transaction, bank_id, type_of_transaction, amount, head, remarks, expense_id, status)
       VALUES ($1, CURRENT_DATE, $2, 'Debit', $3, $4, $5, $6, 'approved')`,
      [req.employee.id, bankAccountId, row.net_amount, headId, description, expenseId]
    );

    const result = await client.query(
      `UPDATE payroll_payments
       SET status = 'paid', bank_account_id = $1, head_id = $2, remarks = $3, expense_id = $4, paid_by = $5, paid_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id`,
      [bankAccountId, headId, remarks || null, expenseId, req.employee.id, req.params.id]
    );

    await logChange(client, {
      entityType: 'payroll_payment',
      entityId: row.id,
      action: 'paid',
      changes: diffFields(row, { ...row, status: 'paid' }, ['status']),
      employeeId: req.employee.id,
    });

    await client.query('COMMIT');
    res.json({ id: result.rows[0].id, status: 'paid', expense_id: expenseId });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  } finally {
    client.release();
  }
}

// DELETE /api/payroll/:id — draft only.
async function remove(req, res, next) {
  try {
    const existing = await db.query('SELECT status FROM payroll_payments WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll entry not found.' });
    }
    if (existing.rows[0].status !== 'draft') {
      return res.status(409).json({ error: 'This payroll entry has already been paid and cannot be deleted.' });
    }
    await db.query('DELETE FROM payroll_payments WHERE id = $1', [req.params.id]);
    res.json({ message: 'Payroll entry deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { generate, list, update, pay, remove };
