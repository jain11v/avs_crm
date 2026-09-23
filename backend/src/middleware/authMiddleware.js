const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Reads the JWT from the httpOnly cookie set at login, verifies it, and
// attaches the decoded payload to req.employee for downstream handlers.
function requireAuth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Not logged in.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.employee = decoded; // { id, email, role, is_elevated }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

// Optional helper for routes that should only be usable by certain roles,
// e.g. requireRole('admin') on a "manage employees" endpoint.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.employee || !allowedRoles.includes(req.employee.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}

// Gates a route by page-level permission (see role_permissions /
// config/pages.js) rather than a fixed role list. Admin always passes
// without a DB lookup — it can never be restricted, so there's no way to
// misconfigure your way into locking admins out.
function requirePage(pageKey) {
  return async (req, res, next) => {
    if (!req.employee) {
      return res.status(401).json({ error: 'Not logged in.' });
    }
    if (req.employee.role === 'admin') {
      return next();
    }
    try {
      const result = await db.query(
        'SELECT 1 FROM role_permissions WHERE role = $1 AND page_key = $2',
        [req.employee.role, pageKey]
      );
      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'You do not have access to this page.' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Gates a route to admin or any role flagged is_elevated (see the roles
// table) — the generic "manager-level" elevated-access check. Distinct
// from requireRole('admin') (strictly admin-only, never extends to
// elevated custom roles) and from requirePage (page-access matrix,
// unrelated to elevation).
function requireElevated(req, res, next) {
  if (!req.employee || !(req.employee.role === 'admin' || req.employee.is_elevated)) {
    return res.status(403).json({ error: 'You do not have permission to do that.' });
  }
  next();
}

module.exports = { requireAuth, requireRole, requirePage, requireElevated };
