const db = require('../config/db');
const { PAGES, PAGE_KEYS } = require('../config/pages');

// Every role except admin — admin is deliberately never a row in this
// matrix (it always bypasses page checks entirely, hardcoded in
// requirePage), so it's excluded here rather than relying on a DB
// constraint to keep it out.
async function assignableRoles() {
  const result = await db.query(
    "SELECT key, label FROM roles WHERE key != 'admin' ORDER BY is_builtin DESC, label"
  );
  return result.rows;
}

// GET /api/role-permissions
// Admin-only. Returns the page catalog, the assignable roles, and which
// pages each currently has.
async function getMatrix(req, res, next) {
  try {
    const roles = await assignableRoles();
    const result = await db.query('SELECT role, page_key FROM role_permissions');

    const matrix = Object.fromEntries(roles.map((r) => [r.key, []]));
    for (const row of result.rows) {
      if (matrix[row.role]) matrix[row.role].push(row.page_key);
    }

    res.json({ pages: PAGES, roles, matrix });
  } catch (err) {
    next(err);
  }
}

// PUT /api/role-permissions  { <roleKey>: [pageKey, ...], ... }
// Admin-only. Replaces the whole matrix in one go — simpler and safer than
// diffing individual toggles, and this table is small.
async function updateMatrix(req, res, next) {
  const client = await db.pool.connect();
  try {
    const roles = await assignableRoles();
    const roleKeys = roles.map((r) => r.key);

    const body = req.body || {};
    const rows = [];
    for (const role of roleKeys) {
      const pageKeys = Array.isArray(body[role]) ? body[role] : [];
      for (const key of pageKeys) {
        if (!PAGE_KEYS.includes(key)) {
          return res.status(400).json({ error: `Unknown page: ${key}.` });
        }
        rows.push([role, key]);
      }
    }
    for (const role of Object.keys(body)) {
      if (!roleKeys.includes(role)) {
        return res.status(400).json({ error: `Unknown role: ${role}.` });
      }
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM role_permissions');
    for (const [role, key] of rows) {
      await client.query('INSERT INTO role_permissions (role, page_key) VALUES ($1, $2)', [role, key]);
    }
    await client.query('COMMIT');
    res.json({ message: 'Permissions updated.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { getMatrix, updateMatrix };
