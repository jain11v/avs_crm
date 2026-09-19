const db = require('../config/db');

const FK_FIELD_NAMES = {
  sub_verticals_vertical_id_fkey: 'Vertical',
  policies_vertical_id_fkey: 'Vertical',
  policies_sub_vertical_id_fkey: 'Sub-vertical',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

// GET /api/verticals?q=&page=&limit=
async function list(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const searchClause = q ? `WHERE v.name ILIKE $1` : '';
    const params = q ? [`%${q}%`] : [];

    const totalResult = await db.query(
      `SELECT COUNT(*) FROM verticals v ${searchClause}`,
      params
    );
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT v.id, v.name, v.description, v.is_active,
              e.first_name AS head_first_name, e.last_name AS head_last_name
       FROM verticals v
       LEFT JOIN employees e ON v.vertical_head = e.id
       ${searchClause}
       ORDER BY v.name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/verticals/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT v.*, e.first_name AS head_first_name, e.last_name AS head_last_name
       FROM verticals v
       LEFT JOIN employees e ON v.vertical_head = e.id
       WHERE v.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vertical not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

const EDITABLE_FIELDS = ['name', 'vertical_head', 'description'];

function pickFields(body) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      out[field] = body[field] === '' ? null : body[field];
    }
  }
  return out;
}

// POST /api/verticals
async function create(req, res, next) {
  try {
    const fields = pickFields(req.body);

    if (!fields.name) {
      return res.status(400).json({ error: 'Name is required.' });
    }

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    const result = await db.query(
      `INSERT INTO verticals (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
      values
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A vertical with this name already exists.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PUT /api/verticals/:id
async function update(req, res, next) {
  try {
    const fields = pickFields(req.body);

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    if ('name' in fields && !fields.name) {
      return res.status(400).json({ error: 'Name cannot be cleared.' });
    }

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

    const result = await db.query(
      `UPDATE verticals SET ${setClause} WHERE id = $${columns.length + 1} RETURNING id`,
      [...values, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vertical not found.' });
    }

    res.json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A vertical with this name already exists.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PATCH /api/verticals/:id/status  { is_active: true|false }
async function setStatus(req, res, next) {
  try {
    const { is_active } = req.body;
    const result = await db.query(
      'UPDATE verticals SET is_active = $1 WHERE id = $2 RETURNING id',
      [is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vertical not found.' });
    }

    res.json({ id: result.rows[0].id, is_active });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/verticals/:id
async function remove(req, res, next) {
  try {
    const result = await db.query('DELETE FROM verticals WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vertical not found.' });
    }

    res.json({ message: 'Vertical deleted.' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'This vertical (or one of its sub-verticals) has policies linked to it and cannot be deleted. Deactivate it instead.',
      });
    }
    next(err);
  }
}

module.exports = { list, getById, create, update, setStatus, remove };
