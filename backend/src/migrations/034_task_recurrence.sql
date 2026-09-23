-- A repeating task (e.g. "call this customer monthly"). Completing an
-- occurrence via taskController.updateStatus() auto-creates the next one,
-- structurally the same self-referencing-chain pattern as policy renewals
-- (policies.renewed_from_policy_id). recurrence_parent_id is pure
-- traceability — never required for the feature to function.
ALTER TABLE tasks ADD COLUMN recurrence VARCHAR(10) NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly'));
ALTER TABLE tasks ADD COLUMN recurrence_parent_id INTEGER REFERENCES tasks(id);
