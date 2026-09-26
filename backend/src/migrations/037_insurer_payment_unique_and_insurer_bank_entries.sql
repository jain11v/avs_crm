-- A policy's premium is paid to the insurer exactly once. If the bank
-- ever debits a second payment for the same policy, that's a faulty
-- payment the insurer reverses a few days later — it is NOT a second
-- insurer_payments row. Instead it's recorded as a bank_entries Debit
-- linked to the insurer (balance the insurer owes us), cleared by a Credit
-- bank entry to the same insurer when the refund lands. See
-- insurerPaymentController.create() and insurerBalanceController.js.
ALTER TABLE insurer_payments ADD CONSTRAINT insurer_payments_policy_id_key UNIQUE (policy_id);

ALTER TABLE bank_entries ADD COLUMN insurer_id INTEGER REFERENCES insurers(id);

-- A bank entry links to at most one of employee / customer / insurer.
ALTER TABLE bank_entries DROP CONSTRAINT bank_entries_check;
ALTER TABLE bank_entries ADD CONSTRAINT bank_entries_single_link_check
    CHECK (num_nonnulls(employee_id, customer_id, insurer_id) <= 1);
