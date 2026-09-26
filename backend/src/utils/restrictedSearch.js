// Customer phone numbers and policy details are sensitive, so for anyone
// but admin the customer/policy lists are lookup-only: nothing comes back
// until at least MIN_QUERY_LENGTH characters are searched, and never more
// than MAX_RESULTS rows, with no paging — so the whole database can't be
// walked through page by page. Admin keeps normal paging.
const MIN_QUERY_LENGTH = 3;
const MAX_RESULTS = 10;

// Returns { page, limit, offset } to use for the query, or { blocked }
// holding the empty response to send instead.
function restrictedSearch(req, q) {
  if (req.employee.role === 'admin') {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    return { page, limit, offset: (page - 1) * limit };
  }

  if (q.length < MIN_QUERY_LENGTH) {
    return { blocked: { data: [], total: 0, page: 1, limit: MAX_RESULTS, search_required: true } };
  }
  return { page: 1, limit: MAX_RESULTS, offset: 0 };
}

// Renewals window for anyone but admin: policies ending in the next 10
// days, or that ended up to 2 days ago. Shared by the Renewals page
// (policyController.getRenewalsDue) and the renewals alert
// (alertsController) so the two can't drift apart. Expects the policies
// table aliased as `p`.
const RENEWAL_WINDOW_SQL = `p.policy_end_date BETWEEN CURRENT_DATE - INTERVAL '2 days' AND CURRENT_DATE + INTERVAL '10 days'`;

module.exports = { restrictedSearch, MIN_QUERY_LENGTH, MAX_RESULTS, RENEWAL_WINDOW_SQL };
