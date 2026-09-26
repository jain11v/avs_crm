import { Fragment, useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;

// Balance < 0 means the insurer owes us — in practice a faulty duplicate
// premium payment (recorded as a Debit bank entry linked to the insurer)
// that hasn't been reversed yet. See insurerBalanceController.js.
function balanceStatus(balance) {
  const b = Number(balance);
  if (b < 0) return 'Insurer owes us — awaiting reversal';
  if (b > 0) return 'We owe the insurer';
  return 'Settled';
}

export default function InsurerBalances() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async (q, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/insurer-balances', { params: { search: q || undefined, page: p, limit: PAGE_SIZE } });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load balances.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(search, page);
  }, [page, load]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    load(search, 1);
  }

  function formatMoney(n) {
    if (n === null || n === undefined) return '—';
    return `₹${Number(n).toLocaleString('en-IN')}`;
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN');
  }

  async function toggleExpand(insurerId) {
    if (expandedId === insurerId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(insurerId);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await api.get(`/insurer-balances/${insurerId}`);
      setDetail(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load insurer detail.');
    } finally {
      setDetailLoading(false);
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Insurer balances</h2>
          <p className="subtitle">{total} total — running balance from bank entries linked to an insurer (faulty duplicate payments and their reversals)</p>
        </div>
      </div>

      <form className="filter-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          placeholder="Search by insurer name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No insurers with a bank entry balance found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Insurer</th>
                <th>Balance</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.insurer_id}>
                  <tr>
                    <td>{r.insurer_name}</td>
                    <td style={{ fontWeight: 600, color: Number(r.balance) > 0 ? '#15803d' : Number(r.balance) < 0 ? '#b45309' : undefined }}>
                      {formatMoney(r.balance)}
                    </td>
                    <td>{balanceStatus(r.balance)}</td>
                    <td>
                      <button className="btn-link" onClick={() => toggleExpand(r.insurer_id)}>
                        {expandedId === r.insurer_id ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === r.insurer_id && (
                    <tr>
                      <td colSpan={4}>
                        {detailLoading ? (
                          <p className="subtitle">Loading details…</p>
                        ) : detail ? (
                          <div style={{ padding: '0.75rem 0' }}>
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Type</th>
                                  <th>Amount</th>
                                  <th>Account</th>
                                  <th>Head</th>
                                  <th>Remarks</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.entries.map((e) => (
                                  <tr key={e.id}>
                                    <td>{formatDate(e.entry_date)}</td>
                                    <td>{e.type_of_transaction}</td>
                                    <td>{formatMoney(e.amount)}</td>
                                    <td>{e.bank_account_name || '—'}</td>
                                    <td>{e.head_name || '—'}</td>
                                    <td>{e.remarks || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>

          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary">
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-secondary">
              Next
            </button>
          </div>
        </>
      )}
    </Layout>
  );
}
