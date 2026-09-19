const db = require('../config/db');
const { diffFields, logChange } = require('../utils/auditLog');

const ADJUSTMENT_AUDIT_FIELDS = ['policy_id', 'type', 'amount', 'bank_account_id', 'remarks', 'status', 'approver_remarks'];

const FK_FIELD_NAMES = {
  policy_adjustments_policy_id_fkey: 'Policy',
  policy_adjustments_bank_account_id_fkey: 'Bank account',
  policy_adjustments_created_by_fkey: 'Employee',
  policy_adjustments_approved_by_fkey: 'Approver',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

function friendlyCheckError(err) {
  if (err.constraint === 'policy_adjustments_amount_check') {
    return 'Amount must be greater than zero.';
  }
  if (err.constraint === 'policy_adjustments_type_check') {
    return "Type must be 'discount' or 'cashback'.";
  }
  if (err.constraint === 'policy_adjustments_cashback_needs_bank') {
    return 'A cashback needs a bank account to pay it from.';
  }
  return 'One of the fields is not in a valid format.';
}

// GET /api/policy-adjustments?policy_id=&type=&status=&page=&limit=
async function list(req, res, next) {
  try {
    const policyId = (req.query.policy_id || '').trim();
    const type = (req.query.type || '').trim();
    const status = (req.query.status || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    if (policyId) {
      params.push(policyId);
      conditions.push(`pa.policy_id = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`pa.type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`pa.status = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = await db.query(`SELECT COUNT(*) FROM policy_adjustments pa ${whereClause}`, params);
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT pa.id, pa.type, pa.amount, pa.remarks, pa.status, pa.approver_remarks, pa.approved_at, pa.created_by,
              p.policy_number, c.name AS customer_name,
              cb.first_name AS created_by_first_name, cb.last_name AS created_by_last_name,
              ab.first_name AS approved_by_first_name, ab.last_name AS approved_by_last_name
       FROM policy_adjustments pa
       LEFT JOIN policies p ON pa.policy_id = p.id
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN employees cb ON pa.created_by = cb.id
       LEFT JOIN employees ab ON pa.approved_by = ab.id
       ${whereClause}
       ORDER BY pa.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/policy-adjustments/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT pa.*, p.policy_number,
              cb.first_name AS created_by_first_name, cb.last_name AS created_by_last_name,
              ab.first_name AS approved_by_first_name, ab.last_name AS approved_by_last_name
       FROM policy_adjustments pa
       LEFT JOIN policies p ON pa.policy_id = p.id
       LEFT JOIN employees cb ON pa.created_by = cb.id
       LEFT JOIN employees ab ON pa.approved_by = ab.id
       WHERE pa.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

const EDITABLE_FIELDS = ['policy_id', 'type', 'amount', 'bank_account_id', 'remarks'];
const REQUIRED_FIELDS = ['policy_id', 'type', 'amount'];

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

// POST /api/policy-adjustments
async function create(req, res, next) {
  try {
    const fields = pickFields(req.body);

    const missing = missingRequiredFields(fields);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}.` });
    }
    if (fields.type === 'cashback' && !fields.bank_account_id) {
      return res.status(400).json({ error: 'A cashback needs a bank account to pay it from.' });
    }

    const columns = [...Object.keys(fields), 'created_by', 'status'];
    const values = [...Object.values(fields), req.employee.id, 'pending'];
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    const result = await db.query(
      `INSERT INTO policy_adjustments (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
      values
    );

    await logChange(db, {
      entityType: 'policy_adjustment',
      entityId: result.rows[0].id,
      policyId: fields.policy_id,
      action: 'create',
      changes: diffFields(null, { ...fields, status: 'pending' }, ADJUSTMENT_AUDIT_FIELDS),
      employeeId: req.employee.id,
    });

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23514') {
      return res.status(400).json({ error: friendlyCheckError(err) });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PUT /api/policy-adjustments/:id
// Editing a rejected adjustment resubmits it — status resets to 'pending'
// and the old decision is cleared, mirroring the expense workflow.
async function update(req, res, next) {
  try {
    const existing = await db.query(
      `SELECT ${ADJUSTMENT_AUDIT_FIELDS.join(', ')} FROM policy_adjustments WHERE id = $1`,
      [req.params.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found.' });
    }
    if (existing.rows[0].status === 'approved') {
      return res.status(409).json({ error: 'This adjustment has already been approved and cannot be edited.' });
    }

    const fields = pickFields(req.body);
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    const clearedRequired = REQUIRED_FIELDS.filter((f) => f in fields && (fields[f] === null || fields[f] === ''));
    if (clearedRequired.length > 0) {
      return res.status(400).json({ error: `These fields cannot be cleared: ${clearedRequired.join(', ')}.` });
    }

    const effectiveType = fields.type || (await db.query('SELECT type FROM policy_adjustments WHERE id = $1', [req.params.id])).rows[0].type;
    const effectiveBank = 'bank_account_id' in fields ? fields.bank_account_id : (await db.query('SELECT bank_account_id FROM policy_adjustments WHERE id = $1', [req.params.id])).rows[0].bank_account_id;
    if (effectiveType === 'cashback' && !effectiveBank) {
      return res.status(400).json({ error: 'A cashback needs a bank account to pay it from.' });
    }

    if (existing.rows[0].status === 'rejected') {
      fields.status = 'pending';
      fields.approved_by = null;
      fields.approved_at = null;
      fields.approver_remarks = null;
    }

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

    const result = await db.query(
      `UPDATE policy_adjustments SET ${setClause} WHERE id = $${columns.length + 1} RETURNING id`,
      [...values, req.params.id]
    );

    await logChange(db, {
      entityType: 'policy_adjustment',
      entityId: result.rows[0].id,
      policyId: existing.rows[0].policy_id,
      action: 'update',
      changes: diffFields(existing.rows[0], { ...existing.rows[0], ...fields }, ADJUSTMENT_AUDIT_FIELDS),
      employeeId: req.employee.id,
    });

    res.json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23514') {
      return res.status(400).json({ error: friendlyCheckError(err) });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PATCH /api/policy-adjustments/:id/decision  { decision: 'approved'|'rejected', approver_remarks }
// Restricted to managers/admins by the route, and never by whoever proposed
// it. Approving a cashback posts a real Debit from its bank account in the
// same transaction; approving a discount just flips its status (it's a
// pure accounting entry — no bank account is touched).
async function decide(req, res, next) {
  const client = await db.pool.connect();
  try {
    const { decision, approver_remarks } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: "Decision must be 'approved' or 'rejected'." });
    }

    const existing = await client.query(
      'SELECT created_by, status, type, amount, bank_account_id, policy_id, remarks, approver_remarks FROM policy_adjustments WHERE id = $1',
      [req.params.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found.' });
    }
    const adjustment = existing.rows[0];

    if (adjustment.status === 'approved') {
      return res.status(409).json({ error: 'This adjustment has already been approved.' });
    }
    if (adjustment.created_by === req.employee.id) {
      return res.status(403).json({ error: 'You cannot approve or reject your own request.' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE policy_adjustments
       SET status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP, approver_remarks = $3
       WHERE id = $4
       RETURNING id`,
      [decision, req.employee.id, approver_remarks || null, req.params.id]
    );

    if (decision === 'approved' && adjustment.type === 'cashback') {
      await client.query(
        `INSERT INTO transactions (user_id, date_of_transaction, bank_id, type_of_transaction, amount, remarks, policy_id, policy_adjustment_id, status)
         VALUES ($1, CURRENT_TIMESTAMP, $2, 'Debit', $3, $4, $5, $6, 'approved')`,
        [req.employee.id, adjustment.bank_account_id, adjustment.amount, adjustment.remarks || 'Cashback to customer', adjustment.policy_id, req.params.id]
      );
    }

    await logChange(client, {
      entityType: 'policy_adjustment',
      entityId: Number(req.params.id),
      policyId: adjustment.policy_id,
      action: decision,
      changes: diffFields(adjustment, { ...adjustment, status: decision, approver_remarks: approver_remarks || null }, ['status', 'approver_remarks']),
      employeeId: req.employee.id,
    });

    await client.query('COMMIT');
    res.json({ id: result.rows[0].id, status: decision });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// DELETE /api/policy-adjustments/:id
async function remove(req, res, next) {
  try {
    const existing = await db.query(
      `SELECT ${ADJUSTMENT_AUDIT_FIELDS.join(', ')} FROM policy_adjustments WHERE id = $1`,
      [req.params.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found.' });
    }
    if (existing.rows[0].status === 'approved') {
      return res.status(409).json({ error: 'This adjustment has already been approved and cannot be deleted.' });
    }

    await db.query('DELETE FROM policy_adjustments WHERE id = $1', [req.params.id]);

    await logChange(db, {
      entityType: 'policy_adjustment',
      entityId: Number(req.params.id),
      policyId: existing.rows[0].policy_id,
      action: 'delete',
      changes: diffFields(existing.rows[0], null, ADJUSTMENT_AUDIT_FIELDS),
      employeeId: req.employee.id,
    });

    res.json({ message: 'Adjustment deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, decide, remove };
