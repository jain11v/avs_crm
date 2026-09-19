const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { validateFormats, normalizeFormats } = require('../utils/validators');

const FK_FIELD_NAMES = {
  employees_city_id_fkey: 'City',
  employees_state_id_fkey: 'State',
  employees_reporting_to_fkey: 'Reporting manager',
  employees_reporting_branch_fkey: 'Reporting branch',
  employees_department_id_fkey: 'Department',
  employees_designation_id_fkey: 'Designation',
  customers_employee_id_fkey: 'Employee',
  policies_user_id_fkey: 'Employee',
  policies_telecaller_fkey: 'Employee',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

function friendlyCheckError(err) {
  if (err.constraint === 'employees_role_check') {
    return 'Role must be one of: employee, manager, admin.';
  }
  if (err.constraint === 'employees_gender_check') {
    return 'Gender must be one of: Male, Female.';
  }
  return 'One of the fields is not in a valid format. Please check phone, Aadhar, and PAN fields.';
}

// GET /api/employees?q=&department_id=&page=&limit=
async function list(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const departmentId = (req.query.department_id || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(e.first_name ILIKE $${params.length} OR e.last_name ILIKE $${params.length} OR e.email ILIKE $${params.length} OR e.phone ILIKE $${params.length})`);
    }
    if (departmentId) {
      params.push(departmentId);
      conditions.push(`e.department_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = await db.query(
      `SELECT COUNT(*) FROM employees e ${whereClause}`,
      params
    );
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT e.id, e.first_name, e.last_name, e.email, e.phone, e.role, e.is_active,
              (e.password_hash IS NOT NULL) AS has_login,
              bd.name AS department_name, d.title AS designation_title
       FROM employees e
       LEFT JOIN broker_departments bd ON e.department_id = bd.id
       LEFT JOIN designations d ON e.designation_id = d.id
       ${whereClause}
       ORDER BY e.first_name, e.last_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/employees/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT e.*, ci.name AS city_name, s.name AS state_name,
              bd.name AS department_name, d.title AS designation_title,
              bb.name AS reporting_branch_name,
              rm.first_name AS reporting_to_first_name, rm.last_name AS reporting_to_last_name
       FROM employees e
       LEFT JOIN cities ci ON e.city_id = ci.id
       LEFT JOIN states s ON e.state_id = s.id
       LEFT JOIN broker_departments bd ON e.department_id = bd.id
       LEFT JOIN designations d ON e.designation_id = d.id
       LEFT JOIN broker_branches bb ON e.reporting_branch = bb.id
       LEFT JOIN employees rm ON e.reporting_to = rm.id
       WHERE e.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const employee = result.rows[0];
    delete employee.password_hash;
    res.json(employee);
  } catch (err) {
    next(err);
  }
}

const EDITABLE_FIELDS = [
  'first_name', 'last_name', 'gender', 'email', 'phone', 'address',
  'city_id', 'state_id', 'salary', 'date_of_birth', 'date_of_joining', 'date_of_resign',
  'aadhar', 'pan', 'business_expected', 'reporting_to', 'reporting_branch',
  'department_id', 'designation_id', 'role',
];

const REQUIRED_FIELDS = ['first_name', 'last_name', 'email'];

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

// POST /api/employees
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
      `INSERT INTO employees (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
      values
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An employee with this email already exists.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: friendlyCheckError(err) });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PUT /api/employees/:id
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
      `UPDATE employees SET ${setClause} WHERE id = $${columns.length + 1} RETURNING id`,
      [...values, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    res.json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An employee with this email already exists.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: friendlyCheckError(err) });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PATCH /api/employees/:id/status  { is_active: true|false }
async function setStatus(req, res, next) {
  try {
    const { is_active } = req.body;
    const result = await db.query(
      'UPDATE employees SET is_active = $1 WHERE id = $2 RETURNING id',
      [is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    res.json({ id: result.rows[0].id, is_active });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/employees/:id
async function remove(req, res, next) {
  try {
    const result = await db.query('DELETE FROM employees WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    res.json({ message: 'Employee deleted.' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'This employee has customers, policies, or other staff linked to them and cannot be deleted. Deactivate them instead.',
      });
    }
    next(err);
  }
}

// PATCH /api/employees/:id/credentials  { password?, role? }
// Admin-only (enforced in the route). This is the "create new user" /
// "reset password" action on the admin page: an employee record has no
// login until an admin sets a password here, and role can be changed in
// the same request. At least one of the two must be given.
const ROLES = ['employee', 'manager', 'admin'];

async function setCredentials(req, res, next) {
  try {
    const { password, role } = req.body;

    if (password === undefined && role === undefined) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }
    if (password !== undefined && (!password || password.length < 6)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (role !== undefined && !ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role must be one of: employee, manager, admin.' });
    }

    const setClauses = [];
    const values = [];
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      values.push(hash);
      setClauses.push(`password_hash = $${values.length}`);
    }
    if (role) {
      values.push(role);
      setClauses.push(`role = $${values.length}`);
    }
    values.push(req.params.id);

    const result = await db.query(
      `UPDATE employees SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING id`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    res.json({ id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, setStatus, remove, setCredentials };
