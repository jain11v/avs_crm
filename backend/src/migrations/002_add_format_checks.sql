-- Adds format validation for identity/contact fields on customers.
-- All fields stay optional — CHECK constraints automatically pass when the
-- value is NULL, they only fire when a value is actually present.

ALTER TABLE customers ADD CONSTRAINT customers_phone_format
    CHECK (phone IS NULL OR phone ~ '^[6-9][0-9]{9}$');

ALTER TABLE customers ADD CONSTRAINT customers_aadhar_format
    CHECK (aadhar IS NULL OR aadhar ~ '^[0-9]{12}$');

ALTER TABLE customers ADD CONSTRAINT customers_pan_format
    CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$');

ALTER TABLE customers ADD CONSTRAINT customers_gst_format
    CHECK (gst IS NULL OR gst ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');

-- Same checks for employees (phone, aadhar, pan — no gst on that table),
-- since the schema has the same fields there. No employee create/edit
-- screen exists yet, but this keeps the database itself consistent either
-- way (e.g. if a row is inserted directly via SQL).

ALTER TABLE employees ADD CONSTRAINT employees_phone_format
    CHECK (phone IS NULL OR phone ~ '^[6-9][0-9]{9}$');

ALTER TABLE employees ADD CONSTRAINT employees_aadhar_format
    CHECK (aadhar IS NULL OR aadhar ~ '^[0-9]{12}$');

ALTER TABLE employees ADD CONSTRAINT employees_pan_format
    CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$');

-- NOTE: if this migration fails with a "constraint violated by some row"
-- error, it means existing data in the table doesn't match these formats
-- (e.g. a phone number saved with spaces/dashes, or a lowercase PAN).
-- Find and fix offending rows first, for example:
--
--   SELECT id, phone FROM customers WHERE phone IS NOT NULL AND phone !~ '^[6-9][0-9]{9}$';
--   SELECT id, pan FROM customers WHERE pan IS NOT NULL AND pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$';
--
-- then either correct or NULL out the bad values, and re-run this file.
