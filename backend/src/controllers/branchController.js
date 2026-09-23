const db = require('../config/db');
const { validateFormats, normalizeFormats } = require('../utils/validators');

// Note: the table is named broker_branches in the database (the id sequence
// and most constraint names are still "branches_*" from before it was renamed).
const FK_FIELD_NAMES = {
  branches_city_id_fkey: 'City',
  branches_state_id_fkey: 'State',
  customers_branch_id_fkey: 'Branch',
  employees_reporting_branch_fkey: 'Branch',
  policies_issued_at_fkey: 'Branch',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

// GET /api/branches?q=&page=&limit=
async function list(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const searchClause = q ? `WHERE b.name ILIKE $1 OR b.email ILIKE $1 OR b.branch_code ILIKE $1` : '';
    const params = q ? [`%${q}%`] : [];

    const totalResult = await db.query(
      `SELECT COUNT(*) FROM broker_branches b ${searchClause}`,
      params
    );
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT b.id, b.name, b.branch_code, b.email, b.phone,
              ci.name AS city_name, s.name AS state_name
       FROM broker_branches b
       LEFT JOIN cities ci ON b.city_id = ci.id
       LEFT JOIN states s ON b.state_id = s.id
       ${searchClause}
       ORDER BY b.name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/branches/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT b.*, ci.name AS city_name, s.name AS state_name
       FROM broker_branches b
       LEFT JOIN cities ci ON b.city_id = ci.id
       LEFT JOIN states s ON b.state_id = s.id
       WHERE b.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Branch not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

const EDITABLE_FIELDS = ['name', 'address', 'city_id', 'state_id', 'branch_code', 'email', 'phone', 'gst'];
const REQUIRED_FIELDS = ['name', 'email', 'address', 'city_id', 'state_id', 'gst'];

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

// POST /api/branches
async function create(req, res, next) {
  try {
    const fields = pickFields(normalizeFormats(req.body));

    const missing = missingRequiredFields(fields);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}.` });
    }

    const formatErrors = validateFormats(fields);
    if (formatErrors.length > 0) {
      return res.status(400).json({ error: formatErrors.join(' ') });
    }

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    const result = await db.query(
      `INSERT INTO broker_branches (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
      values
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A branch with this email already exists.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'One of the fields is not in a valid format. Please check phone and GST fields.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PUT /api/branches/:id
async function update(req, res, next) {
  try {
    const fields = pickFields(normalizeFormats(req.body));

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    const clearedRequired = REQUIRED_FIELDS.filter((f) => f in fields && (fields[f] === null || fields[f] === ''));
    if (clearedRequired.length > 0) {
      return res.status(400).json({ error: `These fields cannot be cleared: ${clearedRequired.join(', ')}.` });
    }

    const formatErrors = validateFormats(fields);
    if (formatErrors.length > 0) {
      return res.status(400).json({ error: formatErrors.join(' ') });
    }

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

    const result = await db.query(
      `UPDATE broker_branches SET ${setClause} WHERE id = $${columns.length + 1} RETURNING id`,
      [...values, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Branch not found.' });
    }

    res.json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A branch with this email already exists.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'One of the fields is not in a valid format. Please check phone and GST fields.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// DELETE /api/branches/:id
async function remove(req, res, next) {
  try {
    const result = await db.query('DELETE FROM broker_branches WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Branch not found.' });
    }

    res.json({ message: 'Branch deleted.' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'This branch has customers, employees, or policies linked to it and cannot be deleted.',
      });
    }
    next(err);
  }
}

module.exports = { list, getById, create, update, remove };
