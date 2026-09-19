const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { UPLOAD_DIR } = require('./documentController');

const MESSAGE_FIELDS = `
  m.id, m.sender_id, m.body, m.file_original_name, m.file_stored_name,
  m.file_content_type, m.file_size_bytes, m.created_at,
  e.first_name AS sender_first_name, e.last_name AS sender_last_name
`;

// GET /api/chat/messages?after_id=&limit=
// Two modes: no after_id returns the most recent `limit` messages (default
// 50, oldest first, for the initial page load); with after_id it returns
// everything newer than that (used to poll for new messages without
// re-fetching history).
async function list(req, res, next) {
  try {
    const afterId = req.query.after_id ? Number(req.query.after_id) : null;

    if (afterId) {
      const result = await db.query(
        `SELECT ${MESSAGE_FIELDS}
         FROM chat_messages m
         LEFT JOIN employees e ON m.sender_id = e.id
         WHERE m.id > $1
         ORDER BY m.id ASC
         LIMIT 200`,
        [afterId]
      );
      return res.json(result.rows);
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const result = await db.query(
      `SELECT ${MESSAGE_FIELDS}
       FROM chat_messages m
       LEFT JOIN employees e ON m.sender_id = e.id
       ORDER BY m.id DESC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows.reverse());
  } catch (err) {
    next(err);
  }
}

// POST /api/chat/messages  (multipart: body?, file?)
async function send(req, res, next) {
  try {
    const body = (req.body.body || '').trim() || null;
    if (!body && !req.file) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Write a message or attach a file.' });
    }

    const result = await db.query(
      `INSERT INTO chat_messages (sender_id, body, file_original_name, file_stored_name, file_content_type, file_size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        req.employee.id,
        body,
        req.file ? req.file.originalname : null,
        req.file ? req.file.filename : null,
        req.file ? req.file.mimetype : null,
        req.file ? req.file.size : null,
      ]
    );

    const created = await db.query(
      `SELECT ${MESSAGE_FIELDS} FROM chat_messages m LEFT JOIN employees e ON m.sender_id = e.id WHERE m.id = $1`,
      [result.rows[0].id]
    );
    res.status(201).json(created.rows[0]);
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
}

// GET /api/chat/messages/:id/download
async function download(req, res, next) {
  try {
    const result = await db.query('SELECT * FROM chat_messages WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0 || !result.rows[0].file_stored_name) {
      return res.status(404).json({ error: 'That message has no file attached.' });
    }
    const msg = result.rows[0];

    const filePath = path.join(UPLOAD_DIR, msg.file_stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'That file is missing from storage.' });
    }

    res.setHeader('Content-Type', msg.file_content_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(msg.file_original_name)}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, send, download };
