const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { PAGE_KEYS } = require('../config/pages');
const { validateFormats, normalizeFormats } = require('../utils/validators');

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
      `SELECT e.id, e.first_name, e.last_name, e.email, e.password_hash, e.role, e.is_active, r.is_elevated
       FROM employees e
       JOIN roles r ON r.key = e.role
       WHERE e.email = $1`,
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
      { id: employee.id, email: employee.email, role: employee.role, is_elevated: employee.is_elevated },
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
      is_elevated: employee.is_elevated,
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
      `SELECT e.id, e.first_name, e.last_name, e.email, e.role, r.is_elevated
       FROM employees e
       JOIN roles r ON r.key = e.role
       WHERE e.id = $1`,
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
      is_elevated: employee.is_elevated,
      permissions,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/profile — the logged-in employee's own full profile. No
// page gate (it's their own data, same reasoning as /tasks/mine and
// employee-scoped documents elsewhere in this app) — separate from `me()`
// above, which stays a lightweight call since it fires on every page load
// to restore a session, not just when someone visits their Profile page.
async function getProfile(req, res, next) {
  try {
    const result = await db.query(
      `SELECT e.id, e.first_name, e.last_name, e.email, e.role, e.phone, e.address,
              e.gender, e.date_of_birth, e.city_id, e.state_id,
              ci.name AS city_name, s.name AS state_name
       FROM employees e
       LEFT JOIN cities ci ON e.city_id = ci.id
       LEFT JOIN states s ON e.state_id = s.id
       WHERE e.id = $1`,
      [req.employee.id]
    );

    const employee = result.rows[0];
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    res.json(employee);
  } catch (err) {
    next(err);
  }
}

// Deliberately narrow: contact details only, not name/email (the login
// identifier), not role/salary/department/designation/reporting_to/
// aadhar/pan — those stay admin/HR-controlled via the normal Edit
// Employee flow (gated by the "employees" page), same boundary as every
// other "manage your own X" feature in this app.
const SELF_EDITABLE_FIELDS = ['phone', 'address', 'gender', 'date_of_birth', 'city_id', 'state_id'];

// PUT /api/auth/profile
async function updateProfile(req, res, next) {
  try {
    const fields = {};
    for (const f of SELF_EDITABLE_FIELDS) {
      if (req.body[f] !== undefined) {
        fields[f] = req.body[f] === '' ? null : req.body[f];
      }
    }
    const normalized = normalizeFormats(fields);

    if (Object.keys(normalized).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    const formatErrors = validateFormats(normalized);
    if (formatErrors.length > 0) {
      return res.status(400).json({ error: formatErrors.join(' ') });
    }

    const columns = Object.keys(normalized);
    const values = Object.values(normalized);
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

    await db.query(
      `UPDATE employees SET ${setClause} WHERE id = $${columns.length + 1}`,
      [...values, req.employee.id]
    );

    res.json({ message: 'Profile updated.' });
  } catch (err) {
    if (err.code === '23514') {
      return res.status(400).json({ error: 'One of the fields is not in a valid format. Please check the phone field.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'City or state does not refer to a valid record.' });
    }
    next(err);
  }
}

// PATCH /api/auth/password — self-service, requires the current password
// (unlike the admin-set-any-password flow in employeeController, which is
// a trusted elevated action and doesn't need it).
async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const result = await db.query('SELECT password_hash FROM employees WHERE id = $1', [req.employee.id]);
    const employee = result.rows[0];
    if (!employee || !employee.password_hash) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const currentMatches = await bcrypt.compare(current_password, employee.password_hash);
    if (!currentMatches) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE employees SET password_hash = $1 WHERE id = $2', [newHash, req.employee.id]);

    res.json({ message: 'Password changed.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, me, getProfile, updateProfile, changePassword };
