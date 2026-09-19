-- Commission reconciliation: compute what commission you're owed per
-- policy (from commission.brok_percent / tp_brok_percent / gst) and record
-- what the insurer actually paid, so the two can be compared.
--
-- Premium rows aren't otherwise typed, but computing the "TP" (Third
-- Party) share of a motor policy's commission needs to know which
-- coverage row is the TP premium — brok_percent applies to everything
-- else, tp_brok_percent applies only to rows flagged here. Defaults to
-- false, so existing rows are treated as all non-TP (equivalent to
-- today's simple brok_percent-on-everything behaviour) until edited.
ALTER TABLE premiums ADD COLUMN is_third_party BOOLEAN NOT NULL DEFAULT FALSE;

-- One row per policy (like insurer_payments, but the reverse direction:
-- money the insurer pays the broker back, not money the broker pays the
-- insurer). Marking a policy's commission "received" posts a real Credit
-- transaction, mirroring how insurer_payments posts a Debit.
CREATE TABLE commission_receipts (
    id SERIAL PRIMARY KEY,
    policy_id INTEGER NOT NULL UNIQUE REFERENCES policies(id),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_id VARCHAR(100),
    remarks VARCHAR(255),
    received_by INTEGER REFERENCES employees(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE transactions ADD COLUMN commission_receipt_id INTEGER REFERENCES commission_receipts(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_commission_receipt_id_key UNIQUE (commission_receipt_id);
