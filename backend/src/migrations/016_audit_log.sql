-- Who changed what, and when, for the money-moving tables: policies,
-- commission, commission receipts, customer payments, insurer payments,
-- and discount/cashback adjustments. Deliberately not a generic
-- every-table-every-column log (see conversation) — scoped to what
-- reconciliation actually needs.
--
-- `changes` is always shaped {field: {from, to}} — for a create, `from` is
-- null for every field; for a delete, `to` is null for every field; for an
-- update/approve/reject, both sides are populated. One shape, one renderer.
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(30) NOT NULL,
    entity_id INTEGER NOT NULL,
    policy_id INTEGER REFERENCES policies(id),
    action VARCHAR(20) NOT NULL,
    changes JSONB,
    employee_id INTEGER REFERENCES employees(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_policy_id ON audit_log(policy_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
