// Looks up a `heads` row by name, creating it if it doesn't exist yet in
// this environment (heads are a user-manageable lookup table, but a few
// names are meant to always exist as fixed categories for automatically-
// posted transactions — e.g. every insurer/customer payment — rather than
// requiring each environment to be seeded by hand first).
async function getOrCreateHeadId(client, name) {
  const existing = await client.query('SELECT id FROM heads WHERE name = $1', [name]);
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  const inserted = await client.query('INSERT INTO heads (name) VALUES ($1) RETURNING id', [name]);
  return inserted.rows[0].id;
}

module.exports = { getOrCreateHeadId };
