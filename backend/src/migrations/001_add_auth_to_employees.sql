-- Adds authentication fields to the existing employees table.
-- Run this once against your database before starting the backend.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS role VARCHAR(30) DEFAULT 'employee'
    CHECK (role IN ('employee', 'manager', 'admin'));

-- Index for fast login lookups by email (email is already UNIQUE, this just
-- documents intent — Postgres already indexes UNIQUE columns automatically).

-- To create your first admin login, hash a password with bcrypt (see
-- backend/src/scripts/createAdmin.js) and run something like:
--
-- UPDATE employees
-- SET password_hash = '<bcrypt-hash-here>', role = 'admin'
-- WHERE email = 'your.email@example.com';
