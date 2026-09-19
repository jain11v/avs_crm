# Insurance CRM — Phases 1–3: Auth, Customers, Policies

This covers the project skeleton, database migrations, employee login,
full customer management, and full policy management. Transactions/balances
and employee/department admin screens are next.

## What's included

- **backend/** — Node.js + Express API, connects to your existing PostgreSQL
  database, handles login/logout via JWT stored in an httpOnly cookie.
- **frontend/** — React (Vite) app with a login page and a protected
  dashboard shell.

## 1. Run the database migrations

Run all three, in order:

```bash
psql -h <host> -U <user> -d <database> -f backend/src/migrations/001_add_auth_to_employees.sql
psql -h <host> -U <user> -d <database> -f backend/src/migrations/002_add_format_checks.sql
psql -h <host> -U <user> -d <database> -f backend/src/migrations/003_add_customer_type_source_tables.sql
```

1. Adds `password_hash`, `last_login`, and `role` columns to `employees`.
2. Adds CHECK constraints so phone/Aadhar/PAN/GST can never be saved in the
   wrong format — enforced at the database level, not just in the form.
   **If you already have rows with values that don't match these formats,
   this migration will fail** — it has commented-out `SELECT` queries near
   the bottom to help you find and fix those rows first.
3. Creates `customer_types` and `customer_sources` reference tables (seeded
   with sensible defaults), adds `customer_type_id`/`source_id` to
   `customers`, and best-effort migrates any existing free-text values into
   them by matching names. The old `type_of_customer`/`source` text columns
   are left in place (not dropped) so you can verify the migration before
   removing them — see the commented-out queries at the bottom of the file.

## 2. Set up the backend

```bash
cd backend
cp .env.example .env
# edit .env with your real DB credentials and a random JWT_SECRET
npm install
```

Create your first login (the employee row must already exist in the
`employees` table — this just sets their password and makes them an admin):

```bash
npm run create-admin your.email@example.com "YourPassword123"
```

Start the API:

```bash
npm run dev
```

It runs on `http://localhost:5000` by default. Check `http://localhost:5000/api/health`
in your browser — you should see `{"status":"ok"}`.

## 3. Set up the frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

It runs on `http://localhost:5173`. Open that in your browser — you should
land on the login page. Log in with the email/password you set in step 2.

## How auth works

- Password is checked with bcrypt against `employees.password_hash`.
- On success, the API signs a JWT and sets it as an **httpOnly cookie** (not
  readable by JavaScript — protects against XSS token theft).
- The React app calls `GET /api/auth/me` on load to check if there's already
  a valid session, so refreshing the page keeps you logged in.
- Sessions last 8 hours (`JWT_EXPIRES_IN` in `.env`), then you'll need to log
  in again.

## Project structure

```
backend/
  src/
    config/db.js          — PostgreSQL connection pool
    middleware/            — auth check, error handler
    controllers/            — request handlers (business logic)
    routes/                 — URL → controller mapping
    migrations/              — SQL files to run against the DB
    scripts/createAdmin.js    — CLI to set a password on an employee
    app.js / server.js         — Express app setup / entry point

frontend/
  src/
    api/axios.js           — configured HTTP client (sends cookies)
    context/AuthContext.jsx — global "who's logged in" state
    components/ProtectedRoute.jsx — redirects to /login if not authed
    pages/Login.jsx / Dashboard.jsx
    App.jsx                — routes
```

## What's next

Customers and Policies are both fully wired up now (list, search, create,
edit, cascading dropdowns, validation). Next modules, in suggested order:

1. **Transactions & balances** — payments against policies, outstanding
   balance view, multiple partial payments per policy
2. **Insurers, branches, verticals admin** — screens to manage the
   reference data itself (right now it's SQL-only)
3. **Employees/departments/designations** — admin-only management screens

Each will add a `routes/*Routes.js` + `controllers/*Controller.js` on the
backend, and a page + API calls on the frontend, following the same pattern
as customers and policies.

## Project structure — what's implemented so far

- **Customers** (`/customers`): search, paginate, create, edit, deactivate.
  Cascading state → city dropdown. Customer type and source are dropdowns
  backed by their own reference tables (`customer_types`,
  `customer_sources`), editable later without touching code.
- **Policies** (`/policies`): search by policy number or customer name,
  filter by status, create, edit. Customer is picked via type-to-search
  autocomplete (not a giant dropdown). Insurer → insurer branch and
  Vertical → sub-vertical are cascading dropdowns. Server-side validation
  covers required fields, date ordering (end after start), and every
  foreign key — invalid selections return a specific, human-readable error
  rather than a generic failure.
