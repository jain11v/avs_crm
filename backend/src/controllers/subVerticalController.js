const db = require('../config/db');

const FK_FIELD_NAMES = {
  sub_verticals_vertical_id_fkey: 'Vertical',
  policies_sub_vertical_id_fkey: 'Sub-vertical',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

// GET /api/sub-verticals?q=&vertical_id=&page=&limit=
async function list(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const verticalId = (req.query.vertical_id || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      conditions.push(`sv.name ILIKE $${params.length}`);
    }
    if (verticalId) {
      params.push(verticalId);
      conditions.push(`sv.vertical_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = await db.query(
      `SELECT COUNT(*) FROM sub_verticals sv ${whereClause}`,
      params
    );
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT sv.id, sv.name, sv.description, sv.is_active,
              v.id AS vertical_id, v.name AS vertical_name
       FROM sub_verticals sv
       LEFT JOIN verticals v ON sv.vertical_id = v.id
       ${whereClause}
       ORDER BY v.name, sv.name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/sub-verticals/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT sv.*, v.name AS vertical_name
       FROM sub_verticals sv
       LEFT JOIN verticals v ON sv.vertical_id = v.id
       WHERE sv.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sub-vertical not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

const EDITABLE_FIELDS = ['name', 'vertical_id', 'description'];
const REQUIRED_FIELDS = ['name', 'vertical_id'];

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

// POST /api/sub-verticals
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
      `INSERT INTO sub_verticals (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
      values
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A sub-vertical with this name already exists under the selected vertical.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PUT /api/sub-verticals/:id
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
      `UPDATE sub_verticals SET ${setClause} WHERE id = $${columns.length + 1} RETURNING id`,
      [...values, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sub-vertical not found.' });
    }

    res.json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A sub-vertical with this name already exists under the selected vertical.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PATCH /api/sub-verticals/:id/status  { is_active: true|false }
async function setStatus(req, res, next) {
  try {
    const { is_active } = req.body;
    const result = await db.query(
      'UPDATE sub_verticals SET is_active = $1 WHERE id = $2 RETURNING id',
      [is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sub-vertical not found.' });
    }

    res.json({ id: result.rows[0].id, is_active });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/sub-verticals/:id
async function remove(req, res, next) {
  try {
    const result = await db.query('DELETE FROM sub_verticals WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sub-vertical not found.' });
    }

    res.json({ message: 'Sub-vertical deleted.' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'This sub-vertical has policies linked to it and cannot be deleted. Deactivate it instead.',
      });
    }
    next(err);
  }
}

module.exports = { list, getById, create, update, setStatus, remove };
