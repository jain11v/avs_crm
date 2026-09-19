-- Payment mode is being dropped project-wide — a bank account alone (e.g. a
-- "Cash" account) now represents how money moved, so the payment_modes
-- reference table and its FK columns are no longer needed.

ALTER TABLE customer_payments DROP COLUMN payment_mode_id;
ALTER TABLE insurer_payments DROP COLUMN payment_mode_id;
ALTER TABLE transactions DROP COLUMN payment_mode_id;

DROP TABLE payment_modes;
