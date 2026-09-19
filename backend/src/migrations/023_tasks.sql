-- A reporting manager assigns a task to their direct report (via the
-- existing employees.reporting_to relationship — no new hierarchy
-- concept). The employee sees it on their own dashboard and updates its
-- status themselves; only the assigner (or an admin) can edit/delete it.
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(2000),
    assigned_to INTEGER NOT NULL REFERENCES employees(id),
    assigned_by INTEGER NOT NULL REFERENCES employees(id),
    due_date DATE,
    priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to, status);
CREATE INDEX idx_tasks_assigned_by ON tasks(assigned_by);
