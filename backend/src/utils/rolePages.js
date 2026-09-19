const db = require('../config/db');

// Which page keys a role can see, or null for admin ("every page") —
// shared by anything that needs to filter its own output down to what
// the caller's role is actually allowed to look at (alerts, dashboard
// summary counts).
async function pagesForRole(role) {
  if (role === 'admin') return null;
  const result = await db.query('SELECT page_key FROM role_permissions WHERE role = $1', [role]);
  return new Set(result.rows.map((r) => r.page_key));
}

module.exports = { pagesForRole };
