-- Commission % currently has no second set of eyes — an employee could set
-- any brokerage rate on a policy and it counts immediately toward
-- reconciliation. This mirrors the discount/cashback pattern already in
-- the app: an employee's commission entry starts 'pending' and needs a
-- manager/admin to approve it before it's treated as confirmed; a
-- manager/admin's own entry auto-approves (they're the checker, not the
-- maker). Defaulting existing rows to 'approved' — they predate this
-- feature and were all effectively admin-entered.
ALTER TABLE commission ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE commission ADD COLUMN set_by INTEGER REFERENCES employees(id);
ALTER TABLE commission ADD COLUMN approved_by INTEGER REFERENCES employees(id);
ALTER TABLE commission ADD COLUMN approved_at TIMESTAMP;
ALTER TABLE commission ADD COLUMN approver_remarks VARCHAR(255);
