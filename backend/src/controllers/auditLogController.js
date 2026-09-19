const db = require('../config/db');

// GET /api/audit-log?policy_id=&entity_type=&employee_id=&from=&to=&page=&limit=
async function list(req, res, next) {
  try {
    const { policy_id, entity_type, employee_id, from, to } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    if (policy_id) {
      params.push(policy_id);
      conditions.push(`a.policy_id = $${params.length}`);
    }
    if (entity_type) {
      params.push(entity_type);
      conditions.push(`a.entity_type = $${params.length}`);
    }
    if (employee_id) {
      params.push(employee_id);
      conditions.push(`a.employee_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`a.created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`a.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = await db.query(`SELECT COUNT(*) FROM audit_log a ${whereClause}`, params);
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT a.id, a.entity_type, a.entity_id, a.policy_id, a.action, a.changes, a.created_at,
              e.first_name AS employee_first_name, e.last_name AS employee_last_name,
              p.policy_number
       FROM audit_log a
       LEFT JOIN employees e ON a.employee_id = e.id
       LEFT JOIN policies p ON a.policy_id = p.id
       ${whereClause}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
