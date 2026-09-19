const db = require('../config/db');

// GET /api/premiums?policy_id=
// Read-only: premium rows are only ever written as part of a policy
// create/update (see policyController) — this just feeds the "manage
// premiums" modal when opening an existing policy for edit.
async function listByPolicy(req, res, next) {
  try {
    const { policy_id } = req.query;

    if (!policy_id) {
      return res.status(400).json({ error: 'policy_id is required.' });
    }

    const result = await db.query(
      `SELECT id, coverage, sum_insured, prem_rate, prem, gst_percent, gst, is_third_party
       FROM premiums
       WHERE policy_id = $1
       ORDER BY id`,
      [policy_id]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { listByPolicy };
