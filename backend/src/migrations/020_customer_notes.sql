-- The rest of this app is purely transactional (policies, payments) — this
-- is the actual "relationship" layer of the CRM: a timeline of calls/
-- emails/meetings/notes per customer, with an optional follow-up date so
-- "who do I need to call back, and when" is answerable without digging
-- through policy history.
CREATE TABLE customer_notes (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    employee_id INTEGER REFERENCES employees(id),
    note_type VARCHAR(20) NOT NULL DEFAULT 'note' CHECK (note_type IN ('call', 'email', 'meeting', 'note', 'other')),
    content VARCHAR(1000) NOT NULL,
    follow_up_date DATE,
    follow_up_done BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_notes_customer ON customer_notes(customer_id, created_at DESC);
CREATE INDEX idx_customer_notes_followup ON customer_notes(follow_up_date) WHERE follow_up_date IS NOT NULL AND NOT follow_up_done;
