-- Which pages each non-admin role can see, for the new admin "Users &
-- permissions" page. Admin is deliberately never restricted here (the app
-- hardcodes admin = full access) so an admin can never lock themselves out
-- by misconfiguring this table.
--
-- Seeded with every page allowed for both employee and manager, matching
-- today's behavior (nothing was restricted before this existed) — an admin
-- narrows it down from here rather than everyone losing access on upgrade.
CREATE TABLE role_permissions (
    role VARCHAR(20) NOT NULL CHECK (role IN ('employee', 'manager')),
    page_key VARCHAR(50) NOT NULL,
    PRIMARY KEY (role, page_key)
);

INSERT INTO role_permissions (role, page_key)
SELECT r.role, p.page_key
FROM (VALUES ('employee'), ('manager')) AS r(role)
CROSS JOIN (VALUES
    ('dashboard'), ('customers'), ('policies'), ('renewals'), ('insurers'),
    ('insurer_branches'), ('employees'), ('departments'), ('designations'),
    ('branches'), ('verticals'), ('sub_verticals'), ('bank_accounts'),
    ('expenses'), ('heads'), ('transactions'), ('customer_balances')
) AS p(page_key);
