# Insurance CRM — Implementation Documentation

*Last updated: 2026-09-19*

This document describes everything currently built in the app and how it works — for reference when planning new work or onboarding someone else to the system. It reflects the actual code as of today, not just what was originally planned.

**Stack:** Node/Express backend with raw SQL (`pg` library, no ORM), PostgreSQL database, React + Vite frontend, JWT cookie authentication.

## Table of contents

1. [Core CRM — customers, policies, risk details, premiums](#1-core-crm)
2. [Commission & money](#2-commission--money)
3. [Employees & organization](#3-employees--organization)
4. [Tasks & internal file sharing](#4-tasks--internal-file-sharing)
5. [Documents (file storage)](#5-documents-file-storage)
6. [Customer notes / follow-ups](#6-customer-notes--follow-ups)
7. [Alerts](#7-alerts)
8. [Audit log](#8-audit-log)
9. [Authentication & permissions model](#9-authentication--permissions-model)
10. [Database & migrations](#10-database--migrations)
11. [Automated tests](#11-automated-tests)
12. [Configuration gaps to address](#12-configuration-gaps-to-address)

---

## 1. Core CRM

### Customers
- Table `customers`. Basic contact/KYC fields (name, type, source, email — optional, phone, address).
- `name` is `VARCHAR(100)` (widened from 50 in migration 017 to fit longer names).
- Files: `backend/src/controllers/customerController.js`, `frontend/src/pages/Customers.jsx` / `CustomerForm.jsx`.

### Policies
- Table `policies`. Each policy links to a customer, insurer, insurer branch, vertical/sub-vertical, and the broker branch it was issued from.
- **`premium_amount` is never entered directly** — it's always derived from the policy's premium/coverage rows (see below) and recomputed whenever those rows change.
- Renewals: a policy can point at the policy it was `renewed_from`; `GET /api/policies/renewals-due?days=30` finds renewable policies (Active or Expired) due within a window that haven't already been renewed.
- `PUT /api/policies/:id` treats an included `premiums` array as "replace the whole coverage breakdown"; omitting it edits other fields without touching premiums.
- Files: `backend/src/controllers/policyController.js`, `backend/src/routes/policyRoutes.js`, `frontend/src/pages/PolicyForm.jsx` / `Policies.jsx` / `Renewals.jsx`.

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
- UI: approve/reject buttons appear on `PolicyForm.jsx` for admins/managers viewing a pending entry; pending items also surface as an alert (see §7).

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
- Files: `backend/src/controllers/employeeController.js`, `frontend/src/pages/EmployeeForm.jsx` / `Employees.jsx`.

### Roles & the page-permission system
- Three roles: `admin`, `manager`, `employee`. **Admin always has access to every page** — this is hardcoded in `requirePage()` (see §9), not stored data, so there's no way to misconfigure an admin out of a page.
- For `manager`/`employee`, access to each page (Customers, Policies, Commission Reconciliation, Audit Log, Attendance, etc.) is controlled by the `role_permissions` table (`role`, `page_key`) — configured on the Admin page (`frontend/src/pages/Admin.jsx` → `rolePermissionController.js`).
- Some newer features are **not** gated by a static page permission at all, because they need per-relationship access that a page toggle can't express — see Tasks and employee-scoped Documents below.

### Attendance
- Table `attendance` (migration 018): one row per employee per day, with `check_in_time`/`check_out_time` and a `status` (`present`/`absent`/`half_day`/`leave`).
- Employees check themselves in/out (`POST /api/attendance/check-in` / `check-out`); managers/admins can mark or edit any employee's day (`attendanceController.js`'s `isManager()` gate), including backdating via `AttendanceEditModal.jsx`.
- `GET /api/attendance/today` returns the logged-in employee's own record for today.
- Page: `frontend/src/pages/Attendance.jsx`.

---

## 4. Tasks & internal file sharing

Built most recently, to let a reporting manager assign work and send files to their direct reports, visible on the employee's own Dashboard.

### Task assignment rules
- Table `tasks` (migration 023): `title`, `description`, `assigned_to`, `assigned_by`, `due_date`, `priority` (`low`/`normal`/`high`), `status` (`pending`/`in_progress`/`done`), `completed_at`.
- **Who can assign to whom** (`taskController.js`'s `canAssign()`): an `admin` can assign a task to anyone. Anyone else can only assign to an employee whose `reporting_to` points back at them — i.e. only a direct reporting manager, checked freshly against the database on every request (not just trusted from the frontend).
- **Status updates**: only the assignee (or an admin) can move a task through `pending → in_progress → done` (`PATCH /api/tasks/:id/status`).
- **Deletion**: only whoever assigned the task (or an admin) can delete it (`DELETE /api/tasks/:id`).
- No page-level permission gate on `/api/tasks/*` — deliberate, since an employee must always be able to see their own tasks regardless of their role's page access.

### Where tasks show up
- **Dashboard** (`frontend/src/pages/Dashboard.jsx`): "My tasks" — `GET /api/tasks/mine`, with an editable status dropdown for the logged-in employee to move their own tasks forward.
- **Employee record** (`frontend/src/pages/EmployeeForm.jsx`, edit mode only): "Tasks" section — `GET /api/tasks?assigned_to=<id>`, with a "+ Assign task" button (only shown if the viewer is that employee's manager or an admin) and a Delete action per task.
- Component: `frontend/src/components/TaskList.jsx` (dumb display table — the caller decides which controls to offer), `frontend/src/components/AssignTaskModal.jsx` (the assignment form).

### Employee file sharing
Reuses the general-purpose Documents system (§5) with `entity_type = 'employee'` — see that section for the storage/access mechanics. Surfaces as "Files sent to this employee" on the employee's own record, and "Files for you" on the Dashboard.

---

## 5. Documents (file storage)

A single reusable system for attaching files to a customer, a policy, or (as of this session) an employee — rather than three separate upload mechanisms.

- Table `documents` (migration 021, widened by migration 024): `entity_type` (`customer`/`policy`/`employee`), `entity_id`, original `filename`, a random `stored_filename` on disk, `content_type`, `size_bytes`, `uploaded_by`.
- **Storage**: files live on local disk under `backend/uploads/`, saved under a `crypto.randomUUID()`-based name so the original filename is never exposed as a path. The folder is **not** served statically — the only way to get a file back is the authenticated `GET /api/documents/:id/download` endpoint, which streams it with the original filename in the `Content-Disposition` header.
- **Allowed types**: PDF, JPG/JPEG, PNG, DOC, DOCX — enforced both by the frontend's `accept` attribute and by a server-side MIME allowlist in `documentRoutes.js` (so a renamed file can't bypass the restriction).
- **Access control** (`documentController.js`'s `hasAccess()`), branches by entity type:
  - `customer` / `policy`: follows the same page permission a role has for the Customers / Policies pages.
  - `employee`: not page-gated. An employee always sees their own files; a manager can see/send/remove files for their direct reports (checked via `reporting_to`, same as task assignment); admin sees everything.
- Component: `frontend/src/components/DocumentsPanel.jsx` — embedded directly in `CustomerForm.jsx`, `PolicyForm.jsx`, `EmployeeForm.jsx`, and `Dashboard.jsx` (for the logged-in employee's own files), each with its own `title` prop.

---

## 6. Customer notes / follow-ups

A lightweight CRM layer on top of customers — call/email/meeting logs with optional follow-up dates.

- Table `customer_notes` (migration 020): `customer_id`, `employee_id` (who logged it), `note_type` (`call`/`email`/`meeting`/`note`/`other`), `content`, `follow_up_date`, `follow_up_done`.
- Page: `frontend/src/pages/CustomerNotes.jsx`, linked from `CustomerForm.jsx`.
- Overdue/due-today follow-ups feed directly into the Alerts system (§7).

---

## 7. Alerts

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

## 8. Audit log

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

## 9. Authentication & permissions model

- **Login**: `POST /api/auth/login` issues a JWT, set as an httpOnly cookie (`token`). `backend/src/middleware/authMiddleware.js`'s `requireAuth` verifies it on every request and attaches `{ id, email, role }` to `req.employee`.
- **Role-based page gating**: `requirePage(pageKey)` middleware checks the `role_permissions` table for non-admins; **admin always passes without a DB lookup** — hardcoded so an admin can never accidentally be locked out by a permissions misconfiguration.
- **Dynamic, relationship-based checks**: a few features can't be expressed as "does this role have this page" because the right answer depends on *which* record is being accessed — these skip `requirePage` entirely and check the relationship directly inside the controller instead:
  - Tasks: can only assign to / manage a task for someone who reports to you (or if you're admin).
  - Employee-scoped documents: same reporting-relationship check, plus "you can always see your own."
  - Alerts: each alert type still checks page permission, but per-alert, not at the route level.
- `role_permissions` itself is managed on the Admin page (`frontend/src/pages/Admin.jsx`), admin-only.

---

## 10. Database & migrations

There's no migration runner or ORM — migrations are plain numbered `.sql` files in `backend/src/migrations/`, applied by hand (one-off Node scripts that run the file's SQL against the database) as each one was written. In order:

| # | File | What it did |
|---|------|-------------|
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

---

## 11. Automated tests

- Jest (`npm test` from `backend/`), 34 tests across 4 files. These are **unit tests of pure functions**, not full API/integration tests — there's no test database set up.
- `backend/src/utils/__tests__/premiumCalc.test.js` — premium/coverage total computation.
- `backend/src/utils/__tests__/commissionCalc.test.js` — commission validation logic.
- `backend/src/utils/__tests__/auditLog.test.js` — `diffFields`/`normalize`, including the date-normalization edge case that caught a real timezone bug during development.
- `backend/src/controllers/__tests__/commissionReconciliationController.test.js` — `computeExpectedCommission`/`round2`.

---

## 12. Configuration gaps to address

**`employees.reporting_to` is currently `NULL` for every real employee.** This isn't a bug — it's existing schema that was already in place before this session's work — but it means the newly-built Tasks and employee-file-sharing features are effectively admin-only right now: a manager can't assign a task or send a file to an employee until that employee's "Reporting manager" field is set on their record (`EmployeeForm.jsx`). To make the feature usable for managers, go to each employee's edit page and set their reporting manager.
