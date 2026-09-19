const db = require('../config/db');

const NOTE_TYPES = ['call', 'email', 'meeting', 'note', 'other'];

// GET /api/customer-notes?customer_id=
async function list(req, res, next) {
  try {
    const customerId = req.query.customer_id;
    if (!customerId) {
      return res.status(400).json({ error: 'customer_id is required.' });
    }

    const result = await db.query(
      `SELECT n.*, e.first_name AS employee_first_name, e.last_name AS employee_last_name
       FROM customer_notes n
       LEFT JOIN employees e ON n.employee_id = e.id
       WHERE n.customer_id = $1
       ORDER BY n.created_at DESC`,
      [customerId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

// POST /api/customer-notes  { customer_id, note_type, content, follow_up_date }
async function create(req, res, next) {
  try {
    const { customer_id, note_type, content, follow_up_date } = req.body;

    if (!customer_id || !content || !content.trim()) {
      return res.status(400).json({ error: 'Missing required fields: customer_id, content.' });
    }
    const type = note_type || 'note';
    if (!NOTE_TYPES.includes(type)) {
      return res.status(400).json({ error: `note_type must be one of: ${NOTE_TYPES.join(', ')}.` });
    }

    const result = await db.query(
      `INSERT INTO customer_notes (customer_id, employee_id, note_type, content, follow_up_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [customer_id, req.employee.id, type, content.trim(), follow_up_date || null]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Customer does not refer to a valid record.' });
    }
    next(err);
  }
}

// PATCH /api/customer-notes/:id/done  { follow_up_done }
async function setFollowUpDone(req, res, next) {
  try {
    const result = await db.query(
      'UPDATE customer_notes SET follow_up_done = $1 WHERE id = $2 RETURNING id',
      [Boolean(req.body.follow_up_done), req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found.' });
    }
    res.json({ id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/customer-notes/:id
async function remove(req, res, next) {
  try {
    const result = await db.query('DELETE FROM customer_notes WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found.' });
    }
    res.json({ message: 'Note deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, setFollowUpDone, remove };
