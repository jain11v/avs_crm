const XLSX = require('xlsx');
const db = require('../config/db');
const { diffFields, logChange } = require('../utils/auditLog');

const RECEIPT_AUDIT_FIELDS = ['amount', 'bank_account_id', 'received_date', 'reference_id', 'remarks'];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const FK_FIELD_NAMES = {
  commission_receipts_policy_id_fkey: 'Policy',
  commission_receipts_bank_account_id_fkey: 'Bank account',
  commission_receipts_received_by_fkey: 'Employee',
};

function friendlyForeignKeyError(err) {
  const field = FK_FIELD_NAMES[err.constraint] || 'One of the selected values';
  return `${field} does not refer to a valid record. Please re-select it and try again.`;
}

function friendlyCheckError(err) {
  if (err.constraint === 'commission_receipts_amount_check') {
    return 'Amount must be greater than zero.';
  }
  return 'One of the fields is not in a valid format.';
}

// Expected commission per policy = brok_percent on the non-TP premium +
// tp_brok_percent on the TP-flagged premium (falling back to brok_percent
// when tp_brok_percent isn't set — e.g. a single lump "total premium" row
// with nothing flagged TP just runs entirely through brok_percent), plus
// reward_percent on the whole premium (non-TP + TP combined — unlike
// tp_brok_percent it isn't vertical/TP-split, see migration 027), plus GST
// on that combined brokerage+reward. Computed here in JS rather than SQL
// to reuse the same rounding as the rest of the app's money math. Shared
// by the per-policy list/export and the statement-matching flow below.
function computeExpectedCommission(r) {
  const nonTp = Number(r.non_tp_premium) || 0;
  const tp = Number(r.tp_premium) || 0;
  const brokPercent = Number(r.brok_percent) || 0;
  const tpBrokPercent = r.tp_brok_percent !== null && r.tp_brok_percent !== undefined
    ? Number(r.tp_brok_percent)
    : brokPercent;
  const rewardPercent = Number(r.reward_percent) || 0;
  const gstPercent = r.commission_gst_percent !== null && r.commission_gst_percent !== undefined
    ? Number(r.commission_gst_percent)
    : 18;

  const brokerage = round2(nonTp * (brokPercent / 100) + tp * (tpBrokPercent / 100));
  const reward = round2((nonTp + tp) * (rewardPercent / 100));
  const pretax = round2(brokerage + reward);
  const gstAmount = round2(pretax * (gstPercent / 100));
  return { pretax, gstAmount, total: round2(pretax + gstAmount), gstPercent };
}

// The same policy+commission+premium join as fetchRows, but for a single
// policy by number — used to match one statement row against the system's
// expected commission without loading every policy.
async function getExpectedByPolicyNumber(policyNumber) {
  const result = await db.query(
    `SELECT p.id AS policy_id, p.policy_number, p.insurer_id,
            c.brok_percent, c.tp_brok_percent, c.reward_percent, c.gst AS commission_gst_percent, c.status AS commission_status,
            COALESCE(pt.tp_premium, 0) AS tp_premium,
            COALESCE(pt.non_tp_premium, 0) AS non_tp_premium,
            cust.name AS customer_name,
            cr.id AS receipt_id
     FROM policies p
     JOIN customers cust ON p.customer_id = cust.id
     LEFT JOIN commission c ON c.policy_id = p.id
     LEFT JOIN (
       SELECT policy_id,
              SUM(prem + gst) FILTER (WHERE is_third_party) AS tp_premium,
              SUM(prem + gst) FILTER (WHERE NOT is_third_party) AS non_tp_premium
       FROM premiums
       GROUP BY policy_id
     ) pt ON pt.policy_id = p.id
     LEFT JOIN commission_receipts cr ON cr.policy_id = p.id
     WHERE p.policy_number = $1`,
    [policyNumber]
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  if (row.brok_percent === null && row.tp_brok_percent === null) {
    return { found: true, hasCommission: false, policyId: row.policy_id, customerName: row.customer_name, receiptId: row.receipt_id };
  }
  if (row.commission_status !== 'approved') {
    return {
      found: true, hasCommission: false, policyId: row.policy_id, customerName: row.customer_name,
      receiptId: row.receipt_id, pendingApproval: true,
    };
  }
  const expected = computeExpectedCommission(row);
  return {
    found: true,
    hasCommission: true,
    policyId: row.policy_id,
    insurerId: row.insurer_id,
    customerName: row.customer_name,
    receiptId: row.receipt_id,
    expectedTotal: expected.total,
  };
}

async function fetchRows(req) {
  const { insurer_id, insurer_branch_id, issued_from_branch_id, from, to, status, search } = req.query;
  const conditions = [];
  const params = [];

  if (insurer_id) {
    params.push(insurer_id);
    conditions.push(`p.insurer_id = $${params.length}`);
  }
  if (insurer_branch_id) {
    params.push(insurer_branch_id);
    conditions.push(`p.insurer_branch_id = $${params.length}`);
  }
  if (issued_from_branch_id) {
    params.push(issued_from_branch_id);
    conditions.push(`p.issued_from_branch_id = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`p.policy_start_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`p.policy_start_date <= $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(p.policy_number ILIKE $${params.length} OR cust.name ILIKE $${params.length})`);
  }
  if (status === 'received') {
    conditions.push('cr.id IS NOT NULL');
  } else if (status === 'pending') {
    conditions.push('cr.id IS NULL');
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.query(
    `SELECT p.id AS policy_id, p.policy_number, p.policy_start_date, p.premium_amount,
            c.brok_percent, c.tp_brok_percent, c.reward_percent, c.gst AS commission_gst_percent, c.status AS commission_status,
            COALESCE(pt.tp_premium, 0) AS tp_premium,
            COALESCE(pt.non_tp_premium, 0) AS non_tp_premium,
            cust.name AS customer_name,
            i.id AS insurer_id, i.name AS insurer_name,
            ib.id AS insurer_branch_id, ib.name AS insurer_branch_name,
            bb.id AS broker_branch_id, bb.name AS broker_branch_name,
            cr.id AS receipt_id, cr.amount AS received_amount, cr.received_date,
            cr.reference_id AS received_reference, cr.remarks AS received_remarks,
            cr.bank_account_id AS received_bank_account_id, ba.name AS received_bank_account_name
     FROM commission c
     JOIN policies p ON c.policy_id = p.id
     JOIN customers cust ON p.customer_id = cust.id
     LEFT JOIN insurers i ON p.insurer_id = i.id
     LEFT JOIN insurer_branches ib ON p.insurer_branch_id = ib.id
     LEFT JOIN broker_branches bb ON p.issued_from_branch_id = bb.id
     LEFT JOIN (
       SELECT policy_id,
              SUM(prem + gst) FILTER (WHERE is_third_party) AS tp_premium,
              SUM(prem + gst) FILTER (WHERE NOT is_third_party) AS non_tp_premium
       FROM premiums
       GROUP BY policy_id
     ) pt ON pt.policy_id = p.id
     LEFT JOIN commission_receipts cr ON cr.policy_id = p.id
     LEFT JOIN bank_accounts ba ON cr.bank_account_id = ba.id
     ${whereClause}
     ORDER BY i.name NULLS LAST, ib.name NULLS LAST, p.policy_start_date DESC`,
    params
  );

  return result.rows.map((r) => {
    const isApproved = r.commission_status === 'approved';
    const { pretax, gstAmount, total: expectedTotal, gstPercent } = isApproved
      ? computeExpectedCommission(r)
      : { pretax: null, gstAmount: null, total: null, gstPercent: r.commission_gst_percent };
    const receivedAmount = r.received_amount !== null ? Number(r.received_amount) : null;

    return {
      policy_id: r.policy_id,
      policy_number: r.policy_number,
      policy_start_date: r.policy_start_date,
      customer_name: r.customer_name,
      insurer_id: r.insurer_id,
      insurer_name: r.insurer_name,
      insurer_branch_id: r.insurer_branch_id,
      insurer_branch_name: r.insurer_branch_name,
      broker_branch_id: r.broker_branch_id,
      broker_branch_name: r.broker_branch_name,
      premium_amount: r.premium_amount,
      brok_percent: r.brok_percent,
      tp_brok_percent: r.tp_brok_percent,
      reward_percent: r.reward_percent,
      commission_gst_percent: gstPercent,
      commission_status: r.commission_status,
      expected_pretax: pretax,
      expected_gst: gstAmount,
      expected_total: expectedTotal,
      receipt_id: r.receipt_id,
      received_amount: receivedAmount,
      received_date: r.received_date,
      received_reference: r.received_reference,
      received_remarks: r.received_remarks,
      received_bank_account_id: r.received_bank_account_id,
      received_bank_account_name: r.received_bank_account_name,
      variance: (receivedAmount === null || expectedTotal === null) ? null : round2(expectedTotal - receivedAmount),
    };
  });
}

// GET /api/commission-reconciliation?insurer_id=&insurer_branch_id=&issued_from_branch_id=&from=&to=&status=&search=
async function list(req, res, next) {
  try {
    const rows = await fetchRows(req);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

function csvField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/commission-reconciliation/export.csv?... (same filters as list)
async function exportCsv(req, res, next) {
  try {
    const rows = await fetchRows(req);
    const header = [
      'Insurer', 'Insurer branch', 'Broker branch', 'Policy #', 'Customer', 'Policy start',
      'Premium', 'Brok %', 'TP brok %', 'Reward %', 'Expected commission', 'Received amount',
      'Received date', 'Variance',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        csvField(r.insurer_name),
        csvField(r.insurer_branch_name),
        csvField(r.broker_branch_name),
        csvField(r.policy_number),
        csvField(r.customer_name),
        csvField(r.policy_start_date ? new Date(r.policy_start_date).toISOString().slice(0, 10) : ''),
        r.premium_amount,
        r.brok_percent ?? '',
        r.tp_brok_percent ?? '',
        r.reward_percent ?? '',
        r.expected_total,
        r.received_amount ?? '',
        r.received_date ? new Date(r.received_date).toISOString().slice(0, 10) : '',
        r.variance ?? '',
      ].join(','));
    }

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="commission-reconciliation-${today}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
}

// Shared by markReceived (one policy, from the UI) and importStatement
// (many policies, from an uploaded statement) — deletes any existing
// receipt+transaction for the policy and posts a fresh one, logging the
// change either way. Runs inside the caller's transaction.
async function upsertReceipt(client, { policyId, amount, bankAccountId, receivedDate, referenceId, remarks, employeeId, statementId }) {
  const existing = await client.query(
    `SELECT id, ${RECEIPT_AUDIT_FIELDS.join(', ')} FROM commission_receipts WHERE policy_id = $1`,
    [policyId]
  );
  const before = existing.rows[0] || null;
  if (before) {
    await client.query('DELETE FROM transactions WHERE commission_receipt_id = $1', [before.id]);
    await client.query('DELETE FROM commission_receipts WHERE id = $1', [before.id]);
  }

  const result = await client.query(
    `INSERT INTO commission_receipts (policy_id, amount, bank_account_id, received_date, reference_id, remarks, received_by, commission_statement_id)
     VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6, $7, $8)
     RETURNING id, received_date`,
    [policyId, amount, bankAccountId, receivedDate || null, referenceId || null, remarks || null, employeeId, statementId || null]
  );
  const receipt = result.rows[0];

  await client.query(
    `INSERT INTO transactions (user_id, date_of_transaction, bank_id, type_of_transaction, amount, remarks, policy_id, commission_receipt_id, status)
     VALUES ($1, $2, $3, 'Credit', $4, $5, $6, $7, 'approved')`,
    [employeeId, receipt.received_date, bankAccountId, amount, remarks || 'Commission received from insurer', policyId, receipt.id]
  );

  await logChange(client, {
    entityType: 'commission_receipt',
    entityId: receipt.id,
    policyId,
    action: before ? 'update' : 'create',
    changes: diffFields(before, { amount, bank_account_id: bankAccountId, received_date: receipt.received_date, reference_id: referenceId, remarks }, RECEIPT_AUDIT_FIELDS),
    employeeId,
  });

  return receipt;
}

// POST /api/commission-reconciliation/:policyId/receipt
// Records (or replaces) the commission received for a policy and posts a
// Credit transaction for it — mirrors insurer_payments' Debit posting, in
// the opposite direction.
async function markReceived(req, res, next) {
  const client = await db.pool.connect();
  try {
    const policyId = req.params.policyId;
    const { amount, bank_account_id, received_date, reference_id, remarks } = req.body;

    if (!amount || !bank_account_id) {
      return res.status(400).json({ error: 'Missing required fields: amount, bank_account_id.' });
    }

    await client.query('BEGIN');
    const receipt = await upsertReceipt(client, {
      policyId, amount, bankAccountId: bank_account_id, receivedDate: received_date,
      referenceId: reference_id, remarks, employeeId: req.employee.id,
    });
    await client.query('COMMIT');
    res.status(201).json({ id: receipt.id });
  } catch (err) {
    await client.query('ROLLBACK');
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

// DELETE /api/commission-reconciliation/:policyId/receipt
async function removeReceipt(req, res, next) {
  const client = await db.pool.connect();
  try {
    const policyId = req.params.policyId;
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id, ${RECEIPT_AUDIT_FIELDS.join(', ')} FROM commission_receipts WHERE policy_id = $1`,
      [policyId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No receipt recorded for this policy.' });
    }
    const before = existing.rows[0];
    await client.query('DELETE FROM transactions WHERE commission_receipt_id = $1', [before.id]);
    await client.query('DELETE FROM commission_receipts WHERE id = $1', [before.id]);

    await logChange(client, {
      entityType: 'commission_receipt',
      entityId: before.id,
      policyId,
      action: 'delete',
      changes: diffFields(before, null, RECEIPT_AUDIT_FIELDS),
      employeeId: req.employee.id,
    });

    await client.query('COMMIT');
    res.json({ message: 'Receipt removed.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// POST /api/commission-reconciliation/statements/parse  (multipart: file)
// Pure parse, no DB writes — reads the uploaded CSV/XLSX and hands back
// its header row plus every data row as plain arrays, so the frontend can
// let the user map columns before anything is matched or imported.
async function parseStatement(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    let workbook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch {
      return res.status(400).json({ error: 'Could not read that file — is it a valid CSV or Excel file?' });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
    if (raw.length < 2) {
      return res.status(400).json({ error: 'That file has no data rows below the header.' });
    }
    if (raw.length - 1 > 5000) {
      return res.status(400).json({ error: 'That statement has too many rows (max 5000) — split it and import in batches.' });
    }

    const headers = raw[0].map((h) => String(h).trim());
    const rows = raw.slice(1).map((r) => headers.map((_, i) => (r[i] !== undefined ? String(r[i]).trim() : '')));

    res.json({ headers, rows, rowCount: rows.length });
  } catch (err) {
    next(err);
  }
}

// POST /api/commission-reconciliation/statements/match
// body: { rows: [[...cell values...]], mapping: { policy_number: colIndex, amount: colIndex, reference?: colIndex } }
// Pure computation, no DB writes — matches each row against the system's
// expected commission by policy number.
async function matchStatement(req, res, next) {
  try {
    const { rows, mapping } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows to match.' });
    }
    if (mapping?.policy_number === undefined || mapping?.amount === undefined) {
      return res.status(400).json({ error: 'Map both a Policy number column and an Amount column.' });
    }

    const results = [];
    for (const row of rows) {
      const policyNumber = (row[mapping.policy_number] || '').trim();
      const amountRaw = (row[mapping.amount] || '').replace(/,/g, '').trim();
      const reference = mapping.reference !== undefined ? (row[mapping.reference] || '').trim() : null;
      const amount = Number(amountRaw);

      if (!policyNumber) {
        results.push({ policy_number: '', statement_amount: amountRaw, matched: false, reason: 'Blank policy number' });
        continue;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        results.push({ policy_number: policyNumber, statement_amount: amountRaw, matched: false, reason: 'Invalid amount' });
        continue;
      }

      const expected = await getExpectedByPolicyNumber(policyNumber);
      if (!expected) {
        results.push({ policy_number: policyNumber, statement_amount: amount, reference, matched: false, reason: 'Policy not found' });
        continue;
      }
      if (!expected.hasCommission) {
        results.push({
          policy_number: policyNumber, statement_amount: amount, reference, matched: false,
          reason: expected.pendingApproval ? 'Commission % awaiting manager approval' : 'No commission % set on this policy',
          policy_id: expected.policyId, customer_name: expected.customerName,
        });
        continue;
      }

      results.push({
        policy_number: policyNumber,
        statement_amount: amount,
        reference,
        matched: true,
        policy_id: expected.policyId,
        customer_name: expected.customerName,
        expected_total: expected.expectedTotal,
        variance: round2(expected.expectedTotal - amount),
        already_received: Boolean(expected.receiptId),
      });
    }

    const matchedCount = results.filter((r) => r.matched).length;
    res.json({ results, summary: { total: results.length, matched: matchedCount, unmatched: results.length - matchedCount } });
  } catch (err) {
    next(err);
  }
}

// POST /api/commission-reconciliation/statements/import
// body: { insurer_id, bank_account_id, reference_id, remarks, filename, received_date, rows: [{ policy_id, amount, reference? }] }
// `rows` is the subset of matched rows the user chose to confirm.
async function importStatement(req, res, next) {
  const client = await db.pool.connect();
  try {
    const { insurer_id, bank_account_id, reference_id, remarks, filename, received_date, rows } = req.body;

    if (!bank_account_id || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: bank_account_id, rows.' });
    }

    await client.query('BEGIN');

    const totalAmount = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const statementResult = await client.query(
      `INSERT INTO commission_statements (insurer_id, filename, bank_account_id, reference_id, remarks, matched_count, total_amount, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [insurer_id || null, filename || null, bank_account_id, reference_id || null, remarks || null, rows.length, round2(totalAmount), req.employee.id]
    );
    const statementId = statementResult.rows[0].id;

    let imported = 0;
    const failures = [];
    for (const row of rows) {
      if (!row.policy_id || !row.amount) continue;
      // Each row gets its own savepoint — a bad row (bad FK, failed check
      // constraint) would otherwise poison the whole shared transaction,
      // making every later row in the loop fail too and turning the final
      // COMMIT into a silent no-op ROLLBACK with nothing actually saved.
      await client.query('SAVEPOINT row_import');
      try {
        await upsertReceipt(client, {
          policyId: row.policy_id,
          amount: row.amount,
          bankAccountId: bank_account_id,
          receivedDate: received_date,
          referenceId: row.reference || reference_id || null,
          remarks: remarks || 'Commission received from insurer (statement import)',
          employeeId: req.employee.id,
          statementId,
        });
        await client.query('RELEASE SAVEPOINT row_import');
        imported += 1;
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT row_import');
        failures.push({ policy_id: row.policy_id, error: err.message });
      }
    }

    if (imported === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'None of the selected rows could be imported.', failures });
    }

    await client.query('COMMIT');
    res.status(201).json({ statement_id: statementId, imported, failed: failures.length, failures });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// GET /api/commission-reconciliation/statements
async function listStatements(req, res, next) {
  try {
    const result = await db.query(
      `SELECT s.id, s.filename, s.reference_id, s.remarks, s.matched_count, s.total_amount, s.created_at,
              i.name AS insurer_name, ba.name AS bank_account_name,
              e.first_name AS uploaded_by_first_name, e.last_name AS uploaded_by_last_name
       FROM commission_statements s
       LEFT JOIN insurers i ON s.insurer_id = i.id
       LEFT JOIN bank_accounts ba ON s.bank_account_id = ba.id
       LEFT JOIN employees e ON s.uploaded_by = e.id
       ORDER BY s.created_at DESC
       LIMIT 50`
    );
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list, exportCsv, markReceived, removeReceipt,
  parseStatement, matchStatement, importStatement, listStatements,
  // Exported for unit testing — pure functions, no DB access.
  computeExpectedCommission, round2,
};
