-- Builds out the (previously placeholder, empty) expense and heads tables
-- into a real office-expense approval workflow: an employee records an
-- expense, and a senior (manager/admin) approves or rejects it.
--
-- Both tables have zero rows today, so this is safe to run as a hard
-- schema change rather than a data-preserving migration.

-- heads = expense categories (e.g. "Office Rent", "Stationery", "Travel").
ALTER TABLE heads ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE heads ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE heads ALTER COLUMN name SET NOT NULL;
ALTER TABLE heads ADD CONSTRAINT heads_name_key UNIQUE (name);

-- expense: drop the two placeholder columns (made_by duplicated user_id;
-- approved was a bare boolean with no record of who decided or why) in
-- favor of a proper status + approver trail.
ALTER TABLE expense DROP COLUMN made_by;
ALTER TABLE expense DROP COLUMN approved;

ALTER TABLE expense ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE expense ALTER COLUMN amount SET NOT NULL;
ALTER TABLE expense ADD CONSTRAINT expense_amount_positive CHECK (amount > 0);

ALTER TABLE expense ADD COLUMN description VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE expense ALTER COLUMN description DROP DEFAULT;

ALTER TABLE expense ADD COLUMN expense_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE expense ADD COLUMN head_id INTEGER REFERENCES heads(id);
ALTER TABLE expense ADD COLUMN remarks VARCHAR(255);

ALTER TABLE expense ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE expense ADD COLUMN approved_by INTEGER REFERENCES employees(id);
ALTER TABLE expense ADD COLUMN approved_at TIMESTAMP;
ALTER TABLE expense ADD COLUMN approver_remarks VARCHAR(255);

ALTER TABLE expense ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX idx_expense_status ON expense(status);
CREATE INDEX idx_expense_user_id ON expense(user_id);
