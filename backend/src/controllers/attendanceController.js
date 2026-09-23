const db = require('../config/db');

function isElevated(req) {
  return req.employee.role === 'admin' || req.employee.is_elevated;
}

function todayIsoDate() {
  return new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD' in the server's local calendar day
}

function friendlyForeignKeyError(err) {
  if (err.constraint === 'attendance_employee_id_fkey') {
    return 'Employee does not refer to a valid record.';
  }
  return 'One of the selected values does not refer to a valid record.';
}

function friendlyCheckError(err) {
  if (err.constraint === 'attendance_status_check') {
    return "Status must be one of: present, absent, half_day, leave.";
  }
  return 'One of the fields is not in a valid format.';
}

// GET /api/attendance/today — the logged-in employee's own record for today, or null.
async function getToday(req, res, next) {
  try {
    const result = await db.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
      [req.employee.id, todayIsoDate()]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    next(err);
  }
}

// POST /api/attendance/check-in
async function checkIn(req, res, next) {
  try {
    const date = todayIsoDate();
    const existing = await db.query(
      'SELECT id, check_in_time FROM attendance WHERE employee_id = $1 AND date = $2',
      [req.employee.id, date]
    );
    if (existing.rows.length > 0 && existing.rows[0].check_in_time) {
      return res.status(409).json({ error: 'Already checked in today.' });
    }

    const result = await db.query(
      `INSERT INTO attendance (employee_id, date, status, check_in_time)
       VALUES ($1, $2, 'present', CURRENT_TIMESTAMP)
       ON CONFLICT (employee_id, date) DO UPDATE
       SET status = 'present', check_in_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [req.employee.id, date]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/attendance/check-out
async function checkOut(req, res, next) {
  try {
    const date = todayIsoDate();
    const existing = await db.query(
      'SELECT id, check_in_time, check_out_time FROM attendance WHERE employee_id = $1 AND date = $2',
      [req.employee.id, date]
    );
    if (existing.rows.length === 0 || !existing.rows[0].check_in_time) {
      return res.status(400).json({ error: "You haven't checked in today." });
    }
    if (existing.rows[0].check_out_time) {
      return res.status(409).json({ error: 'Already checked out today.' });
    }

    const result = await db.query(
      `UPDATE attendance SET check_out_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [existing.rows[0].id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/attendance/mark  { date, status, remarks, employee_id? }
// Self-service marking for a day with no check-in (half-day, leave,
// absent) — against the logged-in employee's own record, unless a
// manager/admin passes employee_id to mark it for someone else (e.g. an
// employee who didn't show up and isn't the one logging the absence).
async function mark(req, res, next) {
  try {
    const { date, status, remarks } = req.body;
    if (!date || !status) {
      return res.status(400).json({ error: 'Missing required fields: date, status.' });
    }

    let employeeId = req.employee.id;
    if (req.body.employee_id && String(req.body.employee_id) !== String(req.employee.id)) {
      if (!isElevated(req)) {
        return res.status(403).json({ error: 'Only a manager or admin can mark attendance for someone else.' });
      }
      employeeId = req.body.employee_id;
    }

    const result = await db.query(
      `INSERT INTO attendance (employee_id, date, status, remarks)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (employee_id, date) DO UPDATE
       SET status = $3, remarks = $4, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [employeeId, date, status, remarks || null]
    );
    res.status(201).json(result.rows[0]);
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

// GET /api/attendance?employee_id=&from=&to=&page=&limit=
// Employees only ever see their own records; managers/admins can see
// anyone's (employee_id filters; omitted shows everyone).
async function list(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (isElevated(req)) {
      if (req.query.employee_id) {
        params.push(req.query.employee_id);
        conditions.push(`a.employee_id = $${params.length}`);
      }
    } else {
      params.push(req.employee.id);
      conditions.push(`a.employee_id = $${params.length}`);
    }
    if (req.query.from) {
      params.push(req.query.from);
      conditions.push(`a.date >= $${params.length}`);
    }
    if (req.query.to) {
      params.push(req.query.to);
      conditions.push(`a.date <= $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = await db.query(`SELECT COUNT(*) FROM attendance a ${whereClause}`, params);
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT a.*, e.first_name, e.last_name
       FROM attendance a
       LEFT JOIN employees e ON a.employee_id = e.id
       ${whereClause}
       ORDER BY a.date DESC, e.first_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/attendance/summary?month=YYYY-MM&employee_id=
// Monthly totals per employee. Employees only ever see their own.
async function summary(req, res, next) {
  try {
    const month = req.query.month || todayIsoDate().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month must be in YYYY-MM format.' });
    }

    const conditions = [`a.date >= $1::date`, `a.date < ($1::date + INTERVAL '1 month')`];
    const params = [`${month}-01`];

    if (isElevated(req)) {
      if (req.query.employee_id) {
        params.push(req.query.employee_id);
        conditions.push(`a.employee_id = $${params.length}`);
      }
    } else {
      params.push(req.employee.id);
      conditions.push(`a.employee_id = $${params.length}`);
    }

    const result = await db.query(
      `SELECT e.id AS employee_id, e.first_name, e.last_name,
              COUNT(*) FILTER (WHERE a.status = 'present') AS present_count,
              COUNT(*) FILTER (WHERE a.status = 'absent') AS absent_count,
              COUNT(*) FILTER (WHERE a.status = 'half_day') AS half_day_count,
              COUNT(*) FILTER (WHERE a.status = 'leave') AS leave_count
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY e.id, e.first_name, e.last_name
       ORDER BY e.first_name`,
      params
    );

    res.json({ month, data: result.rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/attendance/roster?date=YYYY-MM-DD — manager/admin only. One row
// per active employee for a single day (default today): their check-in/
// check-out time and status, or nulls if nothing's recorded yet — for
// today that means "hasn't checked in yet"; for a past day it means the
// end-of-day auto-absent job (backend/src/jobs/markAbsentees.js) hasn't
// caught up to it yet.
async function roster(req, res, next) {
  try {
    if (!isElevated(req)) {
      return res.status(403).json({ error: 'Only a manager or admin can view the attendance roster.' });
    }
    const date = req.query.date || todayIsoDate();

    const result = await db.query(
      `SELECT e.id AS employee_id, e.first_name, e.last_name,
              a.status, a.check_in_time, a.check_out_time, a.remarks
       FROM employees e
       LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = $1
       WHERE e.is_active = TRUE
       ORDER BY e.first_name, e.last_name`,
      [date]
    );

    res.json({ date, data: result.rows });
  } catch (err) {
    next(err);
  }
}

const EDITABLE_FIELDS = ['status', 'check_in_time', 'check_out_time', 'remarks'];

// PUT /api/attendance/:id — manager/admin correction of any record.
async function update(req, res, next) {
  try {
    if (!isElevated(req)) {
      return res.status(403).json({ error: 'Only a manager or admin can edit another day’s record.' });
    }

    const fields = {};
    for (const f of EDITABLE_FIELDS) {
      if (req.body[f] !== undefined) {
        fields[f] = req.body[f] === '' ? null : req.body[f];
      }
    }
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

    const result = await db.query(
      `UPDATE attendance SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${columns.length + 1} RETURNING *`,
      [...values, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found.' });
    }
    res.json(result.rows[0]);
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

module.exports = { getToday, checkIn, checkOut, mark, list, summary, roster, update };
