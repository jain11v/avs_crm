-- Leave application/approval workflow — a real request object layered over
-- the existing per-day attendance record (attendance.status='leave' already
-- exists for ad-hoc marking, but has no apply/approve step, no leave type,
-- and no balance). Approving a request also writes/upserts the covered days
-- into `attendance` (status='leave'), same ON CONFLICT pattern
-- attendanceController.mark() already uses, so existing attendance
-- reporting keeps working with zero changes there.
CREATE TABLE leave_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    leave_type VARCHAR(10) NOT NULL CHECK (leave_type IN ('paid', 'unpaid')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_by INTEGER REFERENCES employees(id),
    approved_by INTEGER REFERENCES employees(id),
    approved_at TIMESTAMP,
    approver_remarks VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT leave_requests_dates_valid CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_requests_employee_id ON leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);

-- Annual paid-leave entitlement per employee — a single current figure
-- (not versioned per year), edited the same place salary is (Employee
-- form). "Used this year" / "remaining" are always computed live from
-- approved paid leave_requests, never stored, so they can't drift.
ALTER TABLE employees ADD COLUMN annual_leave_entitlement NUMERIC NOT NULL DEFAULT 12;
