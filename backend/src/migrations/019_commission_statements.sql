-- A commission_receipt already records what was received for ONE policy.
-- In practice an insurer pays commission as a single lump sum covering
-- many policies at once, with their own statement (Excel/CSV) listing
-- policy-wise amounts. This groups the receipts created from importing one
-- such statement, so you can see which batch a receipt came from and the
-- statement's own totals, without changing how a receipt itself works.
CREATE TABLE commission_statements (
    id SERIAL PRIMARY KEY,
    insurer_id INTEGER REFERENCES insurers(id),
    filename VARCHAR(255),
    bank_account_id INTEGER REFERENCES bank_accounts(id),
    reference_id VARCHAR(100),
    remarks VARCHAR(255),
    matched_count INTEGER NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    uploaded_by INTEGER REFERENCES employees(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE commission_receipts ADD COLUMN commission_statement_id INTEGER REFERENCES commission_statements(id);
