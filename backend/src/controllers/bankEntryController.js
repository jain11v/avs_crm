const db = require('../config/db');
const { diffFields, logChange } = require('../utils/auditLog');

const AUDIT_FIELDS = ['entry_date', 'bank_account_id', 'type_of_transaction', 'head_id', 'amount', 'remarks', 'employee_id', 'customer_id'];

const FK_FIELD_NAMES = {
  bank_entries_bank_account_id_fkey: 'Bank account',
  bank_entries_head_id_fkey: 'Head',
  bank_entries_employee_id_fkey: 'Employee',
  bank_entries_customer_id_fkey: 'Customer',
  bank_entries_created_by_fkey: 'Employee',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

function friendlyCheckError(err) {
  if (err.constraint === 'bank_entries_amount_check') {
    return 'Amount must be greater than zero.';
  }
  if (err.constraint === 'bank_entries_type_of_transaction_check') {
    return 'Type must be Debit or Credit.';
  }
  if (err.constraint === 'bank_entries_employee_id_customer_id_check' || err.constraint === 'bank_entries_check') {
    return 'Link this entry to an employee or a customer, not both.';
  }
  return 'One of the fields is not in a valid format.';
}

// GET /api/bank-entries?bank_account_id=&type=&employee_id=&customer_id=&page=&limit=
async function list(req, res, next) {
  try {
    const bankAccountId = (req.query.bank_account_id || '').trim();
    const type = (req.query.type || '').trim();
    const employeeId = (req.query.employee_id || '').trim();
    const customerId = (req.query.customer_id || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    if (bankAccountId) {
      params.push(bankAccountId);
      conditions.push(`be.bank_account_id = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`be.type_of_transaction = $${params.length}`);
    }
    if (employeeId) {
      params.push(employeeId);
      conditions.push(`be.employee_id = $${params.length}`);
    }
    if (customerId) {
      params.push(customerId);
      conditions.push(`be.customer_id = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = await db.query(`SELECT COUNT(*) FROM bank_entries be ${whereClause}`, params);
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT be.id, be.entry_date, be.type_of_transaction, be.amount, be.remarks,
              ba.name AS bank_account_name, h.name AS head_name,
              emp.first_name AS employee_first_name, emp.last_name AS employee_last_name,
              c.name AS customer_name,
              cb.first_name AS created_by_first_name, cb.last_name AS created_by_last_name
       FROM bank_entries be
       LEFT JOIN bank_accounts ba ON be.bank_account_id = ba.id
       LEFT JOIN heads h ON be.head_id = h.id
       LEFT JOIN employees emp ON be.employee_id = emp.id
       LEFT JOIN customers c ON be.customer_id = c.id
       LEFT JOIN employees cb ON be.created_by = cb.id
       ${whereClause}
       ORDER BY be.entry_date DESC, be.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/bank-entries/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT be.*, ba.name AS bank_account_name, h.name AS head_name,
              emp.first_name AS employee_first_name, emp.last_name AS employee_last_name,
              c.name AS customer_name
       FROM bank_entries be
       LEFT JOIN bank_accounts ba ON be.bank_account_id = ba.id
       LEFT JOIN heads h ON be.head_id = h.id
       LEFT JOIN employees emp ON be.employee_id = emp.id
       LEFT JOIN customers c ON be.customer_id = c.id
       WHERE be.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bank entry not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/bank-entries
// Records a manual Credit or Debit against a bank account, not tied to any
// of the app's other money flows. Posts straight to the ledger, approved —
// no approval workflow, same trust level as customer/insurer payments. If
// linked to an employee or customer, it feeds that person's running
// balance on the Customer/Employee balances pages.
async function create(req, res, next) {
  const client = await db.pool.connect();
  try {
    const { entry_date, bank_account_id, type_of_transaction, head_id, amount, remarks, employee_id, customer_id } = req.body;

    if (!bank_account_id || !type_of_transaction || !head_id || !amount) {
      return res.status(400).json({ error: 'Missing required fields: bank_account_id, type_of_transaction, head_id, amount.' });
    }
    if (employee_id && customer_id) {
      return res.status(400).json({ error: 'Link this entry to an employee or a customer, not both.' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO bank_entries (entry_date, bank_account_id, type_of_transaction, head_id, amount, remarks, employee_id, customer_id, created_by)
       VALUES (COALESCE($1, CURRENT_DATE), $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, entry_date`,
      [entry_date || null, bank_account_id, type_of_transaction, head_id, amount, remarks || null, employee_id || null, customer_id || null, req.employee.id]
    );
    const entry = result.rows[0];

    await client.query(
      `INSERT INTO transactions (user_id, date_of_transaction, bank_id, type_of_transaction, amount, head, remarks, bank_entry_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved')`,
      [req.employee.id, entry.entry_date, bank_account_id, type_of_transaction, amount, head_id, remarks || null, entry.id]
    );

    await logChange(client, {
      entityType: 'bank_entry',
      entityId: entry.id,
      action: 'create',
      changes: diffFields(null, { entry_date: entry.entry_date, bank_account_id, type_of_transaction, head_id, amount, remarks, employee_id, customer_id }, AUDIT_FIELDS),
      employeeId: req.employee.id,
    });

    await client.query('COMMIT');
    res.status(201).json({ id: entry.id });
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
