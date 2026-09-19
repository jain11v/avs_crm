-- Every policy has two separate cash flows: premium collected FROM the
-- customer, and premium paid OUT to the insurer. Neither happens in one
-- shot — customers often pay in installments across multiple methods, and
-- one payment can cover several of a customer's policies at once. Discounts
-- and cashbacks adjust what a customer owes/receives and need a senior's
-- sign-off before they count (mirrors the expense approval workflow).

-- customer_payments: one receipt from a customer, which can be split across
-- several of their policies via customer_payment_allocations. Posts a
-- single Credit transaction for the full amount (see customerPaymentController).
CREATE TABLE customer_payments (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payment_mode_id INTEGER REFERENCES payment_modes(id),
    bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_id VARCHAR(100),
    remarks VARCHAR(255),
    received_by INTEGER REFERENCES employees(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_payment_allocations (
    id SERIAL PRIMARY KEY,
    payment_id INTEGER NOT NULL REFERENCES customer_payments(id) ON DELETE CASCADE,
    policy_id INTEGER NOT NULL REFERENCES policies(id),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- insurer_payments: money paid out for one policy's premium (always a
-- single policy per payment). Posts a single Debit transaction.
CREATE TABLE insurer_payments (
    id SERIAL PRIMARY KEY,
    policy_id INTEGER NOT NULL REFERENCES policies(id),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payment_mode_id INTEGER REFERENCES payment_modes(id),
    bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_id VARCHAR(100),
    remarks VARCHAR(255),
    paid_by INTEGER REFERENCES employees(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- policy_adjustments: discount (reduces what the customer owes — pure
-- accounting entry, no bank movement) or cashback (an actual payout back
-- to the customer — requires a bank account and posts a Debit transaction
-- once approved, exactly like an expense). Both need senior approval
-- before they count.
CREATE TABLE policy_adjustments (
    id SERIAL PRIMARY KEY,
    policy_id INTEGER NOT NULL REFERENCES policies(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('discount', 'cashback')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    bank_account_id INTEGER REFERENCES bank_accounts(id),
    remarks VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_by INTEGER REFERENCES employees(id),
    approved_by INTEGER REFERENCES employees(id),
    approved_at TIMESTAMP,
    approver_remarks VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT policy_adjustments_cashback_needs_bank
        CHECK (type <> 'cashback' OR bank_account_id IS NOT NULL)
);

ALTER TABLE transactions ADD COLUMN customer_payment_id INTEGER REFERENCES customer_payments(id);
ALTER TABLE transactions ADD COLUMN insurer_payment_id INTEGER REFERENCES insurer_payments(id);
ALTER TABLE transactions ADD COLUMN policy_adjustment_id INTEGER REFERENCES policy_adjustments(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_customer_payment_id_key UNIQUE (customer_payment_id);
ALTER TABLE transactions ADD CONSTRAINT transactions_insurer_payment_id_key UNIQUE (insurer_payment_id);
ALTER TABLE transactions ADD CONSTRAINT transactions_policy_adjustment_id_key UNIQUE (policy_adjustment_id);

CREATE INDEX idx_customer_payments_customer_id ON customer_payments(customer_id);
CREATE INDEX idx_customer_payment_allocations_payment_id ON customer_payment_allocations(payment_id);
CREATE INDEX idx_customer_payment_allocations_policy_id ON customer_payment_allocations(policy_id);
CREATE INDEX idx_insurer_payments_policy_id ON insurer_payments(policy_id);
CREATE INDEX idx_policy_adjustments_policy_id ON policy_adjustments(policy_id);
CREATE INDEX idx_policy_adjustments_status ON policy_adjustments(status);
