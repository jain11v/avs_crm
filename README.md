# Insurance CRM

An internal CRM for an insurance brokerage: customers, policies, premiums
and commission, employee/HR (attendance, leave, payroll), the money
ledger (expenses, transactions, commission reconciliation), and admin
(roles, org structure, documents, tasks).

For what's actually built and how each part works, see
**[IMPLEMENTATION.md](./IMPLEMENTATION.md)** — this file only covers
getting it running.

## Stack

- **backend/** — Node.js + Express, PostgreSQL via raw SQL (`pg`, no
  ORM), JWT auth in an httpOnly cookie.
- **frontend/** — React + Vite, no state library, plain `axios`.

## 1. Set up the database(s)

This app runs against three separate local PostgreSQL databases — dev,
test, and prod — selected by an `APP_ENV` variable rather than a single
`.env`. See [Environments](#environments) below for why and how; the
short version:

```bash
cd backend
npm install

# create the databases (skip any that already exist)
psql -h <host> -p <port> -U <user> -c "CREATE DATABASE insurance_crm_dev;"
psql -h <host> -p <port> -U <user> -c "CREATE DATABASE insurance_crm_test;"
psql -h <host> -p <port> -U <user> -c "CREATE DATABASE insurance_crm_prod;"   # or point .env.production at an existing database

# copy and fill in real values for each
cp .env.example .env.development   # DB_NAME=insurance_crm_dev
cp .env.example .env.test          # DB_NAME=insurance_crm_test
cp .env.example .env.production    # DB_NAME=insurance_crm_prod (or your real database)

# apply every migration to each
npm run migrate         # dev
npm run migrate:test    # test
npm run migrate:prod    # prod
```

`npm run migrate*` is a small runner (`backend/src/scripts/migrate.js`)
that tracks what's already applied in a `schema_migrations` table and
only runs what's new — safe to re-run any time, including after adding a
new migration file. If you're pointing `.env.production` at a database
that already has the schema applied some other way, baseline it instead
of running it for real: `node src/scripts/migrate.js --baseline` (with
`APP_ENV=production` set) records every existing migration file as
applied without executing its SQL.

## 2. Run the backend

```bash
cd backend
npm run create-admin   # sets a password + admin role on an existing employee row
                        # (insert the employee row first if the database is empty —
                        # see IMPLEMENTATION.md §3)
npm run dev             # dev database, http://localhost:5000
npm run dev:test        # test database
npm run dev:prod        # prod database — your real data
```

Check `http://localhost:5000/api/health` — you should see `{"status":"ok"}`.

## 3. Run the frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173` and always talks to whichever backend is
currently running on port 5000 — the three environments aren't meant to
run concurrently on one machine, you pick one at a time via which
backend script you launched.

## 4. Run the tests

```bash
cd backend
npm test
```

Jest, unit tests only (pure functions — premium/commission math, audit-log
diffing) — no database involved yet, even though a `test` database now
exists for when that changes.

## Environments

Three real, separately-migrated databases instead of one shared `.env`:

| | Database | When to use |
|---|---|---|
| **dev** | `insurance_crm_dev` | Day-to-day local development. Starts empty. |
| **test** | `insurance_crm_test` | A disposable database to experiment or run integration tests against later, without touching dev or prod. Starts empty. |
| **prod** | your real database | The real business data. Treat it as non-disposable. |

Selection is via `APP_ENV` (`development` / `test` / `production`), read
by `backend/src/config/loadEnv.js`, which loads `.env.${APP_ENV}` (falling
back to a plain `.env` if that file doesn't exist — so a single-`.env`
setup still works if you don't need three). This is deliberately a
*different* variable from `NODE_ENV`, which keeps its own narrower job of
switching the auth cookie to HTTPS-only in a real deployment — selecting
"prod" locally shouldn't also demand HTTPS on `localhost`.

All `npm run <script>:test` / `:prod` variants (`dev`, `migrate`,
`create-admin`) exist for exactly this reason — see `backend/package.json`.

## How auth works

- Password checked with bcrypt against `employees.password_hash`.
- On success, the API signs a JWT and sets it as an **httpOnly cookie**
  (not readable by JavaScript).
- The React app calls `GET /api/auth/me` on load to restore an existing
  session, so a page refresh doesn't log you out.
- Sessions last 8 hours (`JWT_EXPIRES_IN`).

## Project structure

```
backend/
  src/
    config/         — db pool, env-file loading, page-permission list
    middleware/      — auth check, error handler, file uploads
    controllers/       — request handlers (business logic), one per resource
    routes/              — URL → controller mapping
    utils/                 — shared math/validation/audit-log helpers
    jobs/                    — background jobs (e.g. auto-marking absent)
    migrations/                — numbered .sql files, tracked in schema_migrations
    scripts/                     — migrate.js, createAdmin.js
    app.js / server.js             — Express app setup / entry point

frontend/
  src/
    api/axios.js            — configured HTTP client (sends cookies)
    context/AuthContext.jsx — global "who's logged in" state
    components/               — shared UI (modals, pickers, panels)
    pages/                       — one per screen
    App.jsx                        — routes
```

## Tooling

`tools/dependency-graph/` has a self-contained module-dependency viewer
(`module-map.html` — open directly in a browser). Regenerate it after
changing which files import which with:

```bash
node tools/dependency-graph/generate.js
```
