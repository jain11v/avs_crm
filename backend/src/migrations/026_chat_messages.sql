-- One open, company-wide chat — every logged-in employee can read and
-- post to it, no rooms/channels, no page permission gate (same idea as
-- tasks: this is something everyone in the company needs regardless of
-- their role's page access). A message carries free text, an attached
-- file, or both.
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES employees(id),
    body VARCHAR(4000),
    file_original_name VARCHAR(255),
    file_stored_name VARCHAR(255) UNIQUE,
    file_content_type VARCHAR(255),
    file_size_bytes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
