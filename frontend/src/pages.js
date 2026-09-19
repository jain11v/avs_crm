// Canonical list of app pages for nav + role-based access control. Keys
// mirror backend/src/config/pages.js — keep both in sync.
export const PAGES = [
  { key: 'dashboard', label: 'Dashboard', path: '/' },
  { key: 'customers', label: 'Customers', path: '/customers' },
  { key: 'policies', label: 'Policies', path: '/policies' },
  { key: 'renewals', label: 'Renewals', path: '/renewals' },
  { key: 'insurers', label: 'Insurers', path: '/insurers' },
  { key: 'insurer_branches', label: 'Insurer branches', path: '/insurer-branches' },
  { key: 'employees', label: 'Employees', path: '/employees' },
  { key: 'departments', label: 'Departments', path: '/departments' },
  { key: 'designations', label: 'Designations', path: '/designations' },
  { key: 'branches', label: 'Broker branches', path: '/branches' },
  { key: 'verticals', label: 'Verticals', path: '/verticals' },
  { key: 'sub_verticals', label: 'Sub-verticals', path: '/sub-verticals' },
  { key: 'bank_accounts', label: 'Bank accounts', path: '/bank-accounts' },
  { key: 'expenses', label: 'Expenses', path: '/expenses' },
  { key: 'heads', label: 'Heads', path: '/heads' },
  { key: 'transactions', label: 'Transactions', path: '/transactions' },
  { key: 'customer_balances', label: 'Customer balances', path: '/customer-balances' },
  { key: 'commission_reconciliation', label: 'Commission reconciliation', path: '/commission-reconciliation' },
  { key: 'audit_log', label: 'Activity log', path: '/activity-log' },
  { key: 'attendance', label: 'Attendance', path: '/attendance' },
  { key: 'performance', label: 'Performance', path: '/performance' },
];

export const ROLES = ['employee', 'manager'];
