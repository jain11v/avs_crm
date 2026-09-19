-- documentController.js was extended to support entity_type='employee'
-- (files a manager sends to their reports) but the table's original
-- CHECK constraint from 021_documents.sql still only allowed
-- 'customer'/'policy', so every employee-file upload failed at the DB.
ALTER TABLE documents DROP CONSTRAINT documents_entity_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_entity_type_check
    CHECK (entity_type IN ('customer', 'policy', 'employee'));
