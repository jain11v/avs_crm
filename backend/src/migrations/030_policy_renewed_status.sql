-- When a policy gets renewed, the source policy's own status flips to
-- 'Renewed' (set by policyController.create() when it inserts a policy
-- with renewed_from_policy_id) instead of just sitting at whatever it was
-- before (Active/Lapsed/Not Renewed) — see the comment there for why.
ALTER TABLE policies DROP CONSTRAINT policies_status_check;
ALTER TABLE policies ADD CONSTRAINT policies_status_check
    CHECK (status IN ('Active', 'Expired', 'Cancelled', 'Lapsed', 'Not Renewed', 'Renewed'));
