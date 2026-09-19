-- Tracks who marked a renewal lost and when, so it can be counted per
-- employee (mirrors tasks.lost_reason's role for leads) — see
-- policyController.markLost().
ALTER TABLE policies ADD COLUMN lost_by INTEGER REFERENCES employees(id);
ALTER TABLE policies ADD COLUMN lost_at TIMESTAMP;
