-- Commission is a single record per policy (unlike premiums, which can have
-- several coverage rows) — the broker's own brokerage % (and TP brokerage %
-- for motor policies) plus the GST charged on that commission. Optional:
-- a policy can be saved without one and it can be added/edited later.
--
-- Table is empty, so tightening these is safe.

ALTER TABLE commission ALTER COLUMN policy_id SET NOT NULL;
ALTER TABLE commission ADD CONSTRAINT commission_policy_id_key UNIQUE (policy_id);

ALTER TABLE commission ADD CONSTRAINT commission_brok_percent_nonnegative
    CHECK (brok_percent IS NULL OR brok_percent >= 0);
ALTER TABLE commission ADD CONSTRAINT commission_tp_brok_percent_nonnegative
    CHECK (tp_brok_percent IS NULL OR tp_brok_percent >= 0);
ALTER TABLE commission ADD CONSTRAINT commission_gst_nonnegative
    CHECK (gst IS NULL OR gst >= 0);

ALTER TABLE commission ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
