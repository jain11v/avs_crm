-- Manual bank ledger entries — a Credit or Debit not tied to any of the
-- app's existing money flows (expense, customer/insurer payment, commission
-- receipt, policy adjustment), e.g. a bank charge, interest, or an informal
-- cash-for-bank exchange with someone. Posts straight to the transactions
-- ledger like customer/insurer payments do (no approval workflow) — see
-- bankEntryController.js. No update/delete, same convention as
-- customer_payments/insurer_payments: once posted, it's a settled record.
--
-- employee_id/customer_id is an optional link to whoever this entry
-- leaves a running balance with (at most one of the two — see the CHECK
-- below) — e.g. money we still owe them, or they still owe us, from an
-- entry that wasn't a full, self-contained transaction. Shows up as a
-- running net total on Customer/Employee balances.
CREATE TABLE bank_entries (
    id SERIAL PRIMARY KEY,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
    type_of_transaction VARCHAR(10) NOT NULL CHECK (type_of_transaction IN ('Debit', 'Credit')),
    head_id INTEGER NOT NULL REFERENCES heads(id),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    remarks VARCHAR(255),
    employee_id INTEGER REFERENCES employees(id),
    customer_id INTEGER REFERENCES customers(id),
    created_by INTEGER REFERENCES employees(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (employee_id IS NULL OR customer_id IS NULL)
);

ALTER TABLE transactions ADD COLUMN bank_entry_id INTEGER REFERENCES bank_entries(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_bank_entry_id_key UNIQUE (bank_entry_id);
