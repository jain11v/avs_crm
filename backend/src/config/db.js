const { Pool, types } = require('pg');
require('dotenv').config();

// node-postgres's default DATE (OID 1082) parser returns a JS Date built
// from LOCAL calendar fields (new Date(y, m, d), midnight in the server's
// own timezone) — not a UTC instant. Any later .toISOString() (JSON
// responses, this app's own logging) then reads that back as if it were
// UTC, which silently rolls the date back a day whenever the server's
// timezone is ahead of UTC (IST, UTC+5:30, always is). That's a real,
// silent data-corruption bug: policy_start_date/policy_end_date shift
// backward by a day on every edit that round-trips through the frontend.
// Returning the raw 'YYYY-MM-DD' string instead removes the ambiguity
// everywhere at once, instead of patching every call site that touches a
// date column.
types.setTypeParser(1082, (val) => val);

// A single shared connection pool for the whole app. Every query should go
// through this pool rather than opening its own client — pg handles
// connection reuse and queuing for us.
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('error', (err) => {
  // Errors on idle clients (e.g. connection dropped by the DB server)
  // shouldn't crash the whole process.
  console.error('Unexpected error on idle database client', err);
});

module.exports = {
  // Use for simple one-off queries.
  query: (text, params) => pool.query(text, params),
  // Use when you need multiple queries in one transaction (e.g. policy +
  // premium rows together) — call pool.connect(), then client.query(...),
  // client.query('COMMIT') / client.query('ROLLBACK'), then client.release().
  pool,
};
