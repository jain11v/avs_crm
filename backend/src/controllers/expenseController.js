const db = require('../config/db');

function isManager(req) {
  return req.employee.role === 'admin' || req.employee.role === 'manager';
}

const FK_FIELD_NAMES = {
  expense_user_id_fkey: 'Employee',
  expense_head_id_fkey: 'Head',
  expense_approved_by_fkey: 'Approver',
  expense_bank_account_id_fkey: 'Bank account',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

function friendlyCheckError(err) {
  if (err.constraint === 'expense_amount_positive') {
    return 'Amount must be greater than zero.';
  }
  if (err.constraint === 'expense_status_check') {
    return 'Status must be one of: pending, approved, rejected.';
  }
  return 'One of the fields is not in a valid format.';
}

// GET /api/expenses?q=&status=&user_id=&page=&limit=
async function list(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const status = (req.query.status || '').trim();
    const userId = (req.query.user_id || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      conditions.push(`e.description ILIKE $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`e.status = $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      conditions.push(`e.user_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = await db.query(
      `SELECT COUNT(*) FROM expense e ${whereClause}`,
      params
    );
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT e.id, e.user_id, e.description, e.amount, e.expense_date, e.status, e.remarks,
              e.approver_remarks, e.approved_at,
              u.first_name AS user_first_name, u.last_name AS user_last_name,
              h.name AS head_name,
              ba.name AS bank_account_name,
              a.first_name AS approver_first_name, a.last_name AS approver_last_name
       FROM expense e
       LEFT JOIN employees u ON e.user_id = u.id
       LEFT JOIN heads h ON e.head_id = h.id
       LEFT JOIN bank_accounts ba ON e.bank_account_id = ba.id
       LEFT JOIN employees a ON e.approved_by = a.id
       ${whereClause}
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/expenses/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT e.*,
              u.first_name AS user_first_name, u.last_name AS user_last_name,
              h.name AS head_name,
              ba.name AS bank_account_name,
              a.first_name AS approver_first_name, a.last_name AS approver_last_name
       FROM expense e
       LEFT JOIN employees u ON e.user_id = u.id
       LEFT JOIN heads h ON e.head_id = h.id
       LEFT JOIN bank_accounts ba ON e.bank_account_id = ba.id
       LEFT JOIN employees a ON e.approved_by = a.id
       WHERE e.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// Only the submitter-facing fields — status/approver fields are only ever
// changed through the dedicated decision endpoint below.
const EDITABLE_FIELDS = ['user_id', 'description', 'amount', 'expense_date', 'head_id', 'remarks', 'bank_account_id'];
const REQUIRED_FIELDS = ['user_id', 'description', 'amount', 'bank_account_id'];

function pickFields(body) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      out[field] = body[field] === '' ? null : body[field];
    }
  }
  return out;
}

function missingRequiredFields(fields) {
  return REQUIRED_FIELDS.filter((f) => fields[f] === undefined || fields[f] === null || fields[f] === '');
}

// POST /api/expenses
// Every expense gets its ledger row the moment it's submitted (status
// 'pending') — not only once approved — so it's visible in Transactions
// right away. decide() below updates this same row in place; it's never
// re-inserted, so there's exactly one transaction per expense.
async function create(req, res, next) {
  const client = await db.pool.connect();
  try {
    const fields = pickFields(req.body);

    if (fields.user_id && String(fields.user_id) !== String(req.employee.id) && !isManager(req)) {
      return res.status(403).json({ error: 'Only a manager or admin can file an expense on someone else’s behalf.' });
    }

    const missing = missingRequiredFields(fields);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}.` });
    }

    await client.query('BEGIN');

    const columns = [...Object.keys(fields), 'status'];
    const values = [...Object.values(fields), 'pending'];
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    const result = await client.query(
      `INSERT INTO expense (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING id, user_id, description, amount, expense_date, head_id, bank_account_id`,
      values
    );
    const expense = result.rows[0];

    await client.query(
      `INSERT INTO transactions (user_id, date_of_transaction, bank_id, type_of_transaction, amount, head, remarks, expense_id, status)
       VALUES ($1, $2, $3, 'Debit', $4, $5, $6, $7, 'pending')`,
      [expense.user_id, expense.expense_date, expense.bank_account_id, expense.amount, expense.head_id, expense.description, expense.id]
    );

    await client.query('COMMIT');
    res.status(201).json({ id: expense.id });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23514') {
      return res.status(400).json({ error: friendlyCheckError(err) });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  } finally {
    client.release();
  }
}

// PUT /api/expenses/:id
// Editing is blocked once an expense has been approved (it's now a settled
// financial record). Editing a rejected expense resubmits it — status resets
// to "pending" and the previous decision is cleared, since the claim has
// materially changed and needs a fresh look from a senior.
async function update(req, res, next) {
  const client = await db.pool.connect();
  try {
    const existing = await client.query('SELECT status, user_id FROM expense WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }
    if (existing.rows[0].status === 'approved') {
      return res.status(409).json({ error: 'This expense has already been approved and cannot be edited.' });
    }
    if (String(existing.rows[0].user_id) !== String(req.employee.id) && !isManager(req)) {
      return res.status(403).json({ error: 'You cannot edit someone else’s expense.' });
    }

    const fields = pickFields(req.body);

    if (fields.user_id && String(fields.user_id) !== String(existing.rows[0].user_id) && !isManager(req)) {
      return res.status(403).json({ error: 'Only a manager or admin can reassign an expense to someone else.' });
    }

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    const clearedRequired = REQUIRED_FIELDS.filter((f) => f in fields && (fields[f] === null || fields[f] === ''));
    if (clearedRequired.length > 0) {
      return res.status(400).json({ error: `These fields cannot be cleared: ${clearedRequired.join(', ')}.` });
    }

    const wasRejected = existing.rows[0].status === 'rejected';
    if (wasRejected) {
      fields.status = 'pending';
      fields.approved_by = null;
      fields.approved_at = null;
      fields.approver_remarks = null;
    }

    await client.query('BEGIN');

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

    const result = await client.query(
      `UPDATE expense SET ${setClause} WHERE id = $${columns.length + 1}
       RETURNING id, user_id, description, amount, expense_date, head_id, bank_account_id`,
      [...values, req.params.id]
    );
    const expense = result.rows[0];

    // Keep the linked ledger row's mirrored fields in sync — and, on
    // resubmission, put it back to 'pending' too (its old decision no
    // longer applies to what may now be a materially different claim).
    await client.query(
      `UPDATE transactions
       SET bank_id = $1, amount = $2, date_of_transaction = $3, head = $4, remarks = $5, user_id = $6
           ${wasRejected ? ", status = 'pending'" : ''}
       WHERE expense_id = $7`,
      [expense.bank_account_id, expense.amount, expense.expense_date, expense.head_id, expense.description, expense.user_id, req.params.id]
    );

    await client.query('COMMIT');
    res.json({ id: expense.id, resubmitted: wasRejected });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23514') {
      return res.status(400).json({ error: friendlyCheckError(err) });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  } finally {
    client.release();
  }
}

// PATCH /api/expenses/:id/decision  { decision: 'approved'|'rejected', approver_remarks }
// Restricted to managers/admins by the route. A senior can revise an earlier
// rejection (e.g. correct a mis-click), but never their own expense claim —
// that's the whole point of routing it through someone else. The expense's
// ledger row (created back when it was submitted) is updated in place —
// this is what moves it from merely "visible" to actually counted in the
// account balance. Once approved, the decision is locked.
async function decide(req, res, next) {
  const client = await db.pool.connect();
  try {
    const { decision, approver_remarks } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: "Decision must be 'approved' or 'rejected'." });
    }

    const existing = await client.query('SELECT user_id, status FROM expense WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }
    const expense = existing.rows[0];

    if (expense.status === 'approved') {
      return res.status(409).json({ error: 'This expense has already been approved and posted to the ledger.' });
    }
    if (expense.user_id === req.employee.id) {
      return res.status(403).json({ error: 'You cannot approve or reject your own expense.' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE expense
       SET status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP, approver_remarks = $3
       WHERE id = $4
       RETURNING id`,
      [decision, req.employee.id, approver_remarks || null, req.params.id]
    );

    await client.query('UPDATE transactions SET status = $1 WHERE expense_id = $2', [decision, req.params.id]);

    await client.query('COMMIT');
    res.json({ id: result.rows[0].id, status: decision });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// DELETE /api/expenses/:id
async function remove(req, res, next) {
  const client = await db.pool.connect();
  try {
    const existing = await client.query('SELECT status, user_id FROM expense WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }
    if (existing.rows[0].status === 'approved') {
      return res.status(409).json({ error: 'This expense has already been approved and cannot be deleted.' });
    }
    if (String(existing.rows[0].user_id) !== String(req.employee.id) && !isManager(req)) {
      return res.status(403).json({ error: 'You cannot delete someone else’s expense.' });
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM transactions WHERE expense_id = $1', [req.params.id]);
    await client.query('DELETE FROM expense WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');

    res.json({ message: 'Expense deleted.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { list, getById, create, update, decide, remove };
