# Insurance CRM — Implementation Documentation

*Last updated: 2026-09-23*

This document describes everything currently built in the app and how it works — for reference when planning new work or onboarding someone else to the system. It reflects the actual code as of today, not just what was originally planned.

**Stack:** Node/Express backend with raw SQL (`pg` library, no ORM), PostgreSQL database (three environments — see §12), React + Vite frontend, JWT cookie authentication.

## Table of contents

1. [Core CRM — customers, policies, risk details, premiums](#1-core-crm)
2. [Commission & money](#2-commission--money)
3. [Employees & organization](#3-employees--organization)
4. [Attendance, leave, and payroll](#4-attendance-leave-and-payroll)
5. [Financial reports](#5-financial-reports)
6. [Tasks & internal file sharing](#6-tasks--internal-file-sharing)
7. [Documents (file storage)](#7-documents-file-storage)
8. [Customer notes / follow-ups](#8-customer-notes--follow-ups)
9. [Alerts](#9-alerts)
10. [Audit log](#10-audit-log)
11. [Authentication & permissions model](#11-authentication--permissions-model)
12. [Database, migrations & environments](#12-database-migrations--environments)
13. [Automated tests](#13-automated-tests)
14. [Configuration gaps to address](#14-configuration-gaps-to-address)

---

## 1. Core CRM

### Customers
- Table `customers`. Basic contact/KYC fields (name, type, source, email — optional, phone, address).
- `name` is `VARCHAR(100)` (widened from 50 in migration 017 to fit longer names).
- **`employee_id` ("Assigned employee") is not a field on the Add Customer form** — it's forced server-side to whoever creates the record (`customerController.create()`), same pattern as `policies.user_id`. Still editable afterward via the Edit form, for reassignment.
- **Gender, address, phone, state, city, customer type, priority level, branch, and source are required when adding a new customer** (`REQUIRED_ON_CREATE` in `customerController.js`) — not when editing one, since real customer rows predate this rule and the form resubmits the whole record on every save. Enforced in both the main Add Customer form and the quick-add flow inside the policy form's customer picker (`frontend/src/components/CustomerPicker.jsx`), which is a second, independent path that creates the same kind of record.
- Files: `backend/src/controllers/customerController.js`, `frontend/src/pages/Customers.jsx` / `CustomerForm.jsx`, `frontend/src/components/CustomerPicker.jsx`.

### Policies
- Table `policies`. Each policy links to a customer, insurer, insurer branch, vertical/sub-vertical, and the broker branch it was issued from.
- **`premium_amount` is never entered directly** — it's always derived from the policy's premium/coverage rows (see below) and recomputed whenever those rows change.
- **Status is exactly three values: `Active` / `Renewed` / `Not Renewed`**, never date-derived (simplified from an earlier 4-5 value design that included `Lapsed`/`Expired`/`Cancelled`). Only changes via `markLost()` → `Not Renewed`, or the renewed-source flip in `create()` → `Renewed` when a new policy names it as `renewed_from_policy_id`.
- Renewals: a policy can point at the policy it was `renewed_from` (unique — a policy can only be renewed once); `GET /api/policies/renewals-due?days=30` finds renewable policies (`Active` or `Not Renewed`) due within a window that don't already have a renewal.
- `PUT /api/policies/:id` treats an included `premiums` array as "replace the whole coverage breakdown"; omitting it edits other fields without touching premiums.
- **The Add Policy screen's inline payment section shows a live "Balance" field** next to "Amount received" — read-only, `net premium − amount received`, recalculating on every keystroke. Only there (not on Edit) — existing policies use the separate Finance page (`PolicyFinance.jsx`) for balance tracking, where `customer_balance = premium − paid_by_customer − discount − cashback` (all three deducted, cashback included since 2026-09-22 — it was previously omitted, overstating the balance).
- Files: `backend/src/controllers/policyController.js`, `backend/src/routes/policyRoutes.js`, `frontend/src/pages/PolicyForm.jsx` / `Policies.jsx` / `Renewals.jsx` / `PolicyFinance.jsx`.

### Risk details (per-sub-vertical structured fields)
- Each policy has a `risk_details` JSONB column (migration 014) capturing sub-vertical-specific facts — e.g. a Motor policy captures registration/engine/chassis numbers, a Fire policy captures building/stock details, a Health policy captures a member list.
- `frontend/src/riskSchemas.js` defines the field templates (`RISK_TEMPLATES`) and maps each real sub-vertical to the closest template (`SUB_VERTICAL_TEMPLATES`) — sub-verticals that don't have a bespoke template reuse the closest existing one rather than needing one each.
- Field types supported: text, number, date, select, checkbox, and `member_list` (repeatable name/relationship/age/gender rows, used for health/life family coverage).
- Captured through `frontend/src/components/RiskDetailsModal.jsx`, embedded in `PolicyForm.jsx`; saved as part of the normal policy update (`risk_details` is one of the policy's editable fields).

### Premiums / coverages
- Table `premiums` — one row per coverage line on a policy (e.g. Own Damage, Third Party, Add-ons), each with `sum_insured`, `prem_rate`, `prem`, `gst_percent`, `gst`, and `is_third_party`.
- `backend/src/utils/premiumCalc.js`'s `computePremiums()` validates and totals these rows; the policy's `premium_amount` = sum of (`prem` + `gst`) across all rows.
- The `is_third_party` flag on each row is what lets commission calculations (below) split "TP premium" from "non-TP premium".

---

## 2. Commission & money

### Commission percentage & maker-checker approval
- Table `commission` (one row per policy): `brok_percent`, optional `tp_brok_percent` (falls back to `brok_percent` if unset), `gst` (defaults 18%), `status` (`pending`/`approved`/`rejected`), `set_by`, `approved_by`.
- **Maker-checker rule** (`policyController.js`'s `commissionApprovalFor`): if an `admin` or `manager` sets the commission %, it auto-approves (they're the "checker" role). If an `employee` sets it, it starts `pending` and needs a manager/admin to approve it via `PATCH /api/commission/:policyId/decision` — and **the person who set it can never approve their own entry**, even if they're a manager (`commissionController.js`'s `decide()`).
- An unapproved commission % is excluded from expected-commission calculations everywhere (reconciliation list, statement matching) until approved.
- UI: approve/reject buttons appear on `PolicyForm.jsx` for admins/managers viewing a pending entry; pending items also surface as an alert (see §9).

### Commission calculation
Expected commission for a policy (`commissionReconciliationController.js`'s `computeExpectedCommission`):
```
pretax = (non-TP premium × brok_percent%) + (TP premium × tp_brok_percent%, or brok_percent% if tp_brok_percent unset)
gst_amount = pretax × gst% (default 18%)
expected_total = pretax + gst_amount
```
All rounded with `round2()` (`Math.round((n + Number.EPSILON) * 100) / 100`) to avoid floating-point drift. "TP premium" / "non-TP premium" come from summing `prem + gst` across a policy's premium rows, split by the `is_third_party` flag.

### Commission reconciliation
- Page: `frontend/src/pages/CommissionReconciliation.jsx`. Lists every policy with a commission %, its expected commission, what's actually been received, and the variance between them. Filterable by insurer, insurer branch, broker branch, date range, search, and received/pending status.
- `GET /api/commission-reconciliation/export.csv` exports the current filtered view as CSV.
- Recording a receipt (`POST /api/commission-reconciliation/:policyId/receipt`) replaces any prior receipt for that policy and posts a matching Credit transaction — mirrors how `insurer_payments` post a Debit, just in the opposite direction. Both the receipt and its transaction are deleted together if the receipt is removed.

### Commission statement matching
- Lets you upload an insurer's commission statement (CSV/XLSX) and auto-match its rows against the system's expected commissions by policy number, instead of entering receipts one by one.
- Three-step flow, each its own endpoint:
  1. `POST /statements/parse` — reads the file (via the SheetJS `xlsx` library — see note below), returns raw headers + rows so the user can map which column is the policy number, which is the amount, etc. No DB writes.
  2. `POST /statements/match` — given the row data and column mapping, looks up each policy number and computes the variance against expected commission. No DB writes; unmatched rows explain why (blank policy number, invalid amount, policy not found, commission % not yet approved, etc.).
  3. `POST /statements/import` — for the rows the user confirms, posts a receipt for each (reusing the same `upsertReceipt` logic as manual entry) and records the import as a `commission_statements` row (filename, matched count, total amount, who uploaded it).
- UI: `frontend/src/components/CommissionStatementModal.jsx`, launched from the Commission Reconciliation page.
- **Security note:** the `xlsx` npm package has known unpatched high-severity CVEs (prototype pollution, ReDoS). This project installs the patched distribution directly from SheetJS's own CDN (`cdn.sheetjs.com/xlsx-0.20.3/...`) instead of the npm registry version — `npm audit` shows 0 vulnerabilities as a result.

### Customer balances
- `frontend/src/pages/CustomerBalances.jsx` + `backend/src/controllers/customerBalanceController.js` — shows what each customer still owes (premium minus payments minus approved discounts/cashback), with CSV export.

---

## 3. Employees & organization

### Employee records
- Table `employees`. Fields include name, contact details, salary, department/designation, `role` (`admin`/`manager`/`employee`), and `reporting_to` (self-referencing FK to another employee — their manager).
- **`role` can only be changed via `PATCH /api/employees/:id/credentials`** (admin-only, also where a password is first set — an employee record has no login until then). It's excluded from the plain `PUT /api/employees/:id` path entirely (`EDITABLE_FIELDS` in `employeeController.js`) — that used to include `role`, gated only by page permission with no role check, which meant anyone with the "Employees" page could promote themselves to admin. Fixed 2026-09-22; the Role field on the edit form is now read-only, pointing people at the Admin-only flow.
- **Deactivating or deleting an employee whose own role is `admin` requires the requester to also be `admin`** — closes the escalate-then-lock-out path the bug above would otherwise have opened, and matches "admin can never be locked out" elsewhere in this app.
- **Gender, phone, date of birth, address, state, city, department, designation, reporting branch, date of joining, and salary are required when adding a new employee**, not when editing one (`REQUIRED_ON_CREATE`, separate from the smaller `REQUIRED_FIELDS` used to block *clearing* a field on update) — several real employees predate this rule and are missing one or more of these fields.
- **Documents can be attached while creating a new employee**, not only after saving — files are staged client-side and uploaded right after the new record's id comes back, same deferred-upload pattern `AssignTaskModal` already used for task attachments (see §6).
- Files: `backend/src/controllers/employeeController.js`, `frontend/src/pages/EmployeeForm.jsx` / `Employees.jsx`.

### Roles & the page-permission system
- Three roles: `admin`, `manager`, `employee`. **Admin always has access to every page** — this is hardcoded in `requirePage()` (see §11), not stored data, so there's no way to misconfigure an admin out of a page.
- For `manager`/`employee`, access to each page (Customers, Policies, Commission Reconciliation, Audit Log, Attendance, etc.) is controlled by the `role_permissions` table (`role`, `page_key`) — configured on the Admin page (`frontend/src/pages/Admin.jsx` → `rolePermissionController.js`).
- Some newer features are **not** gated by a static page permission at all, because they need per-relationship access that a page toggle can't express — see Tasks and employee-scoped Documents below.

### Organization admin screens (branches, insurer branches, verticals)
- **Broker branches** (`branchController.js` / `BrokerBranchForm.jsx`) and **insurer branches** (`insurerBranchController.js` / `InsurerBranchForm.jsx`) both require address, city, state, and GST (insurer branches also require PAN) — applied unconditionally on add **and** edit, unlike the customer/employee cases above, because no existing row in either table was missing any of these fields when the rule was added (checked with a NULL-count query first, the standard way to decide create-only vs. unconditional for this kind of change — see the equivalent customer/employee notes above).
- **"Vertical head" is not on the Add Vertical form** (`VerticalForm.jsx`) — no forced-value rule behind it, just not worth deciding at creation time. Still settable via Edit once the vertical exists.

---

## 4. Attendance, leave, and payroll

### Attendance
- Table `attendance` (migration 018): one row per employee per day, with `check_in_time`/`check_out_time` and a `status` (`present`/`absent`/`half_day`/`leave`).
- Employees check themselves in/out (`POST /api/attendance/check-in` / `check-out`); managers/admins can mark or edit any employee's day (`attendanceController.js`'s `isManager()` gate), including backdating via `AttendanceEditModal.jsx`.
- `GET /api/attendance/today` returns the logged-in employee's own record for today.
- **A background job (`backend/src/jobs/markAbsentees.js`, started from `server.js`) auto-marks absence.** A day with no attendance row used to just mean "nothing recorded" — the job now inserts an explicit `'absent'` row for any active employee with no record for a past Monday–Saturday day (Sunday excluded as a standing weekly off), bounded to a 30-day lookback so it only catches up on gaps rather than backfilling all history. Runs on server startup and every 6 hours; uses `ON CONFLICT DO NOTHING` so a same-day manual mark or leave approval racing it can't abort the batch, and computes "today" the same way the rest of the app does (Node local time, not Postgres `CURRENT_DATE`) to avoid a timezone-boundary mismatch.
- **A manager-facing roster** (`GET /api/attendance/roster?date=`) shows every active employee's check-in/check-out (or status) for one chosen day in a single table, instead of paging through the filtered daily-records list.
- Page: `frontend/src/pages/Attendance.jsx`.

### Leave
- Table `leave_requests` (migration 032): `employee_id`, `leave_type` (`paid`/`unpaid` only), `start_date`, `end_date`, `reason`, `status` (`pending`/`approved`/`rejected`), `approved_by`, `approver_remarks`.
- Approval is restricted to the employee's **direct** `reporting_to` manager, or admin — stricter than the generic "any manager in the chain" check used elsewhere, since blurring who's responsible for someone's leave felt wrong.
- Approving a request writes `attendance` rows for the covered dates (reuses the same upsert pattern `attendanceController.mark()` uses).
- Balance = `employees.annual_leave_entitlement` (default 12, editable per employee) minus live-computed approved-paid-days-this-year. **Not** a hard cap — informational only, a deliberate scope decision, not an oversight.
- Files: `backend/src/controllers/leaveController.js`, `frontend/src/pages/Leave.jsx`, `frontend/src/components/ApplyLeaveModal.jsx`.

### Payroll
- Table `payroll_payments` (migration 033): one row per employee per month, `base_salary`, `unpaid_leave_days`, `deduction`, `net_amount`, `status` (`draft`/`paid`).
- "Generate" (`POST /api/payroll/generate`, idempotent — never touches an existing row for that employee/month) pre-fills a draft per active salaried employee, with a pro-rated deduction for approved unpaid leave that month.
- **`net_amount` is always re-derived from `base_salary − deduction` server-side, never trusted from the client, and is no longer silently clamped to zero** — a deduction larger than the salary is now rejected by the `net_amount >= 0` check constraint instead of quietly floored (fixed 2026-09-22; the old code pre-clamped the value before the constraint could ever fire).
- "Mark paid" posts an **already-approved** `expense` + Debit transaction directly, bypassing the normal pending/second-approver flow — deliberate, same trust level as commission receipts/cashback posting — so payroll flows straight into Expenses, Transactions, and the Financial Reports P&L below with no extra wiring.
- Files: `backend/src/controllers/payrollController.js`, `frontend/src/pages/Payroll.jsx`.

---

## 5. Financial reports

- `GET /api/financial-reports/summary` (`financialReportsController.js`), gated by a `financial_reports` page key that — unlike every other page — isn't a standalone route; it's a section embedded directly in the Dashboard (`frontend/src/components/FinancialReports.jsx`), shown via `hasPermission('financial_reports')`.
- Everything is **cash-basis**, computed purely from the existing `transactions` ledger (every row is already tagged with exactly one of `expense_id` / `commission_receipt_id` / `customer_payment_id` / `insurer_payment_id` / `policy_adjustment_id`):
  - **Revenue = commission actually received from insurers only** (`commission_receipt_id IS NOT NULL`) — premium collected from customers / paid to insurers is pass-through, not brokerage revenue.
  - Cashback payouts count as a cost against revenue; discounts don't (they never post a transaction).
  - Expenses grouped by `heads` for the category chart.
- Charts are hand-rolled inline bar charts — no new charting dependency, matching how the rest of this app avoids frameworks.

---

## 6. Tasks & internal file sharing

Built most recently, to let a reporting manager assign work and send files to their direct reports, visible on the employee's own Dashboard.

### Task assignment rules
- Table `tasks` (migration 023, extended by 025 and 034 — see below): `title`, `description`, `assigned_to`, `assigned_by`, `due_date`, `priority` (`low`/`normal`/`high`), `status` (`pending`/`in_progress`/`done`), `completed_at`.
- **Who can assign to whom** (`taskController.js`'s `canAssign()`): an `admin` can assign a task to anyone. Anyone else can only assign to an employee whose `reporting_to` points back at them — i.e. only a direct reporting manager, checked freshly against the database on every request (not just trusted from the frontend).
- **Status updates**: only the assignee (or an admin) can move a task through `pending → in_progress → done` (`PATCH /api/tasks/:id/status`). **This was completely broken until 2026-09-22** — the UPDATE query reused the same bound parameter (`$1`) in two different type contexts (`status = $1` vs. `CASE WHEN $1 = 'done'`), which Postgres rejects as "inconsistent types deduced for parameter." No task, recurring or not, could ever actually be marked done. Only caught by live API testing after a full code review had already passed; fixed with an explicit `$1::varchar` cast.
- **Deletion**: only whoever assigned the task (or an admin) can delete it (`DELETE /api/tasks/:id`).
- No page-level permission gate on `/api/tasks/*` — deliberate, since an employee must always be able to see their own tasks regardless of their role's page access.

### Recurrence and escalation (migration 034)
- `tasks.recurrence` (`none`/`daily`/`weekly`/`monthly`) + `recurrence_parent_id` (self-referencing, same chain idea as `policies.renewed_from_policy_id`): completing a repeating task auto-creates the next occurrence, due date advanced by the interval. Deliberately **not** wired into `markLost()` — that path also sets `status='done'`, but a lost lead shouldn't spawn a fresh recurring task.
- **Known gap, not yet fixed:** nothing stops the next-occurrence insert from firing more than once for the same completion (no re-fire guard, and `recurrence_parent_id` has no unique constraint) — a reopen-then-recomplete, or a fast double-submit, can create duplicate phantom occurrences.
- Overdue-task escalation (`alertsController.js`) is hierarchy-scoped via the same `selfAndDescendantIds()` helper already used for renewals-due and Performance — a manager now sees when a report's task goes overdue.
- **"Tasks you've assigned"** (`GET /api/tasks/assigned`, `assigned_by = me AND assigned_to != me`) plus a Dashboard card — direct fix for a real reported gap where a manager had no way to see a task assigned to someone else short of opening that report's own Employees page.

### Where tasks show up
- **Dashboard** (`frontend/src/pages/Dashboard.jsx`): "My tasks" (`GET /api/tasks/mine`) with an editable status dropdown, and "Tasks you've assigned" (see above).
- **Employee record** (`frontend/src/pages/EmployeeForm.jsx`, edit mode only): "Tasks" section — `GET /api/tasks?assigned_to=<id>`, with a "+ Assign task" button (only shown if the viewer is that employee's manager or an admin) and a Delete action per task.
- Component: `frontend/src/components/TaskList.jsx` (dumb display table — the caller decides which controls to offer), `frontend/src/components/AssignTaskModal.jsx` (the assignment form, also where recurrence is set and supporting documents are attached).

### Employee file sharing
Reuses the general-purpose Documents system (§7) with `entity_type = 'employee'` — see that section for the storage/access mechanics. Surfaces as "Documents" on the employee's own record (renamed 2026-09-22 from "Files sent to this employee," which undersold what's actually a general-purpose attachment panel), and "Files for you" on the Dashboard.

---

## 7. Documents (file storage)

A single reusable system for attaching files to a customer, a policy, or (as of this session) an employee — rather than three separate upload mechanisms.

- Table `documents` (migration 021, widened by migration 024): `entity_type` (`customer`/`policy`/`employee`), `entity_id`, original `filename`, a random `stored_filename` on disk, `content_type`, `size_bytes`, `uploaded_by`.
- **Storage**: files live on local disk under `backend/uploads/`, saved under a `crypto.randomUUID()`-based name so the original filename is never exposed as a path. The folder is **not** served statically — the only way to get a file back is the authenticated `GET /api/documents/:id/download` endpoint, which streams it with the original filename in the `Content-Disposition` header.
- **Allowed types**: PDF, JPG/JPEG, PNG, DOC, DOCX — enforced both by the frontend's `accept` attribute and by a server-side MIME allowlist in `documentRoutes.js` (so a renamed file can't bypass the restriction).
- **Access control** (`documentController.js`'s `hasAccess()`), branches by entity type:
  - `customer` / `policy`: follows the same page permission a role has for the Customers / Policies pages.
  - `employee`: not page-gated. An employee always sees their own files; a manager can see/send/remove files for their direct reports (checked via `reporting_to`, same as task assignment); admin sees everything.
- Component: `frontend/src/components/DocumentsPanel.jsx` — embedded directly in `CustomerForm.jsx`, `PolicyForm.jsx`, `EmployeeForm.jsx`, and `Dashboard.jsx` (for the logged-in employee's own files), each with its own `title` prop.

---

## 8. Customer notes / follow-ups

A lightweight CRM layer on top of customers — call/email/meeting logs with optional follow-up dates.

- Table `customer_notes` (migration 020): `customer_id`, `employee_id` (who logged it), `note_type` (`call`/`email`/`meeting`/`note`/`other`), `content`, `follow_up_date`, `follow_up_done`.
- Page: `frontend/src/pages/CustomerNotes.jsx`, linked from `CustomerForm.jsx`.
- Overdue/due-today follow-ups feed directly into the Alerts system (§9).

---

## 9. Alerts

A live "what needs attention" feed — deliberately **not** a stored notification system (no email/SMS credentials configured, no cron in this app), so nothing needs to be marked read: an alert simply stops appearing the moment its underlying condition is resolved.

- `GET /api/alerts` (`backend/src/controllers/alertsController.js`) computes, on every call:
  - **Renewals due** — renewable policies due within 30 days that haven't been renewed yet (gated by the `renewals` page permission).
  - **Commission overdue** — policies with a commission % set but no receipt recorded, more than 45 days after the policy started (gated by the `commission_reconciliation` page permission).
  - **Follow-ups due** — customer notes with an unfinished follow-up date on or before today (gated by the `customers` page permission).
  - **Commission pending approval** — commission entries awaiting the viewer's sign-off (admin/manager only, excludes entries they set themselves).
  - **Pending discount/cashback adjustments** — awaiting the viewer's approval (admin/manager only, same self-exclusion rule).
- Each alert type is only computed/shown if the viewer's role actually has access to the underlying page — an alert never leaks the existence of data a role can't otherwise see.
- UI: `frontend/src/components/AlertsBell.jsx` in the top nav (`Layout.jsx`), polling every 5 minutes.

---

## 10. Audit log

Tracks who changed what, and when, on the money-moving and policy-related tables.

- Table `audit_log` (migration 016): `entity_type`, `entity_id`, `policy_id` (for grouping everything tied to one policy), `action` (`create`/`update`/`delete`/`approved`/`rejected`), `changes` (JSONB), `employee_id`, timestamp.
- `backend/src/utils/auditLog.js`:
  - `diffFields(before, after, fields)` builds a `{field: {from, to}}` object for just the fields that actually changed. `before: null` means every field shows as newly created; `after: null` means every field shows as removed — one shape covers create/update/delete/approve/reject without the frontend needing to branch on action type.
  - Values are normalized before comparing (dates to `YYYY-MM-DD` using **local** calendar fields, numbers to 2 decimal places) so that, e.g., a `NUMERIC` column coming back from Postgres as the string `"5000.00"` isn't reported as a spurious change against the number `5000`.
  - `logChange()` writes nothing if the diff is empty (nothing tracked actually changed) — no audit-log noise from a save that didn't change anything.
  - Every call passes the *same* database client the surrounding operation is using, inside the same transaction — a logged change and the change it describes always commit or roll back together.
- Instrumented into: policy create/update, commission set/approve/reject, commission receipts, customer payments, insurer payments, policy adjustments (discount/cashback).
- Page: `frontend/src/pages/AuditLog.jsx`, gated by the `audit_log` page permission.

---

## 11. Authentication & permissions model

- **Login**: `POST /api/auth/login` issues a JWT, set as an httpOnly cookie (`token`). `backend/src/middleware/authMiddleware.js`'s `requireAuth` verifies it on every request and attaches `{ id, email, role }` to `req.employee`.
- **Role-based page gating**: `requirePage(pageKey)` middleware checks the `role_permissions` table for non-admins; **admin always passes without a DB lookup** — hardcoded so an admin can never accidentally be locked out by a permissions misconfiguration.
- **Dynamic, relationship-based checks**: a few features can't be expressed as "does this role have this page" because the right answer depends on *which* record is being accessed — these skip `requirePage` entirely and check the relationship directly inside the controller instead:
  - Tasks: can only assign to / manage a task for someone who reports to you (or if you're admin).
  - Employee-scoped documents: same reporting-relationship check, plus "you can always see your own."
  - Alerts: each alert type still checks page permission, but per-alert, not at the route level.
- `role_permissions` itself is managed on the Admin page (`frontend/src/pages/Admin.jsx`), admin-only.
- **CORS** (`backend/src/app.js`) allows `FRONTEND_URL` plus any origin on the Vite dev port (5173) whose *hostname* is `localhost`/`127.0.0.1`/a private-LAN address — covers every device this frontend could realistically be served from on this network. Until 2026-09-22 it checked the port alone, which combined with `credentials: true` (cookie-based auth) meant any public site running on port 5173 could ride a logged-in employee's session — a CSRF hole, now closed.
- **Known gap, not yet fixed:** deactivating an employee (`PATCH /employees/:id/status`) doesn't invalidate their existing session — `requireAuth` only checks the JWT's signature/expiry, never `employees.is_active`, so a just-deactivated employee keeps full access for up to the remaining `JWT_EXPIRES_IN` (8h).

---

## 12. Database, migrations & environments

### Three environments
The app runs against three separate local PostgreSQL databases — **dev** (`insurance_crm_dev`), **test** (`insurance_crm_test`), and **prod** (the real business database) — selected by an `APP_ENV` variable (`development`/`test`/`production`), read by `backend/src/config/loadEnv.js`, which loads `.env.${APP_ENV}`. This is a *different* variable from `NODE_ENV`, kept separate on purpose: `NODE_ENV` already had a narrower, pre-existing job (switching the auth cookie to HTTPS-only for a real deployment — see `authController.js`), and all three environments currently still run locally over plain `http://localhost`, so picking "prod" shouldn't also start demanding HTTPS. See the README's [Environments](./README.md#environments) section for the npm scripts (`dev`/`dev:test`/`dev:prod`, `migrate`/`migrate:test`/`migrate:prod`, etc.).

### Migration runner
`backend/src/scripts/migrate.js` — tracks what's applied in a `schema_migrations` table (`filename`, `applied_at`) and only runs what's new, in filename order, each wrapped in its own transaction. Closes a gap that existed until 2026-09-22: migrations used to be applied by hand via one-off Node scripts with nothing recording what had already run, which only worked because there was a single database to keep mentally in sync — juggling three without a tracking table would have been the same error-prone process, times three.

For a database that already has the schema from being built up by hand before this runner existed (this app's real prod database), `node src/scripts/migrate.js --baseline` records every migration file as applied **without executing its SQL** — used once, to backfill prod's tracking table to match its actual (already-correct) schema, verified afterward with a `pg_dump --schema-only` diff against a freshly-migrated database (below).

### Migrations
Plain numbered `.sql` files in `backend/src/migrations/`, 000 through 034. `000_initial_schema.sql` is a reconstruction of everything that predated file-based migrations (it only ever existed as already-applied structure in the live database) — verified byte-for-byte against the real schema by replaying every migration from empty and diffing a schema-only `pg_dump`. The same verification method confirmed the fresh `insurance_crm_dev` and `insurance_crm_test` databases are schema-identical to prod after migration 034.

| # | File | What it did |
|---|------|-------------|
| 000 | `initial_schema.sql` | Reconstructed baseline (predates file-based migrations) |
| 001 | `add_auth_to_employees.sql` | Added login fields (password hash, role) to employees |
| 002 | `add_format_checks.sql` | Added format-validation CHECK constraints |
| 003 | `add_customer_type_source_tables.sql` | Customer type/source lookup tables |
| 004 | `add_expense_approval_workflow.sql` | Expense approval workflow |
| 005 | `add_expense_ledger_link.sql` | Linked expenses to the ledger |
| 006 | `transactions_mirror_expense_status.sql` | Kept transaction status in sync with expense status |
| 007 | `premiums_required_fields.sql` | Required fields on premium rows |
| 008 | `commission_constraints.sql` | Constraints on the commission table |
| 009 | `customer_insurer_payments_and_adjustments.sql` | Customer/insurer payments + discount/cashback adjustments |
| 010 | `remove_payment_modes.sql` | Removed the payment-modes table |
| 011 | `customer_email_optional.sql` | Made customer email optional |
| 012 | `policy_renewals.sql` | Added policy renewal linkage |
| 013 | `role_permissions.sql` | Added the role/page permission table |
| 014 | `policy_risk_details.sql` | Added `risk_details` JSONB to policies |
| 015 | `commission_reconciliation.sql` | Added `commission_receipts` |
| 016 | `audit_log.sql` | Added the audit log table |
| 017 | `customer_name_length.sql` | Widened `customers.name` to VARCHAR(100) |
| 018 | `attendance.sql` | Added the attendance table |
| 019 | `commission_statements.sql` | Added `commission_statements` (statement import tracking) |
| 020 | `customer_notes.sql` | Added customer notes / follow-ups |
| 021 | `documents.sql` | Added the documents table (customer/policy only) |
| 022 | `commission_approval.sql` | Added maker-checker status fields to commission |
| 023 | `tasks.sql` | Added the tasks table |
| 024 | `documents_employee_type.sql` | Widened `documents.entity_type` to also allow `'employee'` |
| 025 | `task_lead_outcome.sql` | Added `outcome`/`policy_id`/`lost_reason` to tasks (lead tracking) |
| 026 | `chat_messages.sql` | Added company-wide chat |
| 027 | `commission_reward_percent.sql` | Added `commission.reward_percent` (extra % on top of brokerage) |
| 028 | `policy_lost_tracking.sql` | Added `lost_by`/`lost_at` to policies |
| 029 | `policy_not_renewed_status.sql` | Added the `Not Renewed` policy status |
| 030 | `policy_renewed_status.sql` | Added the `Renewed` policy status (auto-set on the source when it's renewed) |
| 031 | `simplify_policy_status.sql` | Collapsed policy status to exactly `Active`/`Renewed`/`Not Renewed` |
| 032 | `leave_requests.sql` | Added leave (§4) |
| 033 | `payroll.sql` | Added payroll (§4) |
| 034 | `task_recurrence.sql` | Added task recurrence + `recurrence_parent_id` (§6) |

---

## 13. Automated tests

- Jest (`npm test` from `backend/`, runs with `APP_ENV=test`), 36 tests across 4 files. These are **unit tests of pure functions**, not full API/integration tests — nothing here touches a database yet, even though a real `test` database (`insurance_crm_test`) now exists for when that changes (see §12).
- `backend/src/utils/__tests__/premiumCalc.test.js` — premium/coverage total computation.
- `backend/src/utils/__tests__/commissionCalc.test.js` — commission validation logic.
- `backend/src/utils/__tests__/auditLog.test.js` — `diffFields`/`normalize`, including the date-normalization edge case that caught a real timezone bug during development.
- `backend/src/controllers/__tests__/commissionReconciliationController.test.js` — `computeExpectedCommission`/`round2`.

---

## 14. Configuration gaps to address

- **`employees.reporting_to` is currently `NULL` for every real employee.** This isn't a bug — it's existing schema that was already in place before Tasks/Documents were built — but it means Tasks and employee-file-sharing are effectively admin-only right now: a manager can't assign a task or send a file to an employee until that employee's "Reporting manager" field is set on their record (`EmployeeForm.jsx`). To make the feature usable for managers, go to each employee's edit page and set their reporting manager.
- **No row-level ownership scoping on policies** (`list`/`getById`/`getFinance`) — any authenticated employee can view any policy's full financial detail by id, unlike renewals-due/performance/leave, which are hierarchy-scoped. Flagged during the 2026-09-22 audit given this app's stated concern about renewal-data leaking between employees; not yet acted on, needs a deliberate yes/no rather than a default.
- **Customer/insurer payment amounts aren't checked against the policy premium** — no overpayment guard. Deliberately left this way: round-off overages on customer payments are expected in practice, so a hard cap would reject legitimate payments.
- **Customer and insurer payments post straight to `approved` on creation**, unlike expenses and policy adjustments, which require a second person's sign-off. Scoped as a future feature, not yet built.
- Smaller, lower-priority items from the same audit, still open: documents have no real FK to their entity (deleting a customer/policy/employee can orphan document rows + files on disk); upload type-checking trusts only the client-supplied MIME type; IFSC codes have no format validation anywhere; Financial Reports' cashflow/revenue-trend charts don't apply the same date-range bound as P&L/expense-by-category; chat file downloads serve `inline` with unverified content-type; the DB connection pool has no configured limits/SSL; no boot-time check that `JWT_SECRET` is set.
