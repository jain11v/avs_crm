const db = require('../config/db');
const { PAGES, PAGE_KEYS, ROLES } = require('../config/pages');

// GET /api/role-permissions
// Admin-only. Returns the page catalog plus which pages each non-admin
// role currently has.
async function getMatrix(req, res, next) {
  try {
    const result = await db.query('SELECT role, page_key FROM role_permissions');
    const matrix = { employee: [], manager: [] };
    for (const row of result.rows) {
      matrix[row.role].push(row.page_key);
    }
    res.json({ pages: PAGES, roles: ROLES, matrix });
  } catch (err) {
    next(err);
  }
}

// PUT /api/role-permissions  { employee: [pageKey, ...], manager: [pageKey, ...] }
// Admin-only. Replaces the whole matrix in one go — simpler and safer than
// diffing individual toggles, and this table is small.
async function updateMatrix(req, res, next) {
  const client = await db.pool.connect();
  try {
    const body = req.body || {};
    const rows = [];
    for (const role of ROLES) {
      const pageKeys = Array.isArray(body[role]) ? body[role] : [];
      for (const key of pageKeys) {
        if (!PAGE_KEYS.includes(key)) {
          return res.status(400).json({ error: `Unknown page: ${key}.` });
        }
        rows.push([role, key]);
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
