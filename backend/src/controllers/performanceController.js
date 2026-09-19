const db = require('../config/db');
const { selfAndDescendantIds } = require('../utils/orgHierarchy');

// GET /api/performance
// Per-employee counts of lead/renewal outcomes and completed work:
//  - leads_lost: tasks-as-leads (see migration 025) the employee was
//    assigned and resolved as not converting (tasks.outcome = 'lost').
//  - renewals_lost: policies the employee marked lost via
//    policyController.markLost() (policies.lost_by, migration 028).
//  - tasks_completed: tasks.status = 'done', excluding lost leads (those
//    are also marked 'done' as a side effect of resolving them, but they
//    belong under renewals/leads-lost, not "completed").
//  - renewals_completed: policies the employee created that renewed
//    another policy (policies.renewed_from_policy_id IS NOT NULL,
//    policies.user_id = the creating employee — see the "Assigned
//    employee is forced to the creator" rule).
// Rows are scoped by reporting hierarchy for anyone but admin: an employee
// sees only their own row, and anyone with reports (walking
// employees.reporting_to — see selfAndDescendantIds) also sees their whole
// team's, so a plain employee with no reports naturally sees only
// themselves. Admin sees every employee, unscoped, as usual.
async function list(req, res, next) {
  try {
    const params = [];
    let scopeFilter = '';
    if (req.employee.role !== 'admin') {
      const visibleIds = await selfAndDescendantIds(req.employee.id);
      params.push(visibleIds);
      scopeFilter = `WHERE e.id = ANY($${params.length})`;
    }

    const result = await db.query(
      `SELECT e.id, e.first_name, e.last_name, e.is_active,
              (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = e.id AND t.outcome = 'lost') AS leads_lost,
              (SELECT COUNT(*) FROM policies p WHERE p.lost_by = e.id) AS renewals_lost,
              (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = e.id AND t.status = 'done' AND t.outcome != 'lost') AS tasks_completed,
              (SELECT COUNT(*) FROM policies p WHERE p.user_id = e.id AND p.renewed_from_policy_id IS NOT NULL) AS renewals_completed
       FROM employees e
       ${scopeFilter}
       ORDER BY e.first_name, e.last_name`,
      params
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
