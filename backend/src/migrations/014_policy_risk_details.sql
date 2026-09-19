-- Stores the insured risk (vehicle/health/property/etc.) for a policy, as
-- JSON. The fields captured vary by sub-vertical (a Private Car policy
-- records registration/engine/chassis numbers, a Health policy records
-- insured members) — see frontend/src/riskSchemas.js for the field set per
-- sub-vertical. Kept as a single flexible JSONB column rather than a rigid
-- table per risk type, since the field set is defined in application code,
-- not enforced by the database.
ALTER TABLE policies ADD COLUMN risk_details JSONB;
