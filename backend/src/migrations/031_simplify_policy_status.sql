-- Collapse policy status down to exactly three values: Active, Renewed,
-- Not Renewed. 'Lapsed'/'Expired' never added information beyond what the
-- cover dates already show (see the removed deriveStatus()/refreshPolicyStatus
-- job), and 'Cancelled' conflated a rare genuine mid-term cancellation with
-- "didn't renew" — both collapse into 'Not Renewed' here.
UPDATE policies SET status = 'Not Renewed' WHERE status IN ('Cancelled', 'Expired', 'Lapsed');

ALTER TABLE policies DROP CONSTRAINT policies_status_check;
ALTER TABLE policies ADD CONSTRAINT policies_status_check
    CHECK (status IN ('Active', 'Renewed', 'Not Renewed'));
