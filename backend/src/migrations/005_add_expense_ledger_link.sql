-- Links expenses to the bank ledger: every expense records which account it
-- will be paid from, and once a senior approves it, the system posts a
-- matching Debit transaction against that account automatically (see
-- expenseController.decide). transactions.expense_id lets that posting be
-- traced back to its expense and prevents posting the same expense twice.
--
-- Both tables are still empty in this environment, so tightening NOT NULLs
-- on transactions is safe here.

ALTER TABLE expense ADD COLUMN bank_account_id INTEGER REFERENCES bank_accounts(id);
ALTER TABLE expense ALTER COLUMN bank_account_id SET NOT NULL;

ALTER TABLE transactions ADD COLUMN expense_id INTEGER REFERENCES expense(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_expense_id_key UNIQUE (expense_id);

ALTER TABLE transactions ALTER COLUMN bank_id SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN amount SET NOT NULL;
ALTER TABLE transactions ADD CONSTRAINT transactions_amount_positive CHECK (amount > 0);
ALTER TABLE transactions ALTER COLUMN type_of_transaction SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN date_of_transaction SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE transactions ALTER COLUMN date_of_transaction SET NOT NULL;

CREATE INDEX idx_transactions_bank_id ON transactions(bank_id);
