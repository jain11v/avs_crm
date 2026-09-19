const db = require('../config/db');
const { validateFormats, normalizeFormats } = require('../utils/validators');

const FK_FIELD_NAMES = {
  insurer_branches_insurer_id_fkey: 'Insurer',
  insurer_branches_city_id_fkey: 'City',
  insurer_branches_state_id_fkey: 'State',
  insurer_branches_bank_name_id_fkey: 'Bank name',
  policies_insurer_branch_id_fkey: 'Insurer branch',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

// GET /api/insurer-branches?q=&insurer_id=&page=&limit=
async function list(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const insurerId = (req.query.insurer_id || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(ib.name ILIKE $${params.length} OR ib.branch_code ILIKE $${params.length})`);
    }
    if (insurerId) {
      params.push(insurerId);
      conditions.push(`ib.insurer_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = await db.query(
      `SELECT COUNT(*) FROM insurer_branches ib ${whereClause}`,
      params
    );
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT ib.id, ib.name, ib.branch_code, ib.contact_person, ib.email, ib.phone,
              ib.is_active, i.id AS insurer_id, i.name AS insurer_name,
              ci.name AS city_name, s.name AS state_name
       FROM insurer_branches ib
       LEFT JOIN insurers i ON ib.insurer_id = i.id
       LEFT JOIN cities ci ON ib.city_id = ci.id
       LEFT JOIN states s ON ib.state_id = s.id
       ${whereClause}
       ORDER BY i.name, ib.name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/insurer-branches/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT ib.*, i.name AS insurer_name, ci.name AS city_name, s.name AS state_name,
              bn.name AS bank_name
       FROM insurer_branches ib
       LEFT JOIN insurers i ON ib.insurer_id = i.id
       LEFT JOIN cities ci ON ib.city_id = ci.id
       LEFT JOIN states s ON ib.state_id = s.id
       LEFT JOIN bank_names bn ON ib.bank_name_id = bn.id
       WHERE ib.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Insurer branch not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

const EDITABLE_FIELDS = [
  'name', 'insurer_id', 'broker_code', 'branch_code', 'contact_person', 'email', 'phone',
  'address', 'city_id', 'state_id', 'pan', 'gst', 'bank_name_id', 'account_no', 'ifsc',
  'remarks', 'website',
];

const REQUIRED_FIELDS = ['name', 'insurer_id'];

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

// POST /api/insurer-branches
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
      `INSERT INTO insurer_branches (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
      values
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23514') {
      return res.status(400).json({ error: 'One of the fields is not in a valid format. Please check phone, PAN, and GST fields.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PUT /api/insurer-branches/:id
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
      `UPDATE insurer_branches SET ${setClause} WHERE id = $${columns.length + 1} RETURNING id`,
      [...values, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Insurer branch not found.' });
    }

    res.json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23514') {
      return res.status(400).json({ error: 'One of the fields is not in a valid format. Please check phone, PAN, and GST fields.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PATCH /api/insurer-branches/:id/status  { is_active: true|false }
async function setStatus(req, res, next) {
  try {
    const { is_active } = req.body;
    const result = await db.query(
      'UPDATE insurer_branches SET is_active = $1 WHERE id = $2 RETURNING id',
      [is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Insurer branch not found.' });
    }

    res.json({ id: result.rows[0].id, is_active });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/insurer-branches/:id
async function remove(req, res, next) {
  try {
    const result = await db.query('DELETE FROM insurer_branches WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Insurer branch not found.' });
    }

    res.json({ message: 'Insurer branch deleted.' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'This insurer branch has policies linked to it and cannot be deleted. Deactivate it instead.',
      });
    }
    next(err);
  }
}

module.exports = { list, getById, create, update, setStatus, remove };
