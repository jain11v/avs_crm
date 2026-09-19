-- Tasks now double as sales leads: a manager assigns a task with supporting
-- documents attached (entity_type='task' in documents, see below), and the
-- employee resolves it one of two ways — convert it into a policy (handled
-- in policyController.create via from_task_id, which moves the task's
-- documents onto the new policy) or mark it a lost lead with a reason.
ALTER TABLE tasks ADD COLUMN outcome VARCHAR(10) NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending', 'converted', 'lost'));
ALTER TABLE tasks ADD COLUMN policy_id INTEGER REFERENCES policies(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN lost_reason VARCHAR(300);

ALTER TABLE documents DROP CONSTRAINT documents_entity_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_entity_type_check
    CHECK (entity_type IN ('customer', 'policy', 'employee', 'task'));
