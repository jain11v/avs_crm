const db = require('../config/db');
const { pagesForRole } = require('../utils/rolePages');

// GET /api/dashboard/summary — a handful of headline numbers for the
// dashboard's stat cards. Each figure is only included if the caller's
// role can see the page it comes from (same permission source as
// alerts), so the frontend just renders whatever keys come back rather
// than deciding for itself what this employee is allowed to know.
async function getSummary(req, res, next) {
  try {
    const pages = await pagesForRole(req.employee.role);
    const hasPage = (key) => pages === null || pages.has(key);

    const summary = {};

    // Personal, not gated by page permission — same reasoning as
    // /tasks/mine: it's the caller's own data, not a company-wide figure.
    const myLostLeads = await db.query(
      `SELECT COUNT(*) FROM tasks WHERE assigned_to = $1 AND outcome = 'lost'`,
      [req.employee.id]
    );
    summary.my_lost_leads = parseInt(myLostLeads.rows[0].count);

    if (hasPage('customers')) {
      const result = await db.query('SELECT COUNT(*) FROM customers');
      summary.customers = parseInt(result.rows[0].count);
    }

    if (hasPage('policies')) {
      const active = await db.query(`SELECT COUNT(*) FROM policies WHERE status = 'Active'`);
      summary.active_policies = parseInt(active.rows[0].count);

      const thisMonth = await db.query(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(premium_amount), 0) AS premium
         FROM policies
         WHERE created_at >= date_trunc('month', CURRENT_DATE)`
      );
      summary.new_policies_this_month = parseInt(thisMonth.rows[0].cnt);
      summary.premium_this_month = Number(thisMonth.rows[0].premium);
    }

    res.json(summary);
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary };
