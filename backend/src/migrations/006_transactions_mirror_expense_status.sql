-- Every expense now gets its ledger row the moment it's submitted (status
-- 'pending'), not only once approved. The row is then updated in place —
-- never re-inserted — as the expense moves to 'approved' or 'rejected', so
-- there is exactly one transaction per expense throughout its life.
--
-- The account balance (see transactionController) only sums 'approved'
-- rows, so unauthorized/pending spend never affects the real balance —
-- it's visible in the ledger list, just not counted yet.

ALTER TABLE transactions ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected'));

-- Existing rows with no linked expense are historical manual entries that
-- were already settled before this workflow existed — count them as
-- approved so they keep contributing to the account balance.
UPDATE transactions SET status = 'approved' WHERE expense_id IS NULL;

-- Backfill: any expense created before this migration won't have a ledger
-- row yet. Give it one now, mirroring its current status, so nothing that
-- already exists is left invisible in the ledger.
INSERT INTO transactions (user_id, date_of_transaction, bank_id, type_of_transaction, amount, head, remarks, expense_id, status)
SELECT e.user_id, e.expense_date, e.bank_account_id, 'Debit', e.amount, e.head_id, e.description, e.id, e.status
FROM expense e
WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.expense_id = e.id);
