// Commission is a single optional record per policy — the broker's own
// brokerage % (plus a separate TP brokerage % for motor policies) and the
// GST charged on that commission, which defaults to 18% (the standard
// GST rate on brokerage/commission services in India) whenever a
// commission is being set but no GST is given.

function toPercentOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
}

// Reads `commission` from a request body and returns one of:
//  - { skip: true }  — key wasn't in the body at all; leave existing data alone
//  - { clear: true } — explicitly null; remove any existing commission record
//  - { row }         — validated, ready-to-store fields
//  - { error }       — a user-facing validation message
function validateCommission(commission) {
  if (commission === undefined) {
    return { skip: true };
  }
  if (commission === null) {
    return { clear: true };
  }

  const brokPercent = toPercentOrNull(commission.brok_percent);
  const tpBrokPercent = toPercentOrNull(commission.tp_brok_percent);
  const rewardPercent = toPercentOrNull(commission.reward_percent);
  const gstRaw = toPercentOrNull(commission.gst);
  const gst = gstRaw === null ? 18 : gstRaw;

  for (const [label, value] of [
    ['Brokerage %', brokPercent],
    ['TP brokerage %', tpBrokPercent],
    ['Reward %', rewardPercent],
    ['GST %', gst],
  ]) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return { error: `Enter a valid ${label}.` };
    }
  }

  return {
    row: {
      brok_percent: brokPercent,
      tp_brok_percent: tpBrokPercent,
      reward_percent: rewardPercent,
      gst,
      remarks: commission.remarks || null,
    },
  };
}

module.exports = { validateCommission };
