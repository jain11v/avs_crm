-- 50 chars was cutting off some longer customer names (multi-part Indian
-- names, "S/O ..." style entries, company names for corporate customers).
ALTER TABLE customers ALTER COLUMN name TYPE VARCHAR(100);
