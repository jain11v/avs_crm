-- Turns customers.type_of_customer and customers.source from free text into
-- proper reference tables — consistent with the rest of the schema
-- (broker_departments, payment_modes, verticals, etc.), and lets you manage
-- the list of options later by editing a table instead of code.

CREATE TABLE customer_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO customer_types (name) VALUES
    ('Individual'),
    ('Corporate'),
    ('Group')
ON CONFLICT (name) DO NOTHING;

INSERT INTO customer_sources (name) VALUES
    ('Referral'),
    ('Website'),
    ('Walk-in'),
    ('Cold Call'),
    ('Social Media'),
    ('Employee'),
    ('Advertisement'),
    ('Renewal')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE customers ADD COLUMN customer_type_id INTEGER REFERENCES customer_types(id);
ALTER TABLE customers ADD COLUMN source_id INTEGER REFERENCES customer_sources(id);

CREATE INDEX idx_customers_customer_type ON customers(customer_type_id);
CREATE INDEX idx_customers_source_id ON customers(source_id);

-- Best-effort migration of any existing free-text values into the new FK
-- columns, matching on name. Anything that doesn't match an existing option
-- (typos, values outside the predefined list) is left NULL — check for
-- those with the SELECT below and either fix them manually or add the
-- missing option to customer_types/customer_sources first.
UPDATE customers c
SET customer_type_id = ct.id
FROM customer_types ct
WHERE c.type_of_customer IS NOT NULL AND lower(c.type_of_customer) = lower(ct.name);

UPDATE customers c
SET source_id = cs.id
FROM customer_sources cs
WHERE c.source IS NOT NULL AND lower(c.source) = lower(cs.name);

-- Find rows that had a value but didn't match any predefined option:
-- SELECT id, name, type_of_customer FROM customers WHERE type_of_customer IS NOT NULL AND customer_type_id IS NULL;
-- SELECT id, name, source FROM customers WHERE source IS NOT NULL AND source_id IS NULL;

-- The old text columns are left in place (not dropped) so no data is lost
-- and you can double check the migration above before removing them. Once
-- you've confirmed customer_type_id/source_id look right, you can run:
--
--   ALTER TABLE customers DROP COLUMN type_of_customer;
--   ALTER TABLE customers DROP COLUMN source;
