const db = require('../config/db');
const { diffFields, logChange } = require('../utils/auditLog');
const { selfAndDescendantIds } = require('../utils/orgHierarchy');

const AUDIT_FIELDS = ['leave_type', 'start_date', 'end_date', 'reason', 'status', 'approver_remarks'];

function isManager(req) {
  return req.employee.role === 'admin' || req.employee.role === 'manager';
}

function friendlyForeignKeyError(err) {
  if (err.constraint === 'leave_requests_employee_id_fkey') {
    return 'Employee does not refer to a valid record.';
  }
  return 'One of the selected values does not refer to a valid record.';
}

function friendlyCheckError(err) {
  if (err.constraint === 'leave_requests_dates_valid') {
    return 'End date cannot be before start date.';
  }
  if (err.constraint === 'leave_requests_leave_type_check') {
    return "Leave type must be 'paid' or 'unpaid'.";
  }
  if (err.constraint === 'leave_requests_status_check') {
    return 'Status must be one of: pending, approved, rejected.';
  }
  return 'One of the fields is not in a valid format.';
}

// POST /api/leave  { leave_type, start_date, end_date, reason, employee_id? }
// Self-service by default; a manager/admin may file on behalf of someone
// else, same override rule as attendanceController.mark().
async function create(req, res, next) {
  try {
    const { leave_type, start_date, end_date, reason } = req.body;
    if (!leave_type || !start_date || !end_date) {
      return res.status(400).json({ error: 'Missing required fields: leave_type, start_date, end_date.' });
    }

    let employeeId = req.employee.id;
    if (req.body.employee_id && String(req.body.employee_id) !== String(req.employee.id)) {
      if (!isManager(req)) {
        return res.status(403).json({ error: 'Only a manager or admin can apply for leave on someone else’s behalf.' });
      }
      employeeId = req.body.employee_id;
    }

    const result = await db.query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id`,
      [employeeId, leave_type, start_date, end_date, reason || null, req.employee.id]
    );

    await logChange(db, {
      entityType: 'leave_request',
      entityId: result.rows[0].id,
      action: 'create',
      changes: diffFields(null, { leave_type, start_date, end_date, reason, status: 'pending' }, AUDIT_FIELDS),
      employeeId: req.employee.id,
    });

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23514') {
      return res.status(400).json({ error: friendlyCheckError(err) });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// GET /api/leave?employee_id=&status=&page=&limit=
// Plain employee: only their own. Manager: self + everyone under them in
// the reporting chain (selfAndDescendantIds — same scoping as Performance
// and the renewals-due alert). Admin: everyone, unscoped.
async function list(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (req.employee.role !== 'admin') {
      const visibleIds = await selfAndDescendantIds(req.employee.id);
      params.push(visibleIds);
      conditions.push(`lr.employee_id = ANY($${params.length})`);
    }
    if (req.query.employee_id) {
      params.push(req.query.employee_id);
      conditions.push(`lr.employee_id = $${params.length}`);
    }
    if (req.query.status) {
      params.push(req.query.status);
      conditions.push(`lr.status = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = await db.query(`SELECT COUNT(*) FROM leave_requests lr ${whereClause}`, params);
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT lr.id, lr.employee_id, lr.leave_type, lr.start_date, lr.end_date, lr.reason,
              lr.status, lr.approver_remarks, lr.approved_at,
              e.first_name AS employee_first_name, e.last_name AS employee_last_name, e.reporting_to,
              ab.first_name AS approved_by_first_name, ab.last_name AS approved_by_last_name
       FROM leave_requests lr
       JOIN employees e ON lr.employee_id = e.id
       LEFT JOIN employees ab ON lr.approved_by = ab.id
       ${whereClause}
       ORDER BY lr.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/leave/:id/decision  { decision: 'approved'|'rejected', approver_remarks }
// Restricted to the requester's direct reporting manager, or admin —
// deliberately stricter than the generic isManager() check used elsewhere,
// since any manager in the chain approving anyone's leave would blur who's
// actually responsible for it.
async function decide(req, res, next) {
  const client = await db.pool.connect();
  try {
    const { decision, approver_remarks } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: "Decision must be 'approved' or 'rejected'." });
    }

    const existing = await client.query(
      `SELECT lr.id, lr.employee_id, lr.leave_type, lr.start_date, lr.end_date, lr.reason, lr.status, lr.approver_remarks,
              e.reporting_to
       FROM leave_requests lr
       JOIN employees e ON lr.employee_id = e.id
       WHERE lr.id = $1`,
      [req.params.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found.' });
    }
    const leaveRequest = existing.rows[0];

    if (leaveRequest.status !== 'pending') {
      return res.status(409).json({ error: 'This leave request has already been decided.' });
    }
    const isDirectManager = String(leaveRequest.reporting_to) === String(req.employee.id);
    if (req.employee.role !== 'admin' && !isDirectManager) {
      return res.status(403).json({ error: 'Only this employee’s direct reporting manager can approve or reject their leave.' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE leave_requests
       SET status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP, approver_remarks = $3
       WHERE id = $4
       RETURNING id`,
      [decision, req.employee.id, approver_remarks || null, req.params.id]
    );

    if (decision === 'approved') {
      await client.query(
        `INSERT INTO attendance (employee_id, date, status, remarks)
         SELECT $1, d::date, 'leave', $2
         FROM generate_series($3::date, $4::date, interval '1 day') AS d
         ON CONFLICT (employee_id, date) DO UPDATE
         SET status = 'leave', remarks = $2, updated_at = CURRENT_TIMESTAMP`,
        [leaveRequest.employee_id, `Leave (request #${leaveRequest.id})`, leaveRequest.start_date, leaveRequest.end_date]
      );
    }

    await logChange(client, {
      entityType: 'leave_request',
      entityId: leaveRequest.id,
      action: decision,
      changes: diffFields(leaveRequest, { ...leaveRequest, status: decision, approver_remarks: approver_remarks || null }, ['status', 'approver_remarks']),
      employeeId: req.employee.id,
    });

    await client.query('COMMIT');
    res.json({ id: result.rows[0].id, status: decision });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// DELETE /api/leave/:id — cancel, only while pending, by the requester or
// any manager/admin.
async function remove(req, res, next) {
  try {
    const existing = await db.query(
      `SELECT ${AUDIT_FIELDS.join(', ')}, employee_id FROM leave_requests WHERE id = $1`,
      [req.params.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found.' });
    }
    const leaveRequest = existing.rows[0];
    if (leaveRequest.status !== 'pending') {
      return res.status(409).json({ error: 'Only a pending leave request can be cancelled.' });
    }
    if (String(leaveRequest.employee_id) !== String(req.employee.id) && !isManager(req)) {
      return res.status(403).json({ error: 'You cannot cancel someone else’s leave request.' });
    }

    await db.query('DELETE FROM leave_requests WHERE id = $1', [req.params.id]);

    await logChange(db, {
      entityType: 'leave_request',
      entityId: Number(req.params.id),
      action: 'delete',
      changes: diffFields(leaveRequest, null, AUDIT_FIELDS),
      employeeId: req.employee.id,
    });

    res.json({ message: 'Leave request cancelled.' });
  } catch (err) {
    next(err);
  }
}

// GET /api/leave/balance?employee_id=&year=
// Self by default. A manager/admin may look up someone else's balance,
// same visibility rule as list().
async function getBalance(req, res, next) {
  try {
    let employeeId = req.employee.id;
    if (req.query.employee_id && String(req.query.employee_id) !== String(req.employee.id)) {
      if (req.employee.role !== 'admin') {
        const visibleIds = await selfAndDescendantIds(req.employee.id);
        if (!visibleIds.map(String).includes(String(req.query.employee_id))) {
          return res.status(403).json({ error: 'You cannot view this employee’s leave balance.' });
        }
      }
      employeeId = req.query.employee_id;
    }
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const empResult = await db.query('SELECT annual_leave_entitlement FROM employees WHERE id = $1', [employeeId]);
    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    const entitlement = Number(empResult.rows[0].annual_leave_entitlement);

    const usedResult = await db.query(
      `SELECT COALESCE(SUM(end_date - start_date + 1), 0) AS used
       FROM leave_requests
       WHERE employee_id = $1 AND status = 'approved' AND leave_type = 'paid'
         AND EXTRACT(YEAR FROM start_date) = $2`,
      [employeeId, year]
    );
    const used = Number(usedResult.rows[0].used);

    res.json({ employee_id: employeeId, year, entitlement, used, remaining: entitlement - used });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, decide, remove, getBalance };
