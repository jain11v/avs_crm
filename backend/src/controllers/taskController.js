const db = require('../config/db');

const FK_FIELD_NAMES = {
  tasks_assigned_to_fkey: 'Employee',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

// A reporting manager can assign to their own direct reports; admin can
// assign to anyone. No other role may assign — mirrors how commission
// approval treats "manager" as a checker role, not a general permission.
async function canAssign(assigner, targetEmployeeId) {
  if (assigner.role === 'admin') return true;
  const result = await db.query('SELECT reporting_to FROM employees WHERE id = $1', [targetEmployeeId]);
  return result.rows.length > 0 && String(result.rows[0].reporting_to) === String(assigner.id);
}

// GET /api/tasks/mine — tasks assigned to the logged-in employee.
async function listMine(req, res, next) {
  try {
    const result = await db.query(
      `SELECT t.*, e.first_name AS assigned_by_first_name, e.last_name AS assigned_by_last_name
       FROM tasks t
       LEFT JOIN employees e ON t.assigned_by = e.id
       WHERE t.assigned_to = $1
       ORDER BY (t.status = 'done'), t.due_date NULLS LAST, t.created_at DESC`,
      [req.employee.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

// GET /api/tasks?assigned_to=  — tasks for a specific employee, e.g. shown
// on their record in the Employees page. Only that employee, their
// reporting manager, or an admin may view it.
async function list(req, res, next) {
  try {
    const assignedTo = req.query.assigned_to;
    if (!assignedTo) {
      return res.status(400).json({ error: 'assigned_to is required.' });
    }
    if (String(assignedTo) !== String(req.employee.id) && !(await canAssign(req.employee, assignedTo))) {
      return res.status(403).json({ error: 'You do not have access to this employee’s tasks.' });
    }

    const result = await db.query(
      `SELECT t.*, e.first_name AS assigned_by_first_name, e.last_name AS assigned_by_last_name
       FROM tasks t
       LEFT JOIN employees e ON t.assigned_by = e.id
       WHERE t.assigned_to = $1
       ORDER BY (t.status = 'done'), t.due_date NULLS LAST, t.created_at DESC`,
      [assignedTo]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

// POST /api/tasks  { assigned_to, title, description, due_date, priority }
async function create(req, res, next) {
  try {
    const { assigned_to, title, description, due_date, priority } = req.body;
    if (!assigned_to || !title || !title.trim()) {
      return res.status(400).json({ error: 'Missing required fields: assigned_to, title.' });
    }
    if (!(await canAssign(req.employee, assigned_to))) {
      return res.status(403).json({ error: 'You can only assign tasks to your own direct reports.' });
    }
    if (priority && !['low', 'normal', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'priority must be one of: low, normal, high.' });
    }

    const result = await db.query(
      `INSERT INTO tasks (title, description, assigned_to, assigned_by, due_date, priority)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [title.trim(), description || null, assigned_to, req.employee.id, due_date || null, priority || 'normal']
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  }
}

// PATCH /api/tasks/:id/status  { status }
// Only the assignee moves their own task through pending -> in_progress ->
// done (or back) — an admin may also do it on anyone's behalf.
async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!['pending', 'in_progress', 'done'].includes(status)) {
      return res.status(400).json({ error: 'status must be one of: pending, in_progress, done.' });
    }

    const existing = await db.query('SELECT assigned_to FROM tasks WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    if (req.employee.role !== 'admin' && String(existing.rows[0].assigned_to) !== String(req.employee.id)) {
      return res.status(403).json({ error: 'Only the person this task is assigned to can update it.' });
    }

    const result = await db.query(
      `UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP,
              completed_at = CASE WHEN $1 = 'done' THEN CURRENT_TIMESTAMP ELSE NULL END
       WHERE id = $2
       RETURNING id`,
      [status, req.params.id]
    );
    res.json({ id: result.rows[0].id, status });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/tasks/:id — only whoever assigned it (or an admin) can remove it.
async function remove(req, res, next) {
  try {
    const existing = await db.query('SELECT assigned_by FROM tasks WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    if (req.employee.role !== 'admin' && String(existing.rows[0].assigned_by) !== String(req.employee.id)) {
      return res.status(403).json({ error: 'Only whoever assigned this task can delete it.' });
    }

    await db.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    res.json({ message: 'Task deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMine, list, create, updateStatus, remove };
