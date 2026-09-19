// One-time helper to set a password on an existing employee row and make
// them an admin. Run with: npm run create-admin
//
// Usage: node src/scripts/createAdmin.js <email> <password>

const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function run() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: node src/scripts/createAdmin.js <email> <password>');
    process.exit(1);
  }

  const existing = await db.query('SELECT id FROM employees WHERE email = $1', [email]);
  if (existing.rows.length === 0) {
    console.error(`No employee found with email ${email}. Insert the employee row first.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.query(
    `UPDATE employees SET password_hash = $1, role = 'admin' WHERE email = $2`,
    [passwordHash, email]
  );

  console.log(`✅ ${email} can now log in as admin.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
