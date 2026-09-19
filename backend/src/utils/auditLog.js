// Records who changed what, and when, for the money-moving tables. Every
// call goes through the same client used by the surrounding DB transaction,
// so a logged change and the change itself always commit or roll back
// together.

// Values that mean the same thing can arrive in different shapes — a `pg`
// DATE column comes back as a JS Date built from local calendar fields
// (all the DATE columns this app diffs are now patched at the driver level
// to skip that and return a plain string instead — see config/db.js — but
// this stays defensive for any Date that reaches here some other way),
// while the request body sends a plain 'YYYY-MM-DD' string; a NUMERIC
// column comes back as a string like "5000.00" while a freshly-computed JS
// number is 5000. Comparing either pair with a naive String() reports a
// change that never happened. This reduces both to one canonical form
// before comparing.
//
// For a Date, read its LOCAL calendar fields (getFullYear/getMonth/
// getDate), not .toISOString() (UTC) — every date-ish column this app
// diffs represents a calendar day, not a UTC instant, and going through
// UTC shifts that day by one whenever the server's timezone (IST, +5:30)
// isn't UTC. This is the same bug class that corrupted policy dates
// before the driver-level fix; it must not be reintroduced here.
function normalize(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return String(Math.round(Number(trimmed) * 100) / 100);
    }
    return trimmed;
  }
  if (typeof value === 'number') {
    return String(Math.round(value * 100) / 100);
  }
  return String(value);
}

// Builds a {field: {from, to}} diff for the given field list. Pass
// `before: null` for a create (every field shows from: null) or
// `after: null` for a delete (every field shows to: null) — one shape
// covers create/update/delete/approve/reject, so the frontend never has to
// branch on action type to render it.
function diffFields(before, after, fields) {
  const changes = {};
  for (const f of fields) {
    const from = before ? before[f] ?? null : null;
    const to = after ? after[f] ?? null : null;
    if (normalize(from) !== normalize(to)) {
      changes[f] = { from, to };
    }
  }
  return changes;
}

// `client` is a pg client (or the pool) already inside the caller's
// transaction. Logs nothing if `changes` ends up empty (e.g. an update
// where nothing tracked actually changed).
async function logChange(client, { entityType, entityId, policyId, action, changes, employeeId }) {
  if (!changes || Object.keys(changes).length === 0) {
    return;
  }
  await client.query(
    `INSERT INTO audit_log (entity_type, entity_id, policy_id, action, changes, employee_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entityType, entityId, policyId || null, action, JSON.stringify(changes), employeeId || null]
  );
}

module.exports = { diffFields, logChange };
