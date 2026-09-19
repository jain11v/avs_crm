const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/db');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ENTITY_TABLES = { customer: 'customers', policy: 'policies', employee: 'employees', task: 'tasks' };
// Which page's permission gates documents on each entity type. 'employee'
// and 'task' aren't page-gated at all — an employee always needs to see
// files sent to them, or attached to a task they're on either side of,
// regardless of their role's page access, so those are checked against
// the reporting/assignment relationship instead (see hasAccess).
const ENTITY_PAGES = { customer: 'customers', policy: 'policies' };

// Customer/policy documents follow the page permission a role has.
// Employee documents follow the same reporting relationship tasks do: an
// employee always sees their own, their reporting manager (or an admin)
// can send/view/remove them, nobody else can. Task documents (supporting
// files for a lead) are visible to whoever assigned the task and whoever
// it's assigned to.
async function hasAccess(req, entityType, entityId) {
  if (req.employee.role === 'admin') return true;
  if (entityType === 'employee') {
    if (String(req.employee.id) === String(entityId)) return true;
    const result = await db.query('SELECT reporting_to FROM employees WHERE id = $1', [entityId]);
    return result.rows.length > 0 && String(result.rows[0].reporting_to) === String(req.employee.id);
  }
  if (entityType === 'task') {
    const result = await db.query('SELECT assigned_to, assigned_by FROM tasks WHERE id = $1', [entityId]);
    if (result.rows.length === 0) return false;
    const { assigned_to, assigned_by } = result.rows[0];
    return String(req.employee.id) === String(assigned_to) || String(req.employee.id) === String(assigned_by);
  }
  return (req.permissions || new Set()).has(ENTITY_PAGES[entityType]);
}

// Loads the caller's page permissions once per request (only needed for
// non-admins) — avoids a query per hasAccess() call.
async function loadPermissions(req, res, next) {
  if (req.employee.role === 'admin') {
    req.permissions = null;
    return next();
  }
  try {
    const result = await db.query('SELECT page_key FROM role_permissions WHERE role = $1', [req.employee.role]);
    req.permissions = new Set(result.rows.map((r) => r.page_key));
    next();
  } catch (err) {
    next(err);
  }
}

// GET /api/documents?entity_type=&entity_id=
async function list(req, res, next) {
  try {
    const { entity_type, entity_id } = req.query;
    if (!ENTITY_TABLES[entity_type] || !entity_id) {
      return res.status(400).json({ error: 'entity_type (customer|policy|employee|task) and entity_id are required.' });
    }
    if (!(await hasAccess(req, entity_type, entity_id))) {
      return res.status(403).json({ error: 'You do not have access to these documents.' });
    }

    const result = await db.query(
      `SELECT d.id, d.filename, d.content_type, d.size_bytes, d.created_at,
              e.first_name AS uploaded_by_first_name, e.last_name AS uploaded_by_last_name
       FROM documents d
       LEFT JOIN employees e ON d.uploaded_by = e.id
       WHERE d.entity_type = $1 AND d.entity_id = $2
       ORDER BY d.created_at DESC`,
      [entity_type, entity_id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

// POST /api/documents  (multipart: file, entity_type, entity_id)
async function upload(req, res, next) {
  try {
    const { entity_type, entity_id } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    if (!ENTITY_TABLES[entity_type] || !entity_id) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'entity_type (customer|policy|employee|task) and entity_id are required.' });
    }
    if (!(await hasAccess(req, entity_type, entity_id))) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'You do not have access to upload documents here.' });
    }

    const entityCheck = await db.query(
      `SELECT id FROM ${ENTITY_TABLES[entity_type]} WHERE id = $1`,
      [entity_id]
    );
    if (entityCheck.rows.length === 0) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: `That ${entity_type} was not found.` });
    }

    const result = await db.query(
      `INSERT INTO documents (entity_type, entity_id, filename, stored_filename, content_type, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [entity_type, entity_id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.employee.id]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
}

// GET /api/documents/:id/download
async function download(req, res, next) {
  try {
    const result = await db.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    const doc = result.rows[0];
    if (!(await hasAccess(req, doc.entity_type, doc.entity_id))) {
      return res.status(403).json({ error: 'You do not have access to this document.' });
    }

    const filePath = path.join(UPLOAD_DIR, doc.stored_filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'That file is missing from storage.' });
    }

    res.setHeader('Content-Type', doc.content_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.filename)}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/documents/:id
async function remove(req, res, next) {
  try {
    const result = await db.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    const doc = result.rows[0];
    if (!(await hasAccess(req, doc.entity_type, doc.entity_id))) {
      return res.status(403).json({ error: 'You do not have access to remove this document.' });
    }

    await db.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    fs.unlink(path.join(UPLOAD_DIR, doc.stored_filename), () => {});
    res.json({ message: 'Document deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, upload, download, remove, loadPermissions, UPLOAD_DIR };
