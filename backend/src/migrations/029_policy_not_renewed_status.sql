-- markLost() now marks a lost renewal 'Not Renewed' instead of 'Cancelled'
-- — a lost renewal isn't the same thing as a genuine mid-term policy
-- cancellation, and (unlike Cancelled) it should keep showing up in the
-- renewals-due list/alert. 'Cancelled' stays a valid value for the
-- unrelated genuine-cancellation case (see policyController.remove()'s
-- error hint) even though nothing currently sets it from the UI.
ALTER TABLE policies DROP CONSTRAINT policies_status_check;
ALTER TABLE policies ADD CONSTRAINT policies_status_check
    CHECK (status IN ('Active', 'Expired', 'Cancelled', 'Lapsed', 'Not Renewed'));
