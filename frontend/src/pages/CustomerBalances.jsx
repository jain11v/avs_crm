import { Fragment, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;

export default function CustomerBalances() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [onlyOutstanding, setOnlyOutstanding] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async (q, outstanding, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/customer-balances', {
        params: { search: q || undefined, only_outstanding: outstanding, page: p, limit: PAGE_SIZE },
      });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load balances.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(search, onlyOutstanding, page);
  }, [page, onlyOutstanding, load]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    load(search, onlyOutstanding, 1);
  }

  async function handleExport() {
    setError('');
    try {
      const res = await api.get('/customer-balances/export.csv', {
        params: { search: search || undefined, only_outstanding: onlyOutstanding },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `customer-balances-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not export balances.');
    }
  }

  function formatMoney(n) {
    if (n === null || n === undefined) return '—';
    return `₹${Number(n).toLocaleString('en-IN')}`;
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN');
  }

  async function toggleExpand(customerId) {
    if (expandedId === customerId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(customerId);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await api.get(`/customer-balances/${customerId}`);
      setDetail(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load customer detail.');
    } finally {
      setDetailLoading(false);
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Customer balances</h2>
          <p className="subtitle">{total} total — what each customer still owes across their policies</p>
        </div>
      </div>

      <div className="filter-bar">
        <form className="search-bar" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search by customer name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn-secondary">Search</button>
        </form>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={onlyOutstanding}
            onChange={(e) => { setOnlyOutstanding(e.target.checked); setPage(1); }}
          />
          {' '}Only show outstanding balances
        </label>

        <button type="button" className="btn-secondary" onClick={handleExport}>
          Export CSV
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No customers found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Total premium</th>
                <th>Paid</th>
                <th>Discounts</th>
                <th>Balance</th>
                <th>Bank entry balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.customer_id}>
                  <tr>
                    <td>
                      {r.customer_name}
                      {r.policy_numbers && (
                        <div className="subtitle" style={{ margin: '0.15rem 0 0' }}>
                          {r.policy_numbers.map((num, i) => `${num} (ID ${r.policy_ids[i]})`).join(', ')}
                        </div>
                      )}
                    </td>
                    <td>{formatMoney(r.total_premium)}</td>
                    <td>{formatMoney(r.total_paid)}</td>
                    <td>{formatMoney(r.total_discount)}</td>
                    <td style={{ fontWeight: 600, color: Number(r.balance) > 0 ? '#b45309' : '#15803d' }}>
                      {formatMoney(r.balance)}
                    </td>
                    <td style={{ fontWeight: 600, color: Number(r.bank_entry_balance) > 0 ? '#15803d' : Number(r.bank_entry_balance) < 0 ? '#b45309' : undefined }}>
                      {Number(r.bank_entry_balance) === 0 ? '—' : formatMoney(r.bank_entry_balance)}
                    </td>
                    <td>
                      <button className="btn-link" onClick={() => toggleExpand(r.customer_id)}>
                        {expandedId === r.customer_id ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === r.customer_id && (
                    <tr>
                      <td colSpan={7}>
                        {detailLoading ? (
                          <p className="subtitle">Loading details…</p>
                        ) : detail ? (
                          <div style={{ padding: '0.75rem 0' }}>
                            <h4>Policies</h4>
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Policy ID</th>
                                  <th>Policy #</th>
                                  <th>Premium</th>
                                  <th>Paid</th>
                                  <th>Discount</th>
                                  <th>Balance</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.policies.map((p) => (
                                  <tr key={p.policy_id}>
                                    <td>{p.policy_id}</td>
                                    <td>{p.policy_number}</td>
                                    <td>{formatMoney(p.premium_amount)}</td>
                                    <td>{formatMoney(p.paid)}</td>
                                    <td>{formatMoney(p.discount)}</td>
                                    <td>{formatMoney(p.balance)}</td>
                                    <td>
                                      {Number(p.balance) > 0.01 && (
                                        <button className="btn-link" onClick={() => navigate(`/policies/${p.policy_id}/finance`)}>
                                          Record payment
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            <h4 style={{ marginTop: '1rem' }}>Payment history</h4>
                            {detail.payments.length === 0 ? (
                              <p className="subtitle">No payments recorded.</p>
                            ) : (
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th>Amount</th>
                                    <th>Account</th>
                                    <th>Reference</th>
                                    <th>Remarks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.payments.map((p) => (
                                    <tr key={p.id}>
                                      <td>{formatDate(p.payment_date)}</td>
                                      <td>{formatMoney(p.amount)}</td>
                                      <td>{p.bank_account_name || '—'}</td>
                                      <td>{p.reference_id || '—'}</td>
                                      <td>{p.remarks || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}

                            <h4 style={{ marginTop: '1rem' }}>Discounts &amp; cashbacks</h4>
                            {detail.adjustments.length === 0 ? (
                              <p className="subtitle">None recorded.</p>
                            ) : (
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>Policy #</th>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.adjustments.map((a) => (
                                    <tr key={a.id}>
                                      <td>{a.policy_number}</td>
                                      <td style={{ textTransform: 'capitalize' }}>{a.type}</td>
                                      <td>{formatMoney(a.amount)}</td>
                                      <td><span className={`status-pill status-${a.status}`}>{a.status}</span></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}

                            <h4 style={{ marginTop: '1rem' }}>
                              Bank entries {detail.bank_entry_balance !== undefined && `(net ${formatMoney(detail.bank_entry_balance)})`}
                            </h4>
                            {!detail.bank_entries || detail.bank_entries.length === 0 ? (
                              <p className="subtitle">None recorded.</p>
                            ) : (
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Head</th>
                                    <th>Remarks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.bank_entries.map((be) => (
                                    <tr key={be.id}>
                                      <td>{formatDate(be.entry_date)}</td>
                                      <td>{be.type_of_transaction}</td>
                                      <td>{formatMoney(be.amount)}</td>
                                      <td>{be.head_name || '—'}</td>
                                      <td>{be.remarks || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
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
