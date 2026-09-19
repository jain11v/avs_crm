# Bugs Found — Insurance CRM

Audit date: 2026-09-19. Scope: full backend (`backend/src`, Node/Express + raw `pg` SQL) and frontend (`frontend/src`, React+Vite). Method: manual read-through of every controller, route, and migration; targeted greps for known risk patterns (SQL injection, timezone-unsafe date handling, duplicated money math); `npm test` run from `backend/`. Every finding below was confirmed by reading the actual code — nothing here is speculative.

---

## Critical

### 1. `customers` and `policies` (and their sub-resources) have no server-side page-permission check
**Files:** `backend/src/routes/customerRoutes.js`, `backend/src/routes/policyRoutes.js`, `backend/src/routes/premiumRoutes.js`, `backend/src/routes/customerPaymentRoutes.js`, `backend/src/routes/insurerPaymentRoutes.js`, `backend/src/routes/policyAdjustmentRoutes.js`

**Description:** The app's access-control model is `requireAuth` (must be logged in) + `requirePage(key)` (must have that page enabled in `role_permissions` for their role — admin always passes). This is applied consistently to every other entity: departments, designations, branches, insurers, insurer branches, bank accounts, heads, expenses, transactions, customer balances, commission reconciliation, audit log, attendance, sub-verticals, verticals, employees.

`customers` and `policies` are both listed as toggleable pages in `backend/src/config/pages.js` and `frontend/src/pages.js` (an admin can flip an "employee" or "manager" role's access to the Customers/Policies pages on/off in the Role Permissions screen), but `customerRoutes.js` and `policyRoutes.js` only call `router.use(requireAuth)` — there is no `router.use(requirePage('customers'))` / `requirePage('policies'))` at all. The same gap applies to the routes that hang off those entities: `premiumRoutes.js`, `customerPaymentRoutes.js`, `insurerPaymentRoutes.js`, `policyAdjustmentRoutes.js` have no page gate either (though these four have no dedicated page key, so they may be intentionally sub-resource-only — customers/policies are the ones with an explicit, user-configurable toggle that the backend silently ignores).

**Failure scenario:** An admin creates an "employee" role account and, via the Role Permissions screen, deliberately leaves "Customers" and "Policies" unchecked for that role (e.g. an accounts-only or attendance-only staff member who should never see customer/policy data). The frontend nav correctly hides those links. But that employee's browser already holds a valid session cookie, so they can call `GET /api/customers`, `GET /api/policies`, `POST /api/customers`, `PUT /api/policies/:id`, `DELETE /api/customers/:id`, etc. directly (curl, browser devtools, Postman) and the backend will serve/mutate the data anyway, because nothing checks their `role_permissions` row for those two keys. This is the core PII/business data of the app (names, phone numbers, Aadhar/PAN, policy premiums, commission) and the one restriction meant to gate it is enforced only in the UI.

**Suggested fix:** Add `router.use(requirePage('customers'))` to `customerRoutes.js` and `router.use(requirePage('policies'))` to `policyRoutes.js`, mirroring every other entity route. Decide deliberately (and document with a comment, per this codebase's existing convention) whether `premiums`, `customer-payments`, `insurer-payments`, and `policy-adjustments` should inherit access from their parent policy/customer or get their own gate.

---

### 2. Privilege escalation via `PUT /api/employees/:id` — any role with the "Employees" page can promote themselves (or anyone) to admin
**File:** `backend/src/controllers/employeeController.js:111-116` (`EDITABLE_FIELDS`), `:176-220` (`update`); route: `backend/src/routes/employeeRoutes.js:8-15`

**Description:** `employeeRoutes.js` deliberately restricts `PATCH /api/employees/:id/credentials` (which sets `role` and/or `password`) to `requireRole('admin')`, with a comment explaining this is intentional: *"Admin-only regardless of page permission — this is what turns an employee record into a login ('create user') or changes their role."*

However, the general-purpose `PUT /api/employees/:id` (the `update` handler, gated only by `requirePage('employees')`, no role check) includes `'role'` in its own `EDITABLE_FIELDS` list (`employeeController.js:115`). Any request body field named `role` is accepted and written straight into the `employees` table via the same dynamic `SET` clause used for every other editable field — there is no exclusion, no `requireRole` check, and no restriction on editing one's own record vs. someone else's.

**Failure scenario:** Any account whose role has "Employees" page access (a plausible grant for HR/ops staff who need to update phone numbers, addresses, department, etc.) can send `PUT /api/employees/<their own id>` with body `{"role": "admin"}` and immediately become an admin — full access to every page and every other employee's credentials, completely bypassing the `/credentials` endpoint's admin-only gate that was specifically designed to prevent this. It also lets that account silently change any other employee's role the same way.

**Suggested fix:** Remove `'role'` from `EDITABLE_FIELDS` in the general `update` handler (role changes should only ever go through `setCredentials`, which is already correctly admin-gated), or add an explicit check in `update()` that strips/rejects a `role` field unless `req.employee.role === 'admin'`.

---

## Medium

### 3. Duplicated `round2` / commission-math implementation instead of a shared function
**Files:** `backend/src/utils/premiumCalc.js:7-9` (`round2`) vs. `backend/src/controllers/commissionReconciliationController.js:7-9` (its own private `round2`) and `:36-50` (`computeExpectedCommission`)

**Description:** `premiumCalc.js` exports a shared `round2()` used by policy premium math. `commissionReconciliationController.js` defines its own separate `round2()` with the identical body instead of importing the shared one, and implements its own commission-expectation formula (`computeExpectedCommission`) rather than centralizing it alongside the other money-math utilities in `utils/`. Both currently compute the same thing, so there is no live bug today, but this is exactly the kind of duplication the codebase's own money-math convention (single shared `round2`, referenced in the project's own commit comments) was meant to avoid. If the rounding rule is ever changed (e.g. banker's rounding, different EPSILON handling) in `premiumCalc.js`, this second copy will silently drift and produce inconsistent totals between the Policies screen and the Commission Reconciliation / statement-matching screens.

**Suggested fix:** Have `commissionReconciliationController.js` `require('../utils/premiumCalc').round2` instead of redefining it, and consider moving `computeExpectedCommission` into `utils/commissionCalc.js` (which already exists and holds the related `validateCommission`/`toPercentOrNull` logic) for a single source of truth.

---

## Low

### 4. CSV export filename date can be off by one day in the early-morning window
**Files:** `backend/src/controllers/customerBalanceController.js:115`, `backend/src/controllers/commissionReconciliationController.js:251`

**Description:** Both `exportCsv` handlers build today's date for the download filename with `new Date().toISOString().slice(0, 10)`. `.toISOString()` converts the current instant to UTC before formatting. On this server (Asia/Calcutta, UTC+5:30, per project's established timezone-bug history — see `backend/src/config/db.js`'s DATE type-parser fix and `attendanceController.js`'s `getToday()`, which correctly uses `toLocaleDateString('en-CA')` for exactly this reason), any export run between local midnight and 5:30 AM will be dated with *yesterday's* date, because UTC is still on the previous calendar day at that point.

**Impact:** Cosmetic only — the downloaded file's contents are unaffected (they come from parameterized `CURRENT_DATE`-based SQL, not this JS `today` value); only the suggested filename (`customer-balances-2026-09-18.csv` instead of `...-09-19.csv`) is wrong, and only during a roughly 5.5-hour overnight window.

**Suggested fix:** Match the pattern already used in `attendanceController.js:8` — replace `new Date().toISOString().slice(0, 10)` with `new Date().toLocaleDateString('en-CA')` in both files.

---

### 5. `premiumRoutes.js`, `customerPaymentRoutes.js`, `insurerPaymentRoutes.js`, `policyAdjustmentRoutes.js` have no page-level gate at all
**Files:** as named, all under `backend/src/routes/`

**Description:** Listed separately from Finding #1 because these four don't have a dedicated key in `config/pages.js`/`pages.js` the way `customers`/`policies` do, so this may be intentional ("access follows the parent policy/customer view, not a standalone toggle"). Still worth flagging explicitly: right now *any* authenticated employee, regardless of role or `role_permissions`, can list/create customer payments, insurer payments, and policy adjustments (discount/cashback requests) for *any* customer or policy in the system via these endpoints, with only `requireAuth` — no ownership check, no page check. `policyAdjustmentRoutes.js` does correctly gate the `/decision` approval step to admin/manager via `requireRole`, but plain create/list/update are open to every logged-in account.

**Suggested fix:** Confirm with the product owner whether this is intended (money-adjacent data with zero role-based restriction); if not, add `requirePage('customers')`/`requirePage('policies')` checks scoped to the relevant parent entity, consistent with the fix for Finding #1.

---

## Verified clean (checked, no issue found)

- **SQL injection:** Every dynamic `WHERE`-clause builder found via grep (`attendanceController.js`, `auditLogController.js`, `policyAdjustmentController.js`, `insurerPaymentController.js`, `customerPaymentController.js`, `employeeController.js`) uses parameterized `$n` placeholders pushed alongside the condition string — no raw user input is ever concatenated into SQL text.
- **Transactions:** Multi-statement writes that must be atomic (`policyController.create`/`update` — policy + premiums + commission rows; `commissionReconciliationController`, `policyAdjustmentController`, `insurerPaymentController`, `customerPaymentController`, `expenseController`, `rolePermissionController`) all correctly wrap in `BEGIN`/`COMMIT`/`ROLLBACK` with `client.release()` in a `finally` block, including on early-return validation failures.
- **XSS:** No `dangerouslySetInnerHTML` anywhere in `frontend/src`.
- **Commission self-approval / maker-checker:** `commissionController.decide()` correctly blocks `before.set_by === req.employee.id` and is route-gated to admin/manager only.
- **Alerts date logic:** `alertsController.js` uses SQL-side `CURRENT_DATE`/`INTERVAL` exclusively for its due/overdue comparisons — not vulnerable to the JS timezone bug class.
- **Timezone bug (the one already fixed this session) is not present in `commissionReconciliationController.js`'s CSV date-cell formatting** (`new Date(r.policy_start_date).toISOString().slice(0,10)`, lines 240/246): since the DATE type-parser fix (`db.js`) returns plain `'YYYY-MM-DD'` strings from Postgres, `new Date('YYYY-MM-DD')` parses as UTC midnight, and converting that straight back to `.toISOString()` is a lossless UTC round-trip with no local-timezone step in between — safe. (This is distinct from Finding #4, which uses `new Date()` with no argument — the *current instant*, not a stored date string — and that one **is** timezone-unsafe.)
- **Tests:** `npm test` in `backend/` — 4 suites, 34 tests, all passing.

---

## Note: one bug already found and fixed during this session (not re-reported above)

While verifying the newly-built employee tasks/files feature immediately before this audit, uploading a file to an employee's record failed with a 500 error: `new row for relation "documents" violates check constraint "documents_entity_type_check"`. Root cause: the `documents` table's `CHECK (entity_type IN ('customer', 'policy'))` constraint (from migration `021_documents.sql`) was never widened when `documentController.js` was later extended to support `entity_type = 'employee'` for the manager-to-report file-sharing feature. Fixed via `backend/src/migrations/024_documents_employee_type.sql`, which drops and recreates the constraint to allow `'employee'`, and verified live (upload now succeeds; test data cleaned up afterward). This is the same *class* of bug as Finding #1 and #5 above — a constraint or permission check written for an earlier, narrower version of a feature that wasn't updated when the feature was extended — so it's flagged here as a pattern to watch for, not as an outstanding item.
