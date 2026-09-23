const db = require('../config/db');
const { computePremiums } = require('../utils/premiumCalc');
const { validateCommission } = require('../utils/commissionCalc');
const { diffFields, logChange } = require('../utils/auditLog');
const { selfAndDescendantIds } = require('../utils/orgHierarchy');

const POLICY_AUDIT_FIELDS = [
  'policy_number', 'customer_id', 'insurer_id', 'insurer_branch_id',
  'sum_insured', 'premium_amount', 'policy_start_date', 'policy_end_date', 'status',
];
const COMMISSION_AUDIT_FIELDS = ['brok_percent', 'tp_brok_percent', 'reward_percent', 'gst', 'remarks'];

// An employee's commission entry needs a manager/admin to confirm it
// before it counts toward reconciliation (mirrors the discount/cashback
// approval pattern) — a manager/admin (or elevated custom role) setting it
// is the checker, so their own entry auto-approves.
function commissionApprovalFor(employee) {
  const isChecker = employee.role === 'admin' || employee.is_elevated;
  return {
    status: isChecker ? 'approved' : 'pending',
    approvedBy: isChecker ? employee.id : null,
    approvedAt: isChecker,
  };
}

// Maps Postgres FK constraint names to plain-English field names. Note some
// of these keep their original name from before columns were renamed
// (issued_at -> issued_from_branch_id, policy_holder_name -> customer_id) —
// Postgres doesn't rename the constraint itself when a column is renamed.
const FK_FIELD_NAMES = {
  policies_insurer_id_fkey: 'Insurer',
  policies_insurer_branch_id_fkey: 'Insurer branch',
  policies_issued_at_fkey: 'Issued from branch',
  policies_policy_holder_name_fkey: 'Customer',
  policies_sub_vertical_id_fkey: 'Sub-vertical',
  policies_telecaller_fkey: 'Telecaller',
  policies_user_id_fkey: 'Assigned employee',
  policies_vertical_id_fkey: 'Vertical',
  policies_renewed_from_policy_id_fkey: 'Renewed-from policy',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

function friendlyCheckError(err) {
  if (err.constraint === 'policies_check') {
    return 'Policy end date must be after the start date.';
  }
  if (err.constraint === 'policies_status_check') {
    return 'Status must be one of: Active, Renewed, Not Renewed.';
  }
  if (err.constraint === 'policies_type_of_business_check') {
    return 'Type of business must be one of: new, old, renewal.';
  }
  return 'One of the fields is not in a valid format.';
}

// Status is never entered directly (see EDITABLE_FIELDS) — it only ever
// takes one of three values, and dates play no part in it: every new
// policy starts 'Active' (below), markLost() moves it to 'Not Renewed',
// and create() moves a policy's *source* to 'Renewed' when something else
// renews it. There's deliberately no "Lapsed"/"Expired" — whether the
// cover dates have passed doesn't change what bucket a policy is in here.

// GET /api/policies?q=&status=&page=&limit=
async function list(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const status = (req.query.status || '').trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(p.policy_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = await db.query(
      `SELECT COUNT(*) FROM policies p LEFT JOIN customers c ON p.customer_id = c.id ${whereClause}`,
      params
    );
    const total = parseInt(totalResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT p.id, p.policy_number, p.premium_amount, p.policy_start_date, p.policy_end_date,
              p.status, p.type_of_business, c.name AS customer_name, i.name AS insurer_name,
              v.name AS vertical_name
       FROM policies p
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN insurers i ON p.insurer_id = i.id
       LEFT JOIN verticals v ON p.vertical_id = v.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, total, page, limit });
  } catch (err) {
    next(err);
  }
}

// GET /api/policies/:id
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT p.*, c.name AS customer_name, c.email AS customer_email,
              i.name AS insurer_name, ib.name AS insurer_branch_name,
              v.name AS vertical_name, sv.name AS sub_vertical_name,
              bb.name AS issued_from_branch_name,
              ue.first_name AS user_first_name, ue.last_name AS user_last_name,
              te.first_name AS telecaller_first_name, te.last_name AS telecaller_last_name,
              rf.id AS renewed_from_id, rf.policy_number AS renewed_from_policy_number,
              rt.id AS renewed_to_id, rt.policy_number AS renewed_to_policy_number
       FROM policies p
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN insurers i ON p.insurer_id = i.id
       LEFT JOIN insurer_branches ib ON p.insurer_branch_id = ib.id
       LEFT JOIN verticals v ON p.vertical_id = v.id
       LEFT JOIN sub_verticals sv ON p.sub_vertical_id = sv.id
       LEFT JOIN broker_branches bb ON p.issued_from_branch_id = bb.id
       LEFT JOIN employees ue ON p.user_id = ue.id
       LEFT JOIN employees te ON p.telecaller = te.id
       LEFT JOIN policies rf ON p.renewed_from_policy_id = rf.id
       LEFT JOIN policies rt ON rt.renewed_from_policy_id = p.id
       WHERE p.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// GET /api/policies/renewals-due?days=30
// Policies worth renewing: renewable, due within the window (or already
// overdue — no lower bound, so anything not yet renewed keeps showing up
// until someone acts on it), status 'Active' or 'Not Renewed' (being marked
// lost, via markLost() below, must NOT drop a policy off this list — the
// business still wants to see and possibly re-chase it), and not already
// renewed (no other policy points back to it — 'Renewed' is excluded by
// this same check, not by the status filter). Scoped by ownership
// (policies.user_id, "assigned employee") for anyone but admin — an
// employee sees only their own, and anyone with reports (see
// selfAndDescendantIds) also sees their whole team's, so a plain employee
// naturally sees only themselves since they have no reports.
async function getRenewalsDue(req, res, next) {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);

    const params = [days];
    let ownerFilter = '';
    if (req.employee.role !== 'admin') {
      const ownerIds = await selfAndDescendantIds(req.employee.id);
      params.push(ownerIds);
      ownerFilter = `AND p.user_id = ANY($${params.length})`;
    }

    const result = await db.query(
      `SELECT p.id, p.policy_number, p.premium_amount, p.policy_end_date, p.status,
              c.name AS customer_name, i.name AS insurer_name
       FROM policies p
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN insurers i ON p.insurer_id = i.id
       WHERE p.renewable = true
         AND p.status IN ('Active', 'Not Renewed')
         AND p.policy_end_date <= CURRENT_DATE + ($1 || ' days')::interval
         AND NOT EXISTS (SELECT 1 FROM policies r WHERE r.renewed_from_policy_id = p.id)
         ${ownerFilter}
       ORDER BY p.policy_end_date ASC`,
      params
    );

    res.json({ data: result.rows, days });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/policies/:id/lost
// Marks a policy's renewal as lost — the customer isn't renewing (this
// time). Sets status = 'Not Renewed' rather than 'Cancelled': a lost
// renewal isn't a genuine mid-term policy cancellation, and — unlike
// Cancelled — it deliberately keeps showing up in the renewals-due
// list/alert (see getRenewalsDue above) rather than disappearing, since
// the business still wants to see and possibly re-chase it. Also stamps
// lost_by/lost_at (migration 028) so it can be counted per employee — see
// performanceController.js.
async function markLost(req, res, next) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT ${POLICY_AUDIT_FIELDS.join(', ')} FROM policies WHERE id = $1`,
      [req.params.id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Policy not found.' });
    }
    const before = existing.rows[0];

    await client.query(
      `UPDATE policies SET status = 'Not Renewed', lost_by = $1, lost_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [req.employee.id, req.params.id]
    );

    await logChange(client, {
      entityType: 'policy',
      entityId: req.params.id,
      policyId: req.params.id,
      action: 'update',
      changes: diffFields(before, { ...before, status: 'Not Renewed' }, POLICY_AUDIT_FIELDS),
      employeeId: req.employee.id,
    });

    await client.query('COMMIT');
    res.json({ id: Number(req.params.id), status: 'Not Renewed' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// GET /api/policies/:id/finance
// Everything money-related for one policy in a single payload — customer
// payments received for it, insurer payments made for it, discount/cashback
// adjustments against it, and the resulting balances — so the frontend can
// show and manage all of it on one page. The basic accounting: premium ==
// amount owed to the insurer == (amount paid by the customer + any
// discount/cashback + whatever balance remains outstanding).
async function getFinance(req, res, next) {
  try {
    const policyId = req.params.id;

    const policyResult = await db.query(
      `SELECT p.id, p.policy_number, p.premium_amount, p.status,
              p.customer_id, c.name AS customer_name,
              p.insurer_id, i.name AS insurer_name
       FROM policies p
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN insurers i ON p.insurer_id = i.id
       WHERE p.id = $1`,
      [policyId]
    );
    if (policyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found.' });
    }
    const policy = policyResult.rows[0];

    const customerPaymentsResult = await db.query(
      `SELECT cpa.id AS allocation_id, cpa.amount, cp.id AS payment_id, cp.payment_date,
              cp.reference_id, cp.remarks, ba.name AS bank_account_name
       FROM customer_payment_allocations cpa
       JOIN customer_payments cp ON cpa.payment_id = cp.id
       LEFT JOIN bank_accounts ba ON cp.bank_account_id = ba.id
       WHERE cpa.policy_id = $1
       ORDER BY cp.payment_date DESC, cp.id DESC`,
      [policyId]
    );

    const insurerPaymentsResult = await db.query(
      `SELECT ip.id, ip.amount, ip.payment_date, ip.reference_id, ip.remarks,
              ba.name AS bank_account_name
       FROM insurer_payments ip
       LEFT JOIN bank_accounts ba ON ip.bank_account_id = ba.id
       WHERE ip.policy_id = $1
       ORDER BY ip.payment_date DESC, ip.id DESC`,
      [policyId]
    );

    const adjustmentsResult = await db.query(
      `SELECT pa.id, pa.type, pa.amount, pa.status, pa.remarks, pa.approver_remarks, pa.created_by,
              cb.first_name AS created_by_first_name, cb.last_name AS created_by_last_name
       FROM policy_adjustments pa
       LEFT JOIN employees cb ON pa.created_by = cb.id
       WHERE pa.policy_id = $1
       ORDER BY pa.created_at DESC`,
      [policyId]
    );

    const premium = Number(policy.premium_amount || 0);
    const totalPaidByCustomer = customerPaymentsResult.rows.reduce((s, r) => s + Number(r.amount), 0);
    const totalDiscount = adjustmentsResult.rows
      .filter((a) => a.type === 'discount' && a.status === 'approved')
      .reduce((s, a) => s + Number(a.amount), 0);
    const totalCashback = adjustmentsResult.rows
      .filter((a) => a.type === 'cashback' && a.status === 'approved')
      .reduce((s, a) => s + Number(a.amount), 0);
    const totalPaidToInsurer = insurerPaymentsResult.rows.reduce((s, r) => s + Number(r.amount), 0);

    res.json({
      policy,
      customer_payments: customerPaymentsResult.rows,
      insurer_payments: insurerPaymentsResult.rows,
      adjustments: adjustmentsResult.rows,
      totals: {
        premium_amount: premium,
        total_paid_by_customer: totalPaidByCustomer,
        total_discount: totalDiscount,
        total_cashback: totalCashback,
        customer_balance: premium - totalPaidByCustomer - totalDiscount - totalCashback,
        total_paid_to_insurer: totalPaidToInsurer,
        insurer_balance: premium - totalPaidToInsurer,
      },
    });
  } catch (err) {
    next(err);
  }
}

// premium_amount is deliberately excluded — it's never entered directly,
// only ever derived from the policy's premium coverage rows (see
// computePremiums / the premiums array handling in create and update).
const EDITABLE_FIELDS = [
  'type_of_business', 'policy_number', 'vertical_id', 'sub_vertical_id',
  'customer_id', 'renewable', 'insurer_id', 'insurer_branch_id', 'sum_insured',
  'issued_from_branch_id', 'policy_start_date', 'policy_end_date',
  'source', 'telecaller', 'remarks', 'renewed_from_policy_id', 'risk_details',
];

const REQUIRED_FIELDS = [
  'policy_number', 'customer_id', 'insurer_id', 'insurer_branch_id',
  'policy_start_date', 'policy_end_date',
];

function pickFields(body) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      out[field] = body[field] === '' ? null : body[field];
    }
  }
  return out;
}

function missingRequiredFields(fields) {
  return REQUIRED_FIELDS.filter((f) => fields[f] === undefined || fields[f] === null || fields[f] === '');
}

// A policy created from a task-lead (see taskController) carries its
// documents over — checked inside the same transaction as the policy
// insert so a bad from_task_id rolls the whole thing back rather than
// leaving an orphaned policy.
async function loadLinkableTask(client, taskId, employee) {
  const result = await client.query('SELECT id, assigned_to, outcome FROM tasks WHERE id = $1', [taskId]);
  if (result.rows.length === 0) {
    return { error: 'That task was not found.' };
  }
  const task = result.rows[0];
  if (employee.role !== 'admin' && String(task.assigned_to) !== String(employee.id)) {
    return { error: 'You can only link a policy to your own task.' };
  }
  if (task.outcome !== 'pending') {
    return { error: 'That task has already been resolved.' };
  }
  return { task };
}

// POST /api/policies
// Every policy needs at least one premium coverage row up front — the
// premium isn't typed in, it's built from these (see computePremiums) —
// so the policy and its premium rows are created together in one
// transaction, with premium_amount set to their computed total.
async function create(req, res, next) {
  const client = await db.pool.connect();
  try {
    const { rows: premiumRows, netPremium, error: premiumError } = computePremiums(req.body.premiums);
    if (premiumError) {
      return res.status(400).json({ error: premiumError });
    }

    const commissionResult = validateCommission(req.body.commission);
    if (commissionResult.error) {
      return res.status(400).json({ error: commissionResult.error });
    }

    const fields = pickFields(req.body);
    fields.premium_amount = netPremium;
    fields.user_id = req.employee.id;
    fields.status = 'Active';

    const missing = missingRequiredFields(fields);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}.` });
    }

    await client.query('BEGIN');

    let linkedTask = null;
    if (req.body.from_task_id) {
      const taskCheck = await loadLinkableTask(client, req.body.from_task_id, req.employee);
      if (taskCheck.error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: taskCheck.error });
      }
      linkedTask = taskCheck.task;
    }

    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    const result = await client.query(
      `INSERT INTO policies (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
      values
    );
    const policyId = result.rows[0].id;

    await logChange(client, {
      entityType: 'policy',
      entityId: policyId,
      policyId,
      action: 'create',
      changes: diffFields(null, fields, POLICY_AUDIT_FIELDS),
      employeeId: req.employee.id,
    });

    // This new policy renews another one — flip the source's own status to
    // 'Renewed' so it reads correctly wherever status is shown (it was
    // already excluded from the renewals-due list via the "already
    // renewed" NOT EXISTS check regardless of status, but it would
    // otherwise keep showing a stale Active/Not Renewed forever).
    if (fields.renewed_from_policy_id) {
      const sourceBefore = (await client.query(
        `SELECT ${POLICY_AUDIT_FIELDS.join(', ')} FROM policies WHERE id = $1`,
        [fields.renewed_from_policy_id]
      )).rows[0];
      if (sourceBefore) {
        await client.query(`UPDATE policies SET status = 'Renewed' WHERE id = $1`, [fields.renewed_from_policy_id]);
        await logChange(client, {
          entityType: 'policy',
          entityId: fields.renewed_from_policy_id,
          policyId: fields.renewed_from_policy_id,
          action: 'update',
          changes: diffFields(sourceBefore, { ...sourceBefore, status: 'Renewed' }, POLICY_AUDIT_FIELDS),
          employeeId: req.employee.id,
        });
      }
    }

    for (const row of premiumRows) {
      await client.query(
        `INSERT INTO premiums (policy_id, coverage, sum_insured, prem_rate, prem, gst_percent, gst, is_third_party)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [policyId, row.coverage, row.sum_insured, row.prem_rate, row.prem, row.gst_percent, row.gst, row.is_third_party]
      );
    }

    if (commissionResult.row) {
      const c = commissionResult.row;
      const approval = commissionApprovalFor(req.employee);
      const commissionResultRow = await client.query(
        `INSERT INTO commission (policy_id, brok_percent, tp_brok_percent, reward_percent, gst, remarks, status, set_by, approved_by, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${approval.approvedAt ? 'CURRENT_TIMESTAMP' : 'NULL'})
         RETURNING id`,
        [policyId, c.brok_percent, c.tp_brok_percent, c.reward_percent, c.gst, c.remarks, approval.status, req.employee.id, approval.approvedBy]
      );
      await logChange(client, {
        entityType: 'commission',
        entityId: commissionResultRow.rows[0].id,
        policyId,
        action: 'create',
        changes: diffFields(null, { ...c, status: approval.status }, [...COMMISSION_AUDIT_FIELDS, 'status']),
        employeeId: req.employee.id,
      });
    }

    if (linkedTask) {
      await client.query(
        `UPDATE tasks
         SET outcome = 'converted', policy_id = $1, status = 'done',
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [policyId, linkedTask.id]
      );
      await client.query(
        `UPDATE documents SET entity_type = 'policy', entity_id = $1
         WHERE entity_type = 'task' AND entity_id = $2`,
        [policyId, linkedTask.id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ id: policyId, premium_amount: netPremium });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      if (err.constraint === 'policies_renewed_from_policy_id_key') {
        return res.status(409).json({ error: 'That policy has already been renewed.' });
      }
      return res.status(409).json({ error: 'A policy with this policy number already exists.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: friendlyCheckError(err) });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  } finally {
    client.release();
  }
}

// PUT /api/policies/:id
// A `premiums` array in the body means "replace the coverage breakdown" —
// existing rows are swapped for these (within the same transaction as the
// other field updates) and premium_amount is recomputed from them. Omit
// `premiums` entirely to edit other fields without touching the premium
// breakdown at all.
async function update(req, res, next) {
  const client = await db.pool.connect();
  try {
    const fields = pickFields(req.body);

    let premiumRows = null;
    let netPremium = null;
    if (req.body.premiums !== undefined) {
      const computed = computePremiums(req.body.premiums);
      if (computed.error) {
        return res.status(400).json({ error: computed.error });
      }
      premiumRows = computed.rows;
      netPremium = computed.netPremium;
      fields.premium_amount = netPremium;
    }

    const commissionResult = validateCommission(req.body.commission);
    if (commissionResult.error) {
      return res.status(400).json({ error: commissionResult.error });
    }

    if (Object.keys(fields).length === 0 && commissionResult.skip) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    // If any required field is being explicitly cleared, reject it —
    // required fields must always end up with a real value.
    const clearedRequired = REQUIRED_FIELDS.filter((f) => f in fields && (fields[f] === null || fields[f] === ''));
    if (clearedRequired.length > 0) {
      return res.status(400).json({ error: `These fields cannot be cleared: ${clearedRequired.join(', ')}.` });
    }

    await client.query('BEGIN');

    const beforePolicy = (await client.query(
      `SELECT ${POLICY_AUDIT_FIELDS.join(', ')} FROM policies WHERE id = $1`,
      [req.params.id]
    )).rows[0];

    // status is never touched by a plain field update — it only ever
    // changes via markLost() or the renewed-source flip in create() — so
    // editing a policy's dates (or anything else) can never affect it.
    const columns = Object.keys(fields);
    let policyId = req.params.id;

    if (columns.length > 0) {
      const values = Object.values(fields);
      const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

      const result = await client.query(
        `UPDATE policies SET ${setClause} WHERE id = $${columns.length + 1} RETURNING id`,
        [...values, req.params.id]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Policy not found.' });
      }
      policyId = result.rows[0].id;

      await logChange(client, {
        entityType: 'policy',
        entityId: policyId,
        policyId,
        action: 'update',
        changes: diffFields(beforePolicy, { ...beforePolicy, ...fields }, POLICY_AUDIT_FIELDS),
        employeeId: req.employee.id,
      });
    } else {
      const existing = await client.query('SELECT id FROM policies WHERE id = $1', [req.params.id]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Policy not found.' });
      }
    }

    if (premiumRows) {
      await client.query('DELETE FROM premiums WHERE policy_id = $1', [req.params.id]);
      for (const row of premiumRows) {
        await client.query(
          `INSERT INTO premiums (policy_id, coverage, sum_insured, prem_rate, prem, gst_percent, gst, is_third_party)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [req.params.id, row.coverage, row.sum_insured, row.prem_rate, row.prem, row.gst_percent, row.gst, row.is_third_party]
        );
      }
    }

    if (commissionResult.clear || commissionResult.row) {
      const beforeCommission = (await client.query(
        `SELECT id, ${COMMISSION_AUDIT_FIELDS.join(', ')} FROM commission WHERE policy_id = $1`,
        [req.params.id]
      )).rows[0];

      if (commissionResult.clear) {
        if (beforeCommission) {
          await client.query('DELETE FROM commission WHERE policy_id = $1', [req.params.id]);
          await logChange(client, {
            entityType: 'commission',
            entityId: beforeCommission.id,
            policyId: req.params.id,
            action: 'delete',
            changes: diffFields(beforeCommission, null, COMMISSION_AUDIT_FIELDS),
            employeeId: req.employee.id,
          });
        }
      } else {
        const c = commissionResult.row;
        const approval = commissionApprovalFor(req.employee);
        const commissionResultRow = await client.query(
          `INSERT INTO commission (policy_id, brok_percent, tp_brok_percent, reward_percent, gst, remarks, status, set_by, approved_by, approved_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${approval.approvedAt ? 'CURRENT_TIMESTAMP' : 'NULL'})
           ON CONFLICT (policy_id) DO UPDATE
           SET brok_percent = $2, tp_brok_percent = $3, reward_percent = $4, gst = $5, remarks = $6,
               status = $7, set_by = $8, approved_by = $9,
               approved_at = ${approval.approvedAt ? 'CURRENT_TIMESTAMP' : 'NULL'}, approver_remarks = NULL
           RETURNING id`,
          [req.params.id, c.brok_percent, c.tp_brok_percent, c.reward_percent, c.gst, c.remarks, approval.status, req.employee.id, approval.approvedBy]
        );
        await logChange(client, {
          entityType: 'commission',
          entityId: commissionResultRow.rows[0].id,
          policyId: req.params.id,
          action: beforeCommission ? 'update' : 'create',
          changes: diffFields(beforeCommission, { ...c, status: approval.status }, [...COMMISSION_AUDIT_FIELDS, 'status']),
          employeeId: req.employee.id,
        });
      }
    }

    await client.query('COMMIT');
    res.json({ id: policyId, premium_amount: netPremium ?? undefined });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A policy with this policy number already exists.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: friendlyCheckError(err) });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: friendlyForeignKeyError(err) });
    }
    next(err);
  } finally {
    client.release();
  }
}

// DELETE /api/policies/:id
async function remove(req, res, next) {
  try {
    const result = await db.query('DELETE FROM policies WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found.' });
    }

    res.json({ message: 'Policy deleted.' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'This policy has premiums, commission, or transactions linked to it and cannot be deleted. Consider marking it Cancelled instead.',
      });
    }
    next(err);
  }
}

module.exports = { list, getById, create, update, remove, getFinance, getRenewalsDue, markLost };
