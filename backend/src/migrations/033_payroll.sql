-- One row per employee per calendar month. "Generate payroll" (payrollController)
-- creates a draft row per active employee for a month, snapshotting their
-- current salary and pre-filling a deduction for approved unpaid leave taken
-- that month. Marking a row "Paid" inserts an already-approved `expense` row
-- (see payrollController.pay) so payroll flows through the existing expense
-- ledger, Expenses page, and the P&L/cash-flow/expense-by-category dashboard
-- views automatically — no separate money pipeline.
CREATE TABLE payroll_payments (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    month DATE NOT NULL, -- always the 1st of the month
    base_salary NUMERIC NOT NULL,
    unpaid_leave_days NUMERIC NOT NULL DEFAULT 0,
    deduction NUMERIC NOT NULL DEFAULT 0,
    net_amount NUMERIC NOT NULL CHECK (net_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'paid')),
    bank_account_id INTEGER REFERENCES bank_accounts(id),
    head_id INTEGER REFERENCES heads(id),
    expense_id INTEGER REFERENCES expense(id),
    remarks VARCHAR(255),
    generated_by INTEGER REFERENCES employees(id),
    paid_by INTEGER REFERENCES employees(id),
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (employee_id, month)
);

CREATE INDEX idx_payroll_payments_month ON payroll_payments(month);
