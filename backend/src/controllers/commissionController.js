const db = require('../config/db');
const { diffFields, logChange } = require('../utils/auditLog');

const COMMISSION_AUDIT_FIELDS = ['status', 'approver_remarks'];

// GET /api/commission?policy_id=
// Read-only: commission is only ever written as part of a policy
// create/update (see policyController) — this just feeds the "add
// commission" popup when opening an existing policy for edit. Returns
// null when the policy has no commission recorded yet.
async function getByPolicy(req, res, next) {
  try {
    const { policy_id } = req.query;

    if (!policy_id) {
      return res.status(400).json({ error: 'policy_id is required.' });
    }

    const result = await db.query(
      `SELECT c.id, c.brok_percent, c.tp_brok_percent, c.gst, c.remarks,
              c.status, c.set_by, c.approver_remarks,
              sb.first_name AS set_by_first_name, sb.last_name AS set_by_last_name,
              ab.first_name AS approved_by_first_name, ab.last_name AS approved_by_last_name
       FROM commission c
       LEFT JOIN employees sb ON c.set_by = sb.id
       LEFT JOIN employees ab ON c.approved_by = ab.id
       WHERE c.policy_id = $1`,
      [policy_id]
    );

    res.json(result.rows[0] || null);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/commission/:policyId/decision  { decision: 'approved'|'rejected', approver_remarks }
// Same shape as policy_adjustments' approval flow: restricted to
// managers/admins by the route, never by whoever set the commission.
async function decide(req, res, next) {
  try {
    const { decision, approver_remarks } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: "Decision must be 'approved' or 'rejected'." });
    }

    const existing = await db.query(
      'SELECT id, set_by, status, approver_remarks FROM commission WHERE policy_id = $1',
      [req.params.policyId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'This policy has no commission recorded.' });
    }
    const before = existing.rows[0];

    if (before.status === 'approved') {
      return res.status(409).json({ error: 'This commission has already been approved.' });
    }
    if (before.set_by === req.employee.id) {
      return res.status(403).json({ error: 'You cannot approve or reject your own entry.' });
    }

    const result = await db.query(
      `UPDATE commission
       SET status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP, approver_remarks = $3
       WHERE id = $4
       RETURNING id`,
      [decision, req.employee.id, approver_remarks || null, before.id]
    );

    await logChange(db, {
      entityType: 'commission',
      entityId: before.id,
      policyId: req.params.policyId,
      action: decision,
      changes: diffFields(before, { status: decision, approver_remarks: approver_remarks || null }, COMMISSION_AUDIT_FIELDS),
      employeeId: req.employee.id,
    });

    res.json({ id: result.rows[0].id, status: decision });
  } catch (err) {
    next(err);
  }
}

module.exports = { getByPolicy, decide };
