// Migration runner: applies whatever migrations in backend/src/migrations
// haven't been recorded yet, in filename order, against whichever database
// NODE_ENV resolves to (see ../config/loadEnv.js). Uses the existing pg
// pool, no new dependency — matches how the rest of this app avoids
// frameworks (no ORM, no migration library).
//
// Usage:
//   node src/scripts/migrate.js              apply pending migrations
//   node src/scripts/migrate.js --baseline    record every migration file
//                                             as already applied, WITHOUT
//                                             running its SQL — for a
//                                             database that already has
//                                             the schema from being built
//                                             up by hand before this
//                                             runner existed (prod).
//
// Prefer the npm scripts over calling this directly: `npm run migrate`,
// `npm run migrate:test`, `npm run migrate:prod`.
//
// The app's own DB login can only read/write data, not change the schema,
// so migrations connect as MIGRATE_DB_USER / MIGRATE_DB_PASSWORD (the
// postgres superuser) when set in the .env file, and without the app's
// 30s statement timeout. Must happen before config/db creates the pool.
const fs = require('fs');
const path = require('path');
require('../config/loadEnv');
if (process.env.MIGRATE_DB_USER) {
  process.env.DB_USER = process.env.MIGRATE_DB_USER;
  process.env.DB_PASSWORD = process.env.MIGRATE_DB_PASSWORD || '';
}
process.env.DB_STATEMENT_TIMEOUT_MS = '0';
const db = require('../config/db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const baseline = process.argv.includes('--baseline');

async function ensureTrackingTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function appliedFilenames() {
  const result = await db.query('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((r) => r.filename));
}

async function run() {
  const dbName = process.env.DB_NAME;
  const env = process.env.APP_ENV || 'development';
  console.log(`Migrating "${dbName}" (APP_ENV=${env})${baseline ? ' — baseline mode' : ''}`);

  await ensureTrackingTable();
  const applied = await appliedFilenames();

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('Nothing to do — up to date.');
    return;
  }

  for (const filename of pending) {
    if (baseline) {
      await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      console.log(`  recorded (not run): ${filename}`);
      continue;
    }

    const client = await db.pool.connect();
    try {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      console.log(`  applied: ${filename}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  FAILED: ${filename}`);
      console.error(err.message);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.pool.end());
