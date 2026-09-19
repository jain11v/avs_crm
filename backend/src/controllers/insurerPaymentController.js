const db = require('../config/db');
const { diffFields, logChange } = require('../utils/auditLog');

const PAYMENT_AUDIT_FIELDS = ['policy_id', 'amount', 'bank_account_id', 'payment_date', 'reference_id', 'remarks'];

const FK_FIELD_NAMES = {
  insurer_payments_policy_id_fkey: 'Policy',
  insurer_payments_bank_account_id_fkey: 'Bank account',
  insurer_payments_paid_by_fkey: 'Employee',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

function friendlyCheckError(err) {
  if (err.constraint === 'insurer_payments_amount_check') {
    return 'Amount must be greater than zero.';
  }
  return 'One of the fields is not in a valid format.';
}

// GET /api/insurer-payments?policy_id=&page=&limit=
async function list(req, res, next) {
  try {
    const policyId = (req.query.policy_id || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    if (policyId) {
      params.push(policyId);
      conditions.push(`ip.policy_id = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = await db.query(`SELECT COUNT(*) FROM insurer_payments ip ${whereClause}`, params);
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT ip.id, ip.amount, ip.payment_date, ip.reference_id, ip.remarks,
              p.policy_number, i.name AS insurer_name,
              ba.name AS bank_account_name,
              e.first_name AS paid_by_first_name, e.last_name AS paid_by_last_name
       FROM insurer_payments ip
       LEFT JOIN policies p ON ip.policy_id = p.id
       LEFT JOIN insurers i ON p.insurer_id = i.id
       LEFT JOIN bank_accounts ba ON ip.bank_account_id = ba.id
       LEFT JOIN employees e ON ip.paid_by = e.id
       ${whereClause}
       ORDER BY ip.payment_date DESC, ip.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/insurer-payments/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT ip.*, p.policy_number, ba.name AS bank_account_name
       FROM insurer_payments ip
       LEFT JOIN policies p ON ip.policy_id = p.id
       LEFT JOIN bank_accounts ba ON ip.bank_account_id = ba.id
       WHERE ip.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/insurer-payments
// Records one payment to an insurer for a single policy's premium. Posts a
// single Debit transaction — no approval gate (only discounts/cashbacks
// need one).
async function create(req, res, next) {
  const client = await db.pool.connect();
  try {
    const { policy_id, amount, bank_account_id, payment_date, reference_id, remarks, paid_by } = req.body;

    if (!policy_id || !amount || !bank_account_id) {
      return res.status(400).json({ error: 'Missing required fields: policy_id, amount, bank_account_id.' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO insurer_payments (policy_id, amount, bank_account_id, payment_date, reference_id, remarks, paid_by)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6, $7)
       RETURNING id, payment_date`,
      [policy_id, amount, bank_account_id, payment_date || null, reference_id || null, remarks || null, paid_by || null]
    );
    const payment = result.rows[0];

    await client.query(
      `INSERT INTO transactions (user_id, date_of_transaction, bank_id, type_of_transaction, amount, remarks, policy_id, insurer_payment_id, status)
       VALUES ($1, $2, $3, 'Debit', $4, $5, $6, $7, 'approved')`,
      [paid_by || null, payment.payment_date, bank_account_id, amount, remarks || 'Premium paid to insurer', policy_id, payment.id]
    );

    await logChange(client, {
      entityType: 'insurer_payment',
      entityId: payment.id,
      policyId: policy_id,
      action: 'create',
      changes: diffFields(null, { policy_id, amount, bank_account_id, payment_date: payment.payment_date, reference_id, remarks }, PAYMENT_AUDIT_FIELDS),
      employeeId: req.employee.id,
    });

    await client.query('COMMIT');
    res.status(201).json({ id: payment.id });
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

module.exports = { list, getById, create };
