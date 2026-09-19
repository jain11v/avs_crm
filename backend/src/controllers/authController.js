const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { PAGE_KEYS } = require('../config/pages');

// Admin has every page, always — permissions aren't consulted for admin
// anywhere (see requirePage), this just keeps the frontend's nav/route
// gating in sync with that same rule.
async function getPermissionsForRole(role) {
  if (role === 'admin') {
    return PAGE_KEYS;
  }
  const result = await db.query('SELECT page_key FROM role_permissions WHERE role = $1', [role]);
  return result.rows.map((r) => r.page_key);
}

const COOKIE_OPTIONS = {
  httpOnly: true, // JS on the page can't read this cookie — blocks XSS token theft
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'lax', // sent on normal navigation, blocked on cross-site POSTs (CSRF mitigation)
  maxAge: 8 * 60 * 60 * 1000, // 8 hours, matches JWT_EXPIRES_IN
};

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await db.query(
      `SELECT id, first_name, last_name, email, password_hash, role, is_active
       FROM employees
       WHERE email = $1`,
      [email]
    );

    const employee = result.rows[0];

    // Same error message whether the email doesn't exist or the password is
    // wrong — don't reveal which one it was, that helps attackers enumerate
    // valid emails.
    if (!employee || !employee.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!employee.is_active) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }

    const passwordMatches = await bcrypt.compare(password, employee.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: employee.id, email: employee.email, role: employee.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await db.query('UPDATE employees SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [employee.id]);
    const permissions = await getPermissionsForRole(employee.role);

    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({
      id: employee.id,
      name: `${employee.first_name} ${employee.last_name}`,
      email: employee.email,
      role: employee.role,
      permissions,
    });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  res.clearCookie('token', COOKIE_OPTIONS);
  res.json({ message: 'Logged out.' });
}

async function me(req, res, next) {
  try {
    const result = await db.query(
      `SELECT id, first_name, last_name, email, role
       FROM employees WHERE id = $1`,
      [req.employee.id]
    );

    const employee = result.rows[0];
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const permissions = await getPermissionsForRole(employee.role);

    res.json({
      id: employee.id,
      name: `${employee.first_name} ${employee.last_name}`,
      email: employee.email,
      role: employee.role,
      permissions,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, me };
