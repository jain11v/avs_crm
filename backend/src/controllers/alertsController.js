const db = require('../config/db');
const { pagesForRole } = require('../utils/rolePages');
const { selfAndDescendantIds } = require('../utils/orgHierarchy');

// No stored/scheduled notifications here — there's no cron in this app and
// no email/SMS credentials to send anything externally, so alerts are
// computed live from current data every time this is called. That also
// means an alert disappears the moment its underlying condition is
// resolved, with no "mark as read" bookkeeping needed.

// GET /api/alerts
async function getAlerts(req, res, next) {
  try {
    const role = req.employee.role;
    const pages = await pagesForRole(role);
    const hasPage = (key) => pages === null || pages.has(key);

    const alerts = [];

    // Computed once, shared by every block below scoped to "self + whoever
    // reports up to me" (renewals_due, tasks_overdue) — admin stays null
    // (unscoped, sees everything), matching selfAndDescendantIds' one other
    // caller pattern (performanceController.js).
    const hierarchyIds = role !== 'admin' ? await selfAndDescendantIds(req.employee.id) : null;

    if (hasPage('renewals')) {
      // Scoped by ownership (policies.user_id) for anyone but admin — same
      // rule as policyController.getRenewalsDue(): an employee only gets
      // notified about their own due renewals, a manager also gets
      // notified about their team's.
      const ownerParams = [];
      let ownerFilter = '';
      if (hierarchyIds) {
        ownerParams.push(hierarchyIds);
        ownerFilter = `AND p.user_id = ANY($${ownerParams.length})`;
      }

      const result = await db.query(
        `SELECT p.id, p.policy_number, p.policy_end_date, c.name AS customer_name
         FROM policies p
         LEFT JOIN customers c ON p.customer_id = c.id
         WHERE p.renewable = true AND p.status IN ('Active', 'Not Renewed')
           AND p.policy_end_date <= CURRENT_DATE + INTERVAL '30 days'
           AND NOT EXISTS (SELECT 1 FROM policies r WHERE r.renewed_from_policy_id = p.id)
           ${ownerFilter}
         ORDER BY p.policy_end_date ASC
         LIMIT 5`,
        ownerParams
      );
      const countResult = await db.query(
        `SELECT COUNT(*) FROM policies p
         WHERE p.renewable = true AND p.status IN ('Active', 'Not Renewed')
           AND p.policy_end_date <= CURRENT_DATE + INTERVAL '30 days'
           AND NOT EXISTS (SELECT 1 FROM policies r WHERE r.renewed_from_policy_id = p.id)
           ${ownerFilter}`,
        ownerParams
      );
      const count = parseInt(countResult.rows[0].count);
      if (count > 0) {
        alerts.push({
          type: 'renewals_due',
          count,
          message: `${count} polic${count === 1 ? 'y' : 'ies'} due for renewal within 30 days`,
          viewAllLink: '/renewals',
          items: result.rows.map((r) => ({
            label: `${r.policy_number} — ${r.customer_name || 'Unknown'} (due ${new Date(r.policy_end_date).toLocaleDateString('en-IN')})`,
            link: `/policies/${r.id}/edit`,
          })),
        });
      }
    }

    {
      // Tasks have no page permission at all (self-service /tasks/mine is
      // ungated for everyone), so this block is unconditional too — same
      // reasoning as the dashboard's own my_lost_leads stat. Reuses the
      // same hierarchy scope as renewals_due just above: an employee with
      // no reports only sees their own overdue tasks (already visible in
      // their own list); a manager additionally sees their team's, which
      // is the actual gap this closes — nothing today tells a manager one
      // of their reports let a task slip.
      const scopeParams = [];
      let scopeFilter = '';
      if (hierarchyIds) {
        scopeParams.push(hierarchyIds);
        scopeFilter = `AND t.assigned_to = ANY($${scopeParams.length})`;
      }

      const result = await db.query(
        `SELECT t.id, t.title, t.due_date, t.assigned_to, e.first_name, e.last_name
         FROM tasks t
         JOIN employees e ON t.assigned_to = e.id
         WHERE t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE
           ${scopeFilter}
         ORDER BY t.due_date ASC
         LIMIT 5`,
        scopeParams
      );
      const countResult = await db.query(
        `SELECT COUNT(*) FROM tasks t
         WHERE t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE
           ${scopeFilter}`,
        scopeParams
      );
      const count = parseInt(countResult.rows[0].count);
      if (count > 0) {
        alerts.push({
          type: 'tasks_overdue',
          count,
          message: `${count} task${count === 1 ? '' : 's'} overdue`,
          viewAllLink: null,
          items: result.rows.map((r) => ({
            label: `${r.title} — ${r.first_name} ${r.last_name} (due ${new Date(r.due_date).toLocaleDateString('en-IN')})`,
            link: `/employees/${r.assigned_to}/edit`,
          })),
        });
      }
    }

    if (hasPage('commission_reconciliation')) {
      const result = await db.query(
        `SELECT p.id, p.policy_number, p.policy_start_date, c.name AS customer_name
         FROM commission cm
         JOIN policies p ON cm.policy_id = p.id
         LEFT JOIN customers c ON p.customer_id = c.id
         LEFT JOIN commission_receipts cr ON cr.policy_id = p.id
         WHERE cr.id IS NULL AND p.policy_start_date <= CURRENT_DATE - INTERVAL '45 days'
         ORDER BY p.policy_start_date ASC
         LIMIT 5`
      );
      const countResult = await db.query(
        `SELECT COUNT(*) FROM commission cm
         JOIN policies p ON cm.policy_id = p.id
         LEFT JOIN commission_receipts cr ON cr.policy_id = p.id
         WHERE cr.id IS NULL AND p.policy_start_date <= CURRENT_DATE - INTERVAL '45 days'`
      );
      const count = parseInt(countResult.rows[0].count);
      if (count > 0) {
        alerts.push({
          type: 'commission_overdue',
          count,
          message: `${count} polic${count === 1 ? 'y' : 'ies'} with commission still unreceived after 45+ days`,
          viewAllLink: '/commission-reconciliation?status=pending',
          items: result.rows.map((r) => ({
            label: `${r.policy_number} — ${r.customer_name || 'Unknown'} (started ${new Date(r.policy_start_date).toLocaleDateString('en-IN')})`,
            link: '/commission-reconciliation',
          })),
        });
      }
    }

    if (hasPage('customers')) {
      const result = await db.query(
        `SELECT n.id, n.follow_up_date, c.id AS customer_id, c.name AS customer_name
         FROM customer_notes n
         JOIN customers c ON n.customer_id = c.id
         WHERE n.follow_up_date IS NOT NULL AND NOT n.follow_up_done
           AND n.follow_up_date <= CURRENT_DATE
         ORDER BY n.follow_up_date ASC
         LIMIT 5`
      );
      const countResult = await db.query(
        `SELECT COUNT(*) FROM customer_notes
         WHERE follow_up_date IS NOT NULL AND NOT follow_up_done AND follow_up_date <= CURRENT_DATE`
      );
      const count = parseInt(countResult.rows[0].count);
      if (count > 0) {
        alerts.push({
          type: 'follow_ups_due',
          count,
          message: `${count} customer follow-up${count === 1 ? '' : 's'} due or overdue`,
          viewAllLink: null,
          items: result.rows.map((r) => ({
            label: `${r.customer_name} (due ${new Date(r.follow_up_date).toLocaleDateString('en-IN')})`,
            link: `/customers/${r.customer_id}/notes`,
          })),
        });
      }
    }

    if (role === 'admin' || role === 'manager') {
      const commissionResult = await db.query(
        `SELECT c.id, c.policy_id, p.policy_number
         FROM commission c
         LEFT JOIN policies p ON c.policy_id = p.id
         WHERE c.status = 'pending' AND c.set_by != $1
         ORDER BY c.id ASC
         LIMIT 5`,
        [req.employee.id]
      );
      const commissionCountResult = await db.query(
        `SELECT COUNT(*) FROM commission WHERE status = 'pending' AND set_by != $1`,
        [req.employee.id]
      );
      const commissionCount = parseInt(commissionCountResult.rows[0].count);
      if (commissionCount > 0) {
        alerts.push({
          type: 'commission_pending',
          count: commissionCount,
          message: `${commissionCount} commission entr${commissionCount === 1 ? 'y' : 'ies'} awaiting your approval`,
          viewAllLink: '/commission-reconciliation',
          items: commissionResult.rows.map((r) => ({
            label: `${r.policy_number || 'Policy'}`,
            link: `/policies/${r.policy_id}/edit`,
          })),
        });
      }

      const result = await db.query(
        `SELECT pa.id, pa.type, pa.amount, pa.policy_id, p.policy_number
         FROM policy_adjustments pa
         LEFT JOIN policies p ON pa.policy_id = p.id
         WHERE pa.status = 'pending' AND pa.created_by != $1
         ORDER BY pa.created_at ASC
         LIMIT 5`,
        [req.employee.id]
      );
      const countResult = await db.query(
        `SELECT COUNT(*) FROM policy_adjustments WHERE status = 'pending' AND created_by != $1`,
        [req.employee.id]
      );
      const count = parseInt(countResult.rows[0].count);
      if (count > 0) {
        alerts.push({
          type: 'pending_adjustments',
          count,
          message: `${count} discount/cashback request${count === 1 ? '' : 's'} awaiting your approval`,
          viewAllLink: null,
          items: result.rows.map((r) => ({
            label: `${r.policy_number || 'Policy'} — ${r.type} ₹${Number(r.amount).toLocaleString('en-IN')}`,
            link: `/policies/${r.policy_id}/finance`,
          })),
        });
      }
    }

    res.json({ data: alerts });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAlerts };
