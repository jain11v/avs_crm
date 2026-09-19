-- Most customers don't have an email on file — name + address/phone is how
-- they're actually identified in practice, so email can no longer be
-- required. The unique constraint on email stays: Postgres allows multiple
-- NULLs there, so it still prevents two customers sharing a real email.

ALTER TABLE customers ALTER COLUMN email DROP NOT NULL;
