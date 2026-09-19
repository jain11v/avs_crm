-- Attaches files to a customer (KYC — ID proof, address proof) or a policy
-- (policy PDF, proposal form). One table for both, since the only
-- difference is which entity_id column it points at — entity_type keeps
-- them apart. Files live on local disk (backend/uploads/), named by a
-- random stored_filename so nothing about the path is guessable or
-- collides; the original filename is kept separately for display/download.
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('customer', 'policy')),
    entity_id INTEGER NOT NULL,
    filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL UNIQUE,
    content_type VARCHAR(100),
    size_bytes INTEGER,
    uploaded_by INTEGER REFERENCES employees(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id);
