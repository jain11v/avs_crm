-- Roles become data instead of a hardcoded 3-value enum, so admins can
-- create custom roles (e.g. "Accountant") from the Admin page.
-- employee/manager/admin stay fixed "built-in" roles — is_builtin blocks
-- editing/deleting them (see roleController.js); new roles are purely
-- additive, never renaming or removing the built-ins.
--
-- is_elevated grants the same "manager-level" elevated access that
-- manager/admin already get via ad-hoc role checks scattered through the
-- app (see requireElevated in authMiddleware.js) — separate from page
-- access, which stays governed entirely by role_permissions. Deliberately
-- NOT wired into leave approval, which stays hierarchy-based (direct
-- reporting_to manager, or admin) regardless of this flag.
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    key VARCHAR(30) UNIQUE NOT NULL,
    label VARCHAR(50) NOT NULL,
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    is_elevated BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (key, label, is_builtin, is_elevated) VALUES
    ('admin', 'Admin', true, true),
    ('manager', 'Manager', true, true),
    ('employee', 'Employee', true, false);

-- employees.role: swap the hardcoded CHECK for an FK against roles(key).
-- Default RESTRICT (no ON DELETE clause) — same convention as every other
-- referenced-lookup FK in this app (employees_department_id_fkey,
-- employees_designation_id_fkey, etc.): block deleting a role while any
-- employee still holds it.
ALTER TABLE employees DROP CONSTRAINT employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_fkey
    FOREIGN KEY (role) REFERENCES roles(key);

-- role_permissions.role: same swap, but ON DELETE CASCADE — a role's
-- permission-matrix rows aren't independently meaningful once the role
-- itself is gone (same reasoning as sub_verticals under verticals).
ALTER TABLE role_permissions DROP CONSTRAINT role_permissions_role_check;
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_fkey
    FOREIGN KEY (role) REFERENCES roles(key) ON DELETE CASCADE;
