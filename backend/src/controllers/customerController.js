const db = require('../config/db');
const { validateFormats, normalizeFormats } = require('../utils/validators');
const { restrictedSearch } = require('../utils/restrictedSearch');

// Maps a Postgres foreign key constraint name to a plain-English field name,
// so "violates foreign key constraint customers_branch_id_fkey" becomes
// something a person filling out the form can actually act on.
const FK_FIELD_NAMES = {
  customers_city_id_fkey: 'City',
  customers_state_id_fkey: 'State',
  customers_employee_id_fkey: 'Assigned employee',
  customers_branch_id_fkey: 'Branch',
  customers_customer_type_id_fkey: 'Customer type',
  customers_source_id_fkey: 'Source',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

// GET /api/customers?q=search&page=1&limit=20
async function list(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const search = restrictedSearch(req, q);
    if (search.blocked) return res.json(search.blocked);
    const { page, limit, offset } = search;

    // Name alone isn't enough to find someone in a database of thousands —
    // many customers share a name, and most don't have an email on file.
    // Address, city, and state are the fields people actually recognize a
    // customer by, so the search (and the picker UI built on top of it)
    // needs to match against those too, not just name/email/phone.
    const searchClause = q
      ? `WHERE c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1
         OR c.address ILIKE $1 OR ci.name ILIKE $1 OR s.name ILIKE $1`
      : '';
    const params = q ? [`%${q}%`] : [];

    const totalResult = await db.query(
      `SELECT COUNT(*)
       FROM customers c
       LEFT JOIN cities ci ON c.city_id = ci.id
       LEFT JOIN states s ON c.state_id = s.id
       ${searchClause}`,
      params
    );
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT c.id, c.title, c.name, c.email, c.phone, c.address, c.dob,
              ct.name AS type_of_customer, c.priority_level, c.is_active,
              ci.name AS city_name, s.name AS state_name,
              CASE WHEN c.aadhar IS NOT NULL THEN 'XXXX-XXXX-' || RIGHT(c.aadhar, 4) END AS aadhar_masked
       FROM customers c
       LEFT JOIN cities ci ON c.city_id = ci.id
       LEFT JOIN states s ON c.state_id = s.id
       LEFT JOIN customer_types ct ON c.customer_type_id = ct.id
       ${searchClause}
       ORDER BY c.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/customers/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT c.*, ci.name AS city_name, s.name AS state_name,
              e.first_name AS employee_first_name, e.last_name AS employee_last_name,
              b.name AS branch_name, ct.name AS customer_type_name, cs.name AS source_name
       FROM customers c
       LEFT JOIN cities ci ON c.city_id = ci.id
       LEFT JOIN states s ON c.state_id = s.id
       LEFT JOIN employees e ON c.employee_id = e.id
       LEFT JOIN broker_branches b ON c.branch_id = b.id
       LEFT JOIN customer_types ct ON c.customer_type_id = ct.id
       LEFT JOIN customer_sources cs ON c.source_id = cs.id
       WHERE c.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

const EDITABLE_FIELDS = [
  'title', 'name', 'gender', 'email', 'phone', 'address',
  'city_id', 'state_id', 'aadhar', 'pan', 'gst', 'dob',
  'customer_type_id', 'priority_level', 'employee_id', 'branch_id', 'source_id',
];

function pickFields(body) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    // Allow explicit null (clearing a field) but skip keys that weren't sent at all.
    if (body[field] !== undefined) {
      out[field] = body[field] === '' ? null : body[field];
    }
  }
  return out;
}

const REQUIRED_ON_CREATE = [
  'name', 'gender', 'address', 'phone', 'state_id', 'city_id',
  'customer_type_id', 'priority_level', 'branch_id', 'source_id',
];

// POST /api/customers
// employee_id is never taken from the client here — it's always whoever is
// creating the record, not a pickable "assigned employee" field.
async function create(req, res, next) {
  try {
    const fields = pickFields(normalizeFormats(req.body));
    fields.employee_id = req.employee.id;

    const missing = REQUIRED_ON_CREATE.filter((f) => !fields[f]);
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
      `INSERT INTO customers (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
      values
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A customer with this email already exists.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'One of the fields is not in a valid format. Please check phone, Aadhar, PAN, and GST fields.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PUT /api/customers/:id
async function update(req, res, next) {
  try {
    const fields = pickFields(normalizeFormats(req.body));

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    const formatErrors = validateFormats(fields);
    if (formatErrors.length > 0) {
      return res.status(400).json({ error: formatErrors.join(' ') });
    }

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

    const result = await db.query(
      `UPDATE customers SET ${setClause} WHERE id = $${columns.length + 1} RETURNING id`,
      [...values, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    res.json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A customer with this email already exists.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'One of the fields is not in a valid format. Please check phone, Aadhar, PAN, and GST fields.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PATCH /api/customers/:id/status  { is_active: true|false }
async function setStatus(req, res, next) {
  try {
    const { is_active } = req.body;
    const result = await db.query(
      'UPDATE customers SET is_active = $1 WHERE id = $2 RETURNING id',
      [is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    res.json({ id: result.rows[0].id, is_active });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/customers/:id
async function remove(req, res, next) {
  try {
    const result = await db.query('DELETE FROM customers WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    res.json({ message: 'Customer deleted.' });
  } catch (err) {
    // Foreign key violation — customer has policies (or other records) linked to them.
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'This customer has policies or other records linked to them and cannot be deleted. Deactivate them instead.',
      });
    }
    next(err);
  }
}

// GET /api/customers/check-duplicate?name=&phone=
// Best-effort "is this person already in the system" check for the
// add-customer flows — same name (case-insensitive, whole name) or same
// phone number. Deliberately narrower than the general search (which also
// matches on address/city/state) so it only flags things worth a second
// look before creating a new record.
async function checkDuplicate(req, res, next) {
  try {
    const name = (req.query.name || '').trim();
    const phone = (req.query.phone || '').trim();

    if (!name && !phone) {
      return res.json([]);
    }

    const conditions = [];
    const params = [];
    if (name) {
      params.push(name);
      conditions.push(`c.name ILIKE $${params.length}`);
    }
    if (phone) {
      params.push(phone);
      conditions.push(`c.phone = $${params.length}`);
    }

    const result = await db.query(
      `SELECT c.id, c.title, c.name, c.phone, c.email, c.address, c.dob,
              ci.name AS city_name, s.name AS state_name
       FROM customers c
       LEFT JOIN cities ci ON c.city_id = ci.id
       LEFT JOIN states s ON c.state_id = s.id
       WHERE ${conditions.join(' OR ')}
       ORDER BY c.created_at DESC
       LIMIT 5`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, setStatus, remove, checkDuplicate };
