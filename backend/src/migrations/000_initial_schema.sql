-- The base schema this app was already running on before migration
-- tracking (001 onward) began — customers, policies, premiums, commission,
-- employees, insurers/branches, bank accounts, transactions, expenses, and
-- the lookup tables (departments, designations, branches, verticals,
-- sub-verticals, cities, states, heads, bank names). None of this was ever
-- captured as SQL before now; it only existed as already-applied structure
-- in the live database. Reconstructed by diffing the live schema against
-- every ALTER in migrations 001-034 (subtracting what they added, adding
-- back what they dropped), so replaying 000 -> 034 in order against an
-- empty database reproduces today's actual schema exactly.
--
-- A few pieces were dropped or reworked early (before any of it was
-- version-controlled) and are reconstructed best-effort from context in
-- later migrations' own comments, since their exact original DDL is lost:
--   - payment_modes table + transactions.payment_mode_id (dropped by 010,
--     shaped the same as customer_payments/insurer_payments' identical
--     column from migration 009).
--   - expense.made_by / expense.approved (dropped by 004; that migration's
--     own comment says made_by duplicated user_id and approved was "a bare
--     boolean").
--   - customers.name's original length before 017 widened it to
--     VARCHAR(100) (guessed VARCHAR(50), matching similar name columns
--     elsewhere in this schema).
--   - policies.status's original allowed values before 029/030/031
--     evolved them (guessed ('Active', 'Expired', 'Cancelled'), matching
--     what alertsController.js's pre-029 filter implied).
-- None of these affect the final schema after 001-034 replay — they only
-- need to exist long enough for the later migrations' ALTERs to apply.

-- ============================================================
-- Tables (columns, primary keys, checks, uniques only — no FKs yet,
-- added as a separate block below so table-creation order never has to
-- match the dependency graph).
-- ============================================================

CREATE TABLE states (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(10) NOT NULL UNIQUE,
    country_code VARCHAR(5) DEFAULT 'IN'
);

CREATE TABLE cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    state_id INTEGER NOT NULL,
    pincode VARCHAR(10),
    CONSTRAINT uniq_city_per_state UNIQUE (name, state_id)
);

CREATE TABLE bank_names (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    short_name VARCHAR(20),
    ifsc_prefix VARCHAR(10),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bank_accounts (
    id SERIAL PRIMARY KEY,
    bank_name_id INTEGER,
    name VARCHAR(40),
    ac_no VARCHAR(30),
    type VARCHAR(10) DEFAULT 'Saving' CHECK (type IN ('Saving', 'Current', 'Loan', 'Credit card', 'Debit card')),
    ifsc VARCHAR(15)
);

CREATE TABLE payment_modes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL
);

-- Same "predates its rename" naming note as broker_branches above.
CREATE TABLE broker_departments (
    id INTEGER CONSTRAINT departments_id_not_null NOT NULL,
    name VARCHAR(100) CONSTRAINT departments_name_not_null NOT NULL,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT departments_pkey PRIMARY KEY (id),
    CONSTRAINT departments_name_key UNIQUE (name)
);
CREATE SEQUENCE departments_id_seq AS integer OWNED BY broker_departments.id;
ALTER TABLE broker_departments ALTER COLUMN id SET DEFAULT nextval('departments_id_seq');

CREATE TABLE designations (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL UNIQUE,
    department_id INTEGER,
    level INTEGER,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Named constraints below match the live database exactly (this table
-- predates its rename from "branches" to "broker_branches", and kept the
-- original constraint names) — not cosmetic, matters for pg's err.constraint
-- values that friendlyForeignKeyError()-style helpers pattern-match on.
CREATE TABLE broker_branches (
    id INTEGER CONSTRAINT branches_id_not_null NOT NULL,
    name VARCHAR(30) CONSTRAINT branches_name_not_null NOT NULL,
    address VARCHAR(200),
    city_id INTEGER,
    state_id INTEGER,
    branch_code VARCHAR(10),
    email VARCHAR(50) CONSTRAINT branches_email_not_null NOT NULL,
    phone VARCHAR(10),
    gst VARCHAR(15),
    CONSTRAINT branches_pkey PRIMARY KEY (id),
    CONSTRAINT branches_email_key UNIQUE (email)
);
CREATE SEQUENCE branches_id_seq AS integer OWNED BY broker_branches.id;
ALTER TABLE broker_branches ALTER COLUMN id SET DEFAULT nextval('branches_id_seq');

CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(20) NOT NULL,
    last_name VARCHAR(20) NOT NULL,
    gender VARCHAR(10) CHECK (gender IN ('Male', 'Female')),
    email VARCHAR(50) NOT NULL UNIQUE,
    phone VARCHAR(12),
    address VARCHAR(200),
    city_id INTEGER,
    state_id INTEGER,
    salary NUMERIC(10,2),
    date_of_birth DATE,
    date_of_joining DATE DEFAULT CURRENT_DATE,
    date_of_resign DATE,
    aadhar VARCHAR(12),
    pan VARCHAR(10),
    business_expected NUMERIC(12,2) DEFAULT 0,
    reporting_to INTEGER,
    reporting_branch INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    department_id INTEGER,
    designation_id INTEGER
);

CREATE TABLE verticals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    vertical_head INTEGER,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sub_verticals (
    id SERIAL PRIMARY KEY,
    vertical_id INTEGER NOT NULL,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (vertical_id, name)
);

CREATE TABLE insurers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    registration_number VARCHAR(50) UNIQUE,
    website VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE insurer_branches (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    insurer_id INTEGER,
    broker_code VARCHAR(20),
    branch_code VARCHAR(30),
    contact_person VARCHAR(150),
    email VARCHAR(40),
    phone VARCHAR(12),
    address VARCHAR(200),
    city_id INTEGER,
    state_id INTEGER,
    pan VARCHAR(10),
    gst VARCHAR(15),
    bank_name_id INTEGER,
    account_no VARCHAR(20),
    ifsc VARCHAR(12),
    remarks VARCHAR(200),
    website VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    title VARCHAR(5),
    name VARCHAR(50) NOT NULL,
    gender VARCHAR(10) CONSTRAINT customers_gender_check1 CHECK (gender IN ('Male', 'Female', 'Company')),
    email VARCHAR(50) NOT NULL UNIQUE,
    phone VARCHAR(12),
    address VARCHAR(200),
    city_id INTEGER,
    state_id INTEGER,
    aadhar VARCHAR(12),
    pan VARCHAR(10),
    gst VARCHAR(15),
    dob DATE,
    type_of_customer VARCHAR(30),
    priority_level INTEGER CHECK (priority_level IN (1, 2, 3, 4, 5)),
    employee_id INTEGER,
    branch_id INTEGER,
    source VARCHAR(30),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE policies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    type_of_business VARCHAR(10) DEFAULT 'new' CHECK (type_of_business IN ('new', 'old', 'renewal')),
    policy_number VARCHAR(30) NOT NULL UNIQUE,
    vertical_id INTEGER,
    sub_vertical_id INTEGER,
    customer_id INTEGER CONSTRAINT policies_policy_holder_name_not_null NOT NULL,
    renewable BOOLEAN DEFAULT TRUE,
    insurer_id INTEGER NOT NULL,
    insurer_branch_id INTEGER NOT NULL,
    sum_insured NUMERIC(12,2),
    premium_amount NUMERIC(10,2) NOT NULL,
    issued_from_branch_id INTEGER,
    policy_start_date DATE NOT NULL,
    policy_end_date DATE NOT NULL,
    source VARCHAR(20),
    telecaller INTEGER,
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Expired', 'Cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    remarks VARCHAR(150),
    CHECK (policy_end_date > policy_start_date)
);

CREATE TABLE premiums (
    id SERIAL PRIMARY KEY,
    coverage VARCHAR(40),
    sum_insured NUMERIC(12,2),
    prem_rate VARCHAR(10),
    prem NUMERIC(12,2),
    gst_percent NUMERIC(5,2),
    gst NUMERIC(10,2),
    policy_id INTEGER
);

CREATE TABLE commission (
    id SERIAL PRIMARY KEY,
    brok_percent NUMERIC(5,2),
    tp_brok_percent NUMERIC(5,2),
    gst NUMERIC(5,2),
    remarks VARCHAR(100),
    policy_id INTEGER
);

CREATE TABLE heads (
    id SERIAL PRIMARY KEY,
    name VARCHAR(40),
    description VARCHAR(100)
);

CREATE TABLE expense (
    id SERIAL PRIMARY KEY,
    amount NUMERIC(12,2),
    user_id INTEGER,
    made_by INTEGER,
    approved BOOLEAN DEFAULT FALSE
);

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER,
    date_of_transaction TIMESTAMP,
    bank_id INTEGER,
    reference_id VARCHAR(30),
    type_of_transaction VARCHAR(10) CHECK (type_of_transaction IN ('Debit', 'Credit')),
    amount NUMERIC(12,2),
    head INTEGER,
    remarks VARCHAR(100),
    policy_id INTEGER,
    payment_mode_id INTEGER
);

-- ============================================================
-- Foreign keys (added after every table exists, so creation order above
-- never has to match the dependency graph).
-- ============================================================

ALTER TABLE cities ADD CONSTRAINT cities_state_id_fkey FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE CASCADE;

ALTER TABLE bank_accounts ADD CONSTRAINT bank_accounts_bank_name_id_fkey FOREIGN KEY (bank_name_id) REFERENCES bank_names(id);

ALTER TABLE designations ADD CONSTRAINT designations_department_id_fkey FOREIGN KEY (department_id) REFERENCES broker_departments(id);

ALTER TABLE broker_branches ADD CONSTRAINT branches_city_id_fkey FOREIGN KEY (city_id) REFERENCES cities(id);
ALTER TABLE broker_branches ADD CONSTRAINT branches_state_id_fkey FOREIGN KEY (state_id) REFERENCES states(id);

ALTER TABLE employees ADD CONSTRAINT employees_city_id_fkey FOREIGN KEY (city_id) REFERENCES cities(id);
ALTER TABLE employees ADD CONSTRAINT employees_state_id_fkey FOREIGN KEY (state_id) REFERENCES states(id);
ALTER TABLE employees ADD CONSTRAINT employees_reporting_to_fkey FOREIGN KEY (reporting_to) REFERENCES employees(id);
ALTER TABLE employees ADD CONSTRAINT employees_reporting_branch_fkey FOREIGN KEY (reporting_branch) REFERENCES broker_branches(id);
ALTER TABLE employees ADD CONSTRAINT employees_department_id_fkey FOREIGN KEY (department_id) REFERENCES broker_departments(id);
ALTER TABLE employees ADD CONSTRAINT employees_designation_id_fkey FOREIGN KEY (designation_id) REFERENCES designations(id);

ALTER TABLE sub_verticals ADD CONSTRAINT sub_verticals_vertical_id_fkey FOREIGN KEY (vertical_id) REFERENCES verticals(id) ON DELETE CASCADE;

ALTER TABLE insurer_branches ADD CONSTRAINT insurer_branches_insurer_id_fkey FOREIGN KEY (insurer_id) REFERENCES insurers(id);
ALTER TABLE insurer_branches ADD CONSTRAINT insurer_branches_city_id_fkey FOREIGN KEY (city_id) REFERENCES cities(id);
ALTER TABLE insurer_branches ADD CONSTRAINT insurer_branches_state_id_fkey FOREIGN KEY (state_id) REFERENCES states(id);
ALTER TABLE insurer_branches ADD CONSTRAINT insurer_branches_bank_name_id_fkey FOREIGN KEY (bank_name_id) REFERENCES bank_names(id);

ALTER TABLE customers ADD CONSTRAINT customers_city_id_fkey FOREIGN KEY (city_id) REFERENCES cities(id);
ALTER TABLE customers ADD CONSTRAINT customers_state_id_fkey FOREIGN KEY (state_id) REFERENCES states(id);
ALTER TABLE customers ADD CONSTRAINT customers_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE customers ADD CONSTRAINT customers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES broker_branches(id);

ALTER TABLE policies ADD CONSTRAINT policies_user_id_fkey FOREIGN KEY (user_id) REFERENCES employees(id);
ALTER TABLE policies ADD CONSTRAINT policies_vertical_id_fkey FOREIGN KEY (vertical_id) REFERENCES verticals(id);
ALTER TABLE policies ADD CONSTRAINT policies_sub_vertical_id_fkey FOREIGN KEY (sub_vertical_id) REFERENCES sub_verticals(id);
ALTER TABLE policies ADD CONSTRAINT policies_policy_holder_name_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE policies ADD CONSTRAINT policies_insurer_id_fkey FOREIGN KEY (insurer_id) REFERENCES insurers(id);
ALTER TABLE policies ADD CONSTRAINT policies_insurer_branch_id_fkey FOREIGN KEY (insurer_branch_id) REFERENCES insurer_branches(id);
ALTER TABLE policies ADD CONSTRAINT policies_issued_at_fkey FOREIGN KEY (issued_from_branch_id) REFERENCES broker_branches(id);
ALTER TABLE policies ADD CONSTRAINT policies_telecaller_fkey FOREIGN KEY (telecaller) REFERENCES employees(id);

ALTER TABLE premiums ADD CONSTRAINT premiums_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES policies(id);

ALTER TABLE commission ADD CONSTRAINT commission_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES policies(id);

ALTER TABLE expense ADD CONSTRAINT expense_user_id_fkey FOREIGN KEY (user_id) REFERENCES employees(id);
ALTER TABLE expense ADD CONSTRAINT expense_made_by_fkey FOREIGN KEY (made_by) REFERENCES employees(id);

ALTER TABLE transactions ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES employees(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_bank_id_fkey FOREIGN KEY (bank_id) REFERENCES bank_accounts(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_head_fkey FOREIGN KEY (head) REFERENCES heads(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES policies(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_payment_mode_id_fkey FOREIGN KEY (payment_mode_id) REFERENCES payment_modes(id);

-- ============================================================
-- Indexes (only the ones already present in the live schema for these
-- tables; more were added alongside later migrations' own new columns and
-- already live in those migration files).
-- ============================================================

CREATE INDEX idx_cities_name ON cities(name);
CREATE INDEX idx_cities_state ON cities(state_id);
CREATE INDEX idx_designations_department ON designations(department_id);
CREATE INDEX idx_employees_department_id ON employees(department_id);
CREATE INDEX idx_employees_designation_id ON employees(designation_id);
CREATE INDEX idx_sub_verticals_vertical ON sub_verticals(vertical_id);
CREATE INDEX idx_policies_insurer ON policies(insurer_id);
CREATE INDEX idx_policies_status ON policies(status);
CREATE INDEX idx_policies_vertical ON policies(vertical_id);
-- idx_premiums_policy_id and idx_transactions_bank_id are deliberately not
-- here — migrations 007 and 005 respectively already create them.
