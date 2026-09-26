const db = require('../config/db');

// Running net balance from bank_entries linked to an insurer — same
// convention as employeeBalanceController.js: a Credit adds, a Debit
// subtracts. In practice this tracks faulty duplicate premium payments: a
// policy is paid to the insurer only once (insurer_payments is unique per
// policy), so a second bank debit is recorded as a Debit bank entry linked
// to the insurer (negative balance = insurer owes us) and cleared by the
// Credit entry when the insurer reverses it. Only insurers with at least
// one linked entry show up.
function balanceQuery(whereClause) {
  return `
    SELECT i.id AS insurer_id, i.name AS insurer_name,
           COALESCE(SUM(CASE WHEN be.type_of_transaction = 'Credit' THEN be.amount ELSE -be.amount END), 0) AS balance
    FROM insurers i
    JOIN bank_entries be ON be.insurer_id = i.id
    ${whereClause}
    GROUP BY i.id, i.name
  `;
}

function balanceFilters(req) {
  const search = (req.query.search || '').trim();
  const conditions = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`i.name ILIKE $${params.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

// GET /api/insurer-balances?search=&page=&limit=
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
       ORDER BY ABS(COALESCE(SUM(CASE WHEN be.type_of_transaction = 'Credit' THEN be.amount ELSE -be.amount END), 0)) DESC, insurer_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/insurer-balances/:insurerId — the raw linked entries behind the total.
async function getByInsurer(req, res, next) {
  try {
    const insurerId = req.params.insurerId;

    const insurerResult = await db.query('SELECT id, name FROM insurers WHERE id = $1', [insurerId]);
    if (insurerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Insurer not found.' });
    }

    const entriesResult = await db.query(
      `SELECT be.id, be.entry_date, be.type_of_transaction, be.amount, be.remarks,
              ba.name AS bank_account_name, h.name AS head_name
       FROM bank_entries be
       LEFT JOIN bank_accounts ba ON be.bank_account_id = ba.id
       LEFT JOIN heads h ON be.head_id = h.id
       WHERE be.insurer_id = $1
       ORDER BY be.entry_date DESC, be.id DESC`,
      [insurerId]
    );

    const balance = entriesResult.rows.reduce(
      (sum, r) => sum + (r.type_of_transaction === 'Credit' ? Number(r.amount) : -Number(r.amount)),
      0
    );

    res.json({
      insurer_id: insurerResult.rows[0].id,
      insurer_name: insurerResult.rows[0].name,
      balance,
      entries: entriesResult.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getByInsurer };
