const db = require('../config/db');

// Custom roles (beyond the fixed employee/manager/admin trio) — CRUD here,
// but is_builtin rows can never be edited or deleted (see the guards
// below), and every row's key is what employees.role and role_permissions
// actually reference, so it's derived once at creation and never changed
// afterward (see deriveKey/create).

function deriveKey(label) {
  return (label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// GET /api/roles
async function list(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, key, label, is_builtin, is_elevated FROM roles ORDER BY is_builtin DESC, label'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

// GET /api/roles/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, key, label, is_builtin, is_elevated FROM roles WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/roles  { label, is_elevated }
// No `key` field taken from the client — it's derived from the label and
// never editable afterward, since it's what gets baked into JWTs and two
// other tables' foreign keys once the role is actually used.
async function create(req, res, next) {
  try {
    const { label, is_elevated } = req.body;
    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Label is required.' });
    }

    const key = deriveKey(label);
    if (!key) {
      return res.status(400).json({ error: 'Label must contain at least one letter or number.' });
    }

    const result = await db.query(
      `INSERT INTO roles (key, label, is_builtin, is_elevated)
       VALUES ($1, $2, false, $3)
       RETURNING id`,
      [key, label.trim(), Boolean(is_elevated)]
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A role with a similar name already exists.' });
    }
    next(err);
  }
}

// PUT /api/roles/:id  { label?, is_elevated? }
async function update(req, res, next) {
  try {
    const existing = await db.query('SELECT is_builtin FROM roles WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found.' });
    }
    if (existing.rows[0].is_builtin) {
      return res.status(403).json({ error: 'Built-in roles cannot be edited.' });
    }

    const fields = {};
    if (req.body.label !== undefined) fields.label = req.body.label;
    if (req.body.is_elevated !== undefined) fields.is_elevated = Boolean(req.body.is_elevated);

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }
    if ('label' in fields && !fields.label.trim()) {
      return res.status(400).json({ error: 'Label cannot be cleared.' });
    }

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

    const result = await db.query(
      `UPDATE roles SET ${setClause} WHERE id = $${columns.length + 1} RETURNING id`,
      [...values, req.params.id]
    );

    res.json({ id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/roles/:id
async function remove(req, res, next) {
  try {
    const existing = await db.query('SELECT is_builtin FROM roles WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found.' });
    }
    if (existing.rows[0].is_builtin) {
      return res.status(403).json({ error: 'Built-in roles cannot be deleted.' });
    }

    await db.query('DELETE FROM roles WHERE id = $1', [req.params.id]);
    res.json({ message: 'Role deleted.' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'This role is still assigned to one or more employees and cannot be deleted. Reassign those employees first.',
      });
    }
    next(err);
  }
}

module.exports = { list, getById, create, update, remove };
