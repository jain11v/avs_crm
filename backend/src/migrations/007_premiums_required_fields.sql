-- Premium entry moves from a single manual "premium amount" field on the
-- policy to a breakdown of per-coverage premium lines (e.g. Own Damage,
-- Third Party, Personal Accident), each with its own GST. The policy's
-- premium_amount is now always derived by summing (prem + gst) across its
-- premium rows — see policyController.
--
-- Table is empty, so tightening these is safe.

ALTER TABLE premiums ALTER COLUMN coverage SET NOT NULL;
ALTER TABLE premiums ALTER COLUMN prem SET NOT NULL;
ALTER TABLE premiums ALTER COLUMN policy_id SET NOT NULL;

ALTER TABLE premiums ALTER COLUMN gst_percent SET DEFAULT 0;
ALTER TABLE premiums ALTER COLUMN gst_percent SET NOT NULL;
ALTER TABLE premiums ALTER COLUMN gst SET DEFAULT 0;
ALTER TABLE premiums ALTER COLUMN gst SET NOT NULL;

ALTER TABLE premiums ADD CONSTRAINT premiums_prem_nonnegative CHECK (prem >= 0);
ALTER TABLE premiums ADD CONSTRAINT premiums_gst_percent_nonnegative CHECK (gst_percent >= 0);

ALTER TABLE premiums ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX idx_premiums_policy_id ON premiums(policy_id);
