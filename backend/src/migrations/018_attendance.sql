-- One row per employee per day. Self-service: an employee checks in
-- (status defaults to 'present', check_in_time set) and checks out later
-- (check_out_time set); half-day/leave are marked directly without a
-- check-in, since those days don't have one. No row for a given date means
-- nothing was recorded — this is not the same as 'absent', which is only
-- ever set explicitly (there's no attendance concept of working days /
-- weekly offs here to infer it against).
CREATE TABLE attendance (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    date DATE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'half_day', 'leave')),
    check_in_time TIMESTAMP,
    check_out_time TIMESTAMP,
    remarks VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (employee_id, date)
);

CREATE INDEX idx_attendance_employee_date ON attendance(employee_id, date);
