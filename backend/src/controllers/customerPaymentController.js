const db = require('../config/db');
const { diffFields, logChange } = require('../utils/auditLog');
const { getOrCreateHeadId } = require('../utils/heads');

const PAYMENT_AUDIT_FIELDS = ['customer_id', 'amount', 'bank_account_id', 'payment_date', 'reference_id', 'remarks'];

const FK_FIELD_NAMES = {
  customer_payments_customer_id_fkey: 'Customer',
  customer_payments_bank_account_id_fkey: 'Bank account',
  customer_payments_received_by_fkey: 'Employee',
  customer_payment_allocations_policy_id_fkey: 'Policy',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

function friendlyCheckError(err) {
  if (err.constraint === 'customer_payments_amount_check' || err.constraint === 'customer_payment_allocations_amount_check') {
    return 'Amount must be greater than zero.';
  }
  return 'One of the fields is not in a valid format.';
}

// Validates the allocations array against the payment total. Returns
// { rows } on success or { error } with a user-facing message.
function validateAllocations(allocations, total) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return { error: 'Allocate this payment to at least one policy.' };
  }

  const rows = [];
  let sum = 0;
  for (const a of allocations) {
    const policyId = a.policy_id;
    const amount = Number(a.amount);
    if (!policyId) {
      return { error: 'Each allocation needs a policy.' };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: 'Each allocation amount must be greater than zero.' };
    }
    rows.push({ policy_id: policyId, amount });
    sum += amount;
  }

  // Allow a tiny rounding tolerance rather than requiring exact float equality.
  if (Math.abs(sum - Number(total)) > 0.01) {
    return { error: `Allocations (₹${sum.toFixed(2)}) must add up to the payment amount (₹${Number(total).toFixed(2)}).` };
  }

  return { rows };
}

// GET /api/customer-payments?customer_id=&page=&limit=
async function list(req, res, next) {
  try {
    const customerId = (req.query.customer_id || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    if (customerId) {
      params.push(customerId);
      conditions.push(`cp.customer_id = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = await db.query(`SELECT COUNT(*) FROM customer_payments cp ${whereClause}`, params);
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT cp.id, cp.amount, cp.payment_date, cp.reference_id, cp.remarks,
              c.name AS customer_name, ba.name AS bank_account_name,
              e.first_name AS received_by_first_name, e.last_name AS received_by_last_name
       FROM customer_payments cp
       LEFT JOIN customers c ON cp.customer_id = c.id
       LEFT JOIN bank_accounts ba ON cp.bank_account_id = ba.id
       LEFT JOIN employees e ON cp.received_by = e.id
       ${whereClause}
       ORDER BY cp.payment_date DESC, cp.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/customer-payments/:id
async function getById(req, res, next) {
  try {
    const paymentResult = await db.query(
      `SELECT cp.*, c.name AS customer_name, ba.name AS bank_account_name
       FROM customer_payments cp
       LEFT JOIN customers c ON cp.customer_id = c.id
       LEFT JOIN bank_accounts ba ON cp.bank_account_id = ba.id
       WHERE cp.id = $1`,
      [req.params.id]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found.' });
    }

    const allocationsResult = await db.query(
      `SELECT cpa.id, cpa.policy_id, cpa.amount, p.policy_number
       FROM customer_payment_allocations cpa
       LEFT JOIN policies p ON cpa.policy_id = p.id
       WHERE cpa.payment_id = $1
       ORDER BY cpa.id`,
      [req.params.id]
    );

    res.json({ ...paymentResult.rows[0], allocations: allocationsResult.rows });
  } catch (err) {
    next(err);
  }
}

// POST /api/customer-payments
// Records one receipt from a customer and splits it across one or more of
// their policies. Posts a single Credit transaction for the full amount —
// there's no approval gate here (only discounts/cashbacks need one).
async function create(req, res, next) {
  const client = await db.pool.connect();
  try {
    const { customer_id, amount, bank_account_id, payment_date, reference_id, remarks, received_by, allocations } = req.body;

    if (!customer_id || !amount || !bank_account_id) {
      return res.status(400).json({ error: 'Missing required fields: customer_id, amount, bank_account_id.' });
    }

    const { rows: allocationRows, error: allocationError } = validateAllocations(allocations, amount);
    if (allocationError) {
      return res.status(400).json({ error: allocationError });
    }

    const policyOwners = await client.query(
      `SELECT id, customer_id, policy_number FROM policies WHERE id = ANY($1::int[])`,
      [allocationRows.map((r) => r.policy_id)]
    );
    const mismatched = policyOwners.rows.find((p) => String(p.customer_id) !== String(customer_id));
    if (mismatched) {
      return res.status(400).json({ error: `Policy ${mismatched.policy_number} does not belong to this customer.` });
    }

    await client.query('BEGIN');

    const paymentResult = await client.query(
      `INSERT INTO customer_payments (customer_id, amount, bank_account_id, payment_date, reference_id, remarks, received_by)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6, $7)
       RETURNING id, payment_date`,
      [customer_id, amount, bank_account_id, payment_date || null, reference_id || null, remarks || null, received_by || null]
    );
    const payment = paymentResult.rows[0];

    for (const row of allocationRows) {
      await client.query(
        `INSERT INTO customer_payment_allocations (payment_id, policy_id, amount) VALUES ($1, $2, $3)`,
        [payment.id, row.policy_id, row.amount]
      );
    }

    // A single-policy payment can still be tagged on the ledger row for
    // easy per-policy filtering; a split payment leaves policy_id null
    // there (the allocations table is the source of truth for the split).
    const singlePolicyId = allocationRows.length === 1 ? allocationRows[0].policy_id : null;
    const headId = await getOrCreateHeadId(client, 'Premium Received');

    await client.query(
      `INSERT INTO transactions (user_id, date_of_transaction, bank_id, type_of_transaction, amount, head, remarks, policy_id, customer_payment_id, status)
       VALUES ($1, $2, $3, 'Credit', $4, $5, $6, $7, $8, 'approved')`,
      [received_by || null, payment.payment_date, bank_account_id, amount, headId, remarks || 'Premium received from customer', singlePolicyId, payment.id]
    );

    await logChange(client, {
      entityType: 'customer_payment',
      entityId: payment.id,
      policyId: singlePolicyId,
      action: 'create',
      changes: diffFields(null, { customer_id, amount, bank_account_id, payment_date: payment.payment_date, reference_id, remarks }, PAYMENT_AUDIT_FIELDS),
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
