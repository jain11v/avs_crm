const db = require('../config/db');

// Running net balance from bank_entries linked to an employee — a Credit
// entry adds to the total, a Debit subtracts. Only employees with at least
// one linked entry show up (same convention as customer balances: no row
// for someone with nothing to show). Unlike Customer Balances, there's no
// second "policy premium" concept to fold in here — this is the only kind
// of balance an employee has.
function balanceQuery(whereClause) {
  return `
    SELECT e.id AS employee_id, e.first_name, e.last_name,
           COALESCE(SUM(CASE WHEN be.type_of_transaction = 'Credit' THEN be.amount ELSE -be.amount END), 0) AS balance
    FROM employees e
    JOIN bank_entries be ON be.employee_id = e.id
    ${whereClause}
    GROUP BY e.id, e.first_name, e.last_name
  `;
}

function balanceFilters(req) {
  const search = (req.query.search || '').trim();
  const conditions = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(e.first_name ILIKE $${params.length} OR e.last_name ILIKE $${params.length})`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

// GET /api/employee-balances?search=&page=&limit=
async function list(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const { whereClause, params } = balanceFilters(req);

    const totalResult = await db.query(`SELECT COUNT(*) FROM (${balanceQuery(whereClause)}) sub`, params);
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `${balanceQuery(whereClause)}
       ORDER BY ABS(COALESCE(SUM(CASE WHEN be.type_of_transaction = 'Credit' THEN be.amount ELSE -be.amount END), 0)) DESC, first_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/employee-balances/:employeeId — the raw linked entries behind the total.
async function getByEmployee(req, res, next) {
  try {
    const employeeId = req.params.employeeId;

    const employeeResult = await db.query('SELECT id, first_name, last_name FROM employees WHERE id = $1', [employeeId]);
    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const entriesResult = await db.query(
      `SELECT be.id, be.entry_date, be.type_of_transaction, be.amount, be.remarks,
              ba.name AS bank_account_name, h.name AS head_name
       FROM bank_entries be
       LEFT JOIN bank_accounts ba ON be.bank_account_id = ba.id
       LEFT JOIN heads h ON be.head_id = h.id
       WHERE be.employee_id = $1
       ORDER BY be.entry_date DESC, be.id DESC`,
      [employeeId]
    );

    const balance = entriesResult.rows.reduce(
      (sum, r) => sum + (r.type_of_transaction === 'Credit' ? Number(r.amount) : -Number(r.amount)),
      0
    );

    res.json({
      employee_id: employeeResult.rows[0].id,
      employee_name: `${employeeResult.rows[0].first_name} ${employeeResult.rows[0].last_name}`,
      balance,
      entries: entriesResult.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getByEmployee };
