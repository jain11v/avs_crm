const db = require('../config/db');

// GET /api/transactions?bank_id=&type=&status=&q=&page=&limit=
// Every account keeps its own running balance (a passbook-style ledger):
// when looking at a single account it's read oldest-first like a real
// ledger; across all accounts it's a recent-first activity log instead.
// The running balance is always computed over the account's full history
// before pagination is applied, so it stays correct across pages.
//
// A row appears here the moment its expense is submitted (status
// 'pending') — but only 'approved' rows count toward the balance, so
// spend that hasn't been authorized yet is visible without affecting the
// real account balance.
//
// Read-only: transactions are never created or edited through this API.
// Every row is posted automatically by expenseController (create/decide)
// — there is no manual entry path.
async function list(req, res, next) {
  try {
    const bankId = (req.query.bank_id || '').trim();
    const type = (req.query.type || '').trim();
    const status = (req.query.status || '').trim();
    const q = (req.query.q || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (bankId) {
      params.push(bankId);
      conditions.push(`t.bank_id = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`t.type_of_transaction = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(t.remarks ILIKE $${params.length} OR t.reference_id ILIKE $${params.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = bankId
      ? 'ORDER BY t.date_of_transaction ASC, t.id ASC'
      : 'ORDER BY t.date_of_transaction DESC, t.id DESC';

    const totalResult = await db.query(
      `SELECT COUNT(*) FROM transactions t ${whereClause}`,
      params
    );
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT t.id, t.date_of_transaction, t.type_of_transaction, t.amount, t.reference_id, t.remarks,
              t.expense_id, t.status, ba.name AS bank_account_name, h.name AS head_name,
              p.policy_number,
              u.first_name AS user_first_name, u.last_name AS user_last_name,
              SUM(CASE WHEN t.status = 'approved'
                       THEN (CASE WHEN t.type_of_transaction = 'Credit' THEN t.amount ELSE -t.amount END)
                       ELSE 0 END)
                OVER (PARTITION BY t.bank_id ORDER BY t.date_of_transaction ASC, t.id ASC) AS running_balance
       FROM transactions t
       LEFT JOIN bank_accounts ba ON t.bank_id = ba.id
       LEFT JOIN heads h ON t.head = h.id
       LEFT JOIN policies p ON t.policy_id = p.id
       LEFT JOIN employees u ON t.user_id = u.id
       ${whereClause}
       ${orderClause}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    let balance = null;
    if (bankId) {
      const balanceResult = await db.query(
        `SELECT COALESCE(SUM(CASE WHEN type_of_transaction = 'Credit' THEN amount ELSE -amount END), 0) AS balance
         FROM transactions WHERE bank_id = $1 AND status = 'approved'`,
        [bankId]
      );
      balance = balanceResult.rows[0].balance;
    }

    res.json({ data: dataResult.rows, total, page, limit, balance });
  } catch (err) {
    next(err);
  }
}

// GET /api/transactions/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT t.*, ba.name AS bank_account_name, h.name AS head_name,
              p.policy_number,
              u.first_name AS user_first_name, u.last_name AS user_last_name
       FROM transactions t
       LEFT JOIN bank_accounts ba ON t.bank_id = ba.id
       LEFT JOIN heads h ON t.head = h.id
       LEFT JOIN policies p ON t.policy_id = p.id
       LEFT JOIN employees u ON t.user_id = u.id
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById };
