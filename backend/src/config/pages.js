// Canonical list of app "pages" for role-based access control. Keys are
// stable identifiers referenced by role_permissions rows and mirrored on
// the frontend (frontend/src/pages.js) — changing a key here means
// changing it there too, and migrating any stored rows.
const PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'customers', label: 'Customers' },
  { key: 'policies', label: 'Policies' },
  { key: 'renewals', label: 'Renewals' },
  { key: 'insurers', label: 'Insurers' },
  { key: 'insurer_branches', label: 'Insurer branches' },
  { key: 'employees', label: 'Employees' },
  { key: 'departments', label: 'Departments' },
  { key: 'designations', label: 'Designations' },
  { key: 'branches', label: 'Broker branches' },
  { key: 'verticals', label: 'Verticals' },
  { key: 'sub_verticals', label: 'Sub-verticals' },
  { key: 'bank_accounts', label: 'Bank accounts' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'heads', label: 'Heads' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'customer_balances', label: 'Customer balances' },
  { key: 'commission_reconciliation', label: 'Commission reconciliation' },
  { key: 'audit_log', label: 'Activity log' },
  { key: 'attendance', label: 'Attendance' },
];

const PAGE_KEYS = PAGES.map((p) => p.key);
const ROLES = ['employee', 'manager'];

module.exports = { PAGES, PAGE_KEYS, ROLES };
