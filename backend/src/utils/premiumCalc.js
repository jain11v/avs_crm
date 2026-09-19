// Shared premium math for policy create/update. A policy's premium is never
// entered directly — it's built from one or more coverage rows (e.g. Own
// Damage, Third Party, Personal Accident), each with its own premium and
// GST%. A row's GST is derived from its own premium and rate, and the
// policy's premium_amount is the sum of every row's (premium + GST).

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Validates and normalizes the premiums array from a request body.
// Returns { rows, netPremium } on success, or { error } (a user-facing
// message) on the first invalid row.
function computePremiums(premiums) {
  if (!Array.isArray(premiums) || premiums.length === 0) {
    return { error: 'At least one premium coverage is required.' };
  }

  const rows = [];
  for (const row of premiums) {
    const coverage = (row.coverage || '').trim();
    if (!coverage) {
      return { error: 'Each premium row needs a coverage name.' };
    }

    const prem = Number(row.prem);
    if (!Number.isFinite(prem) || prem < 0) {
      return { error: `Enter a valid premium amount for "${coverage}".` };
    }

    const gstPercent = row.gst_percent === undefined || row.gst_percent === null || row.gst_percent === ''
      ? 0
      : Number(row.gst_percent);
    if (!Number.isFinite(gstPercent) || gstPercent < 0) {
      return { error: `Enter a valid GST % for "${coverage}".` };
    }

    const sumInsured = row.sum_insured === undefined || row.sum_insured === null || row.sum_insured === ''
      ? null
      : Number(row.sum_insured);

    const gst = round2(prem * (gstPercent / 100));

    rows.push({
      coverage,
      sum_insured: sumInsured,
      prem_rate: row.prem_rate || null,
      prem: round2(prem),
      gst_percent: gstPercent,
      gst,
      is_third_party: Boolean(row.is_third_party),
    });
  }

  const netPremium = round2(rows.reduce((sum, r) => sum + r.prem + r.gst, 0));

  return { rows, netPremium, error: null };
}

module.exports = { computePremiums, round2 };
