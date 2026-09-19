const db = require('../config/db');

const FK_FIELD_NAMES = {
  bank_accounts_bank_name_id_fkey: 'Bank name',
  transactions_bank_id_fkey: 'Bank account',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

function friendlyCheckError(err) {
  if (err.constraint === 'bank_accounts_type_check') {
    return 'Type must be one of: Saving, Current, Loan, Credit card, Debit card.';
  }
  return 'One of the fields is not in a valid format.';
}

// GET /api/bank-accounts?q=&page=&limit=
async function list(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const searchClause = q ? `WHERE ba.name ILIKE $1 OR ba.ac_no ILIKE $1` : '';
    const params = q ? [`%${q}%`] : [];

    const totalResult = await db.query(
      `SELECT COUNT(*) FROM bank_accounts ba ${searchClause}`,
      params
    );
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT ba.id, ba.name, ba.ac_no, ba.type, ba.ifsc,
              bn.id AS bank_name_id, bn.name AS bank_name
       FROM bank_accounts ba
       LEFT JOIN bank_names bn ON ba.bank_name_id = bn.id
       ${searchClause}
       ORDER BY bn.name, ba.name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/bank-accounts/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT ba.*, bn.name AS bank_name
       FROM bank_accounts ba
       LEFT JOIN bank_names bn ON ba.bank_name_id = bn.id
       WHERE ba.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bank account not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

const EDITABLE_FIELDS = ['bank_name_id', 'name', 'ac_no', 'type', 'ifsc'];
const REQUIRED_FIELDS = ['bank_name_id', 'name', 'ac_no'];

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

// POST /api/bank-accounts
async function create(req, res, next) {
  try {
    const fields = pickFields(req.body);

    const missing = missingRequiredFields(fields);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}.` });
    }

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    const result = await db.query(
      `INSERT INTO bank_accounts (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
      values
    );

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

// PUT /api/bank-accounts/:id
async function update(req, res, next) {
  try {
    const fields = pickFields(req.body);

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    const clearedRequired = REQUIRED_FIELDS.filter((f) => f in fields && (fields[f] === null || fields[f] === ''));
    if (clearedRequired.length > 0) {
      return res.status(400).json({ error: `These fields cannot be cleared: ${clearedRequired.join(', ')}.` });
    }

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

    const result = await db.query(
      `UPDATE bank_accounts SET ${setClause} WHERE id = $${columns.length + 1} RETURNING id`,
      [...values, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bank account not found.' });
    }

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

// DELETE /api/bank-accounts/:id
async function remove(req, res, next) {
  try {
    const result = await db.query('DELETE FROM bank_accounts WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bank account not found.' });
    }

    res.json({ message: 'Bank account deleted.' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'This bank account has transactions linked to it and cannot be deleted.',
      });
    }
    next(err);
  }
}

module.exports = { list, getById, create, update, remove };
