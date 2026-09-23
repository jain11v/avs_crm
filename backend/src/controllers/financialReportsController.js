const db = require('../config/db');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Every real money movement already lives in one place — transactions —
// each row tagged with exactly one of expense_id / commission_receipt_id /
// customer_payment_id / insurer_payment_id / policy_adjustment_id (see
// migrations 004, 009, 015). 'approved' is the existing app-wide meaning
// of "counts as real money" (same as transactionController's balance
// calc). So all four widgets here are just different aggregations over
// that one table — no new source of truth, no accrual/estimation.
//
// Revenue = commission actually received from insurers. Premium collected
// from customers / paid to insurers is pass-through, not brokerage
// revenue, so it's excluded. Cashback (a real payout) counts as a cost
// against revenue; discounts never post a transaction at all, so they're
// excluded automatically.

// Defaults to the last 12 full months (including the current one) when no
// range is given — a reasonable glance-at-the-business window without
// forcing the caller to pick dates first.
function resolveRange(from, to) {
  const end = to || new Date().toISOString().slice(0, 10);
  let start = from;
  if (!start) {
    const d = new Date();
    d.setMonth(d.getMonth() - 11, 1);
    start = d.toISOString().slice(0, 10);
  }
  return { start, end };
}

// GET /api/financial-reports/summary?from=&to=&bank_id=
async function getSummary(req, res, next) {
  try {
    const { start, end } = resolveRange(req.query.from, req.query.to);
    const bankId = (req.query.bank_id || '').trim();

    const params = [start, end];
    let bankFilter = '';
    if (bankId) {
      params.push(bankId);
      bankFilter = ` AND t.bank_id = $${params.length}`;
    }
    const baseWhere = `t.status = 'approved' AND t.date_of_transaction BETWEEN $1 AND $2${bankFilter}`;

    const pnlResult = await db.query(
      `SELECT
         COALESCE(SUM(t.amount) FILTER (WHERE t.commission_receipt_id IS NOT NULL), 0) AS revenue,
         COALESCE(SUM(t.amount) FILTER (WHERE t.policy_adjustment_id IS NOT NULL), 0) AS cashback,
         COALESCE(SUM(t.amount) FILTER (WHERE t.expense_id IS NOT NULL), 0) AS expenses
       FROM transactions t
       WHERE ${baseWhere}`,
      params
    );
    const revenue = Number(pnlResult.rows[0].revenue);
    const cashback = Number(pnlResult.rows[0].cashback);
    const expenses = Number(pnlResult.rows[0].expenses);

    // Zero-filled via generate_series + LEFT JOIN rather than a plain
    // GROUP BY, so a month with no matching rows still appears as a $0
    // point instead of silently disappearing from the axis (which would
    // otherwise make the spacing between the remaining bars misleading).
    const monthSeries = `generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month') AS m(month)`;
    const bankJoinFilter = bankId ? ` AND t.bank_id = $${params.length}` : '';

    const cashflowResult = await db.query(
      `SELECT m.month,
              COALESCE(SUM(t.amount) FILTER (WHERE t.type_of_transaction = 'Credit'), 0) AS inflow,
              COALESCE(SUM(t.amount) FILTER (WHERE t.type_of_transaction = 'Debit'), 0) AS outflow
       FROM ${monthSeries}
       LEFT JOIN transactions t
         ON date_trunc('month', t.date_of_transaction) = m.month
        AND t.status = 'approved'${bankJoinFilter}
       GROUP BY m.month
       ORDER BY m.month`,
      params
    );

    const revenueTrendResult = await db.query(
      `SELECT m.month, COALESCE(SUM(t.amount), 0) AS amount
       FROM ${monthSeries}
       LEFT JOIN transactions t
         ON date_trunc('month', t.date_of_transaction) = m.month
        AND t.status = 'approved' AND t.commission_receipt_id IS NOT NULL${bankJoinFilter}
       GROUP BY m.month
       ORDER BY m.month`,
      params
    );

    const expenseByCategoryResult = await db.query(
      `SELECT COALESCE(h.name, 'Uncategorized') AS head, COALESCE(SUM(t.amount), 0) AS amount
       FROM transactions t
       LEFT JOIN heads h ON t.head = h.id
       WHERE ${baseWhere} AND t.expense_id IS NOT NULL
       GROUP BY h.name
       ORDER BY amount DESC`,
      params
    );

    res.json({
      from: start,
      to: end,
      pnl: {
        revenue: round2(revenue),
        cashback: round2(cashback),
        expenses: round2(expenses),
        net: round2(revenue - cashback - expenses),
      },
      cashflow: cashflowResult.rows.map((r) => ({
        month: r.month,
        inflow: round2(Number(r.inflow)),
        outflow: round2(Number(r.outflow)),
        net: round2(Number(r.inflow) - Number(r.outflow)),
      })),
      revenue_trend: revenueTrendResult.rows.map((r) => ({ month: r.month, amount: round2(Number(r.amount)) })),
      expense_by_category: expenseByCategoryResult.rows.map((r) => ({ head: r.head, amount: round2(Number(r.amount)) })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary };
