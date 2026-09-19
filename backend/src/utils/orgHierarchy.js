const db = require('../config/db');

// Returns [employeeId, ...everyone below them in the reporting chain] —
// walks employees.reporting_to (same recursive pattern as
// taskController.canAssign), not the role field, so anyone with reports
// sees their team regardless of whether they're flagged 'manager' or
// 'employee'. Used to scope "my own + my team's" data (renewals-due,
// performance) for non-admin roles — admin sees everything and should
// never call this. Capped at 20 levels as a guard against a bad
// reporting_to cycle causing runaway recursion.
async function selfAndDescendantIds(employeeId) {
  const result = await db.query(
    `WITH RECURSIVE chain AS (
       SELECT id, 1 AS depth FROM employees WHERE id = $1
       UNION ALL
       SELECT e.id, c.depth + 1
       FROM employees e
       JOIN chain c ON e.reporting_to = c.id
       WHERE c.depth < 20
     )
     SELECT id FROM chain`,
    [employeeId]
  );
  return result.rows.map((r) => r.id);
}

module.exports = { selfAndDescendantIds };
