import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;
const STATUSES = ['Active', 'Expired', 'Cancelled', 'Lapsed'];

export default function Policies() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async (q, st, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/policies', { params: { q, status: st, page: p, limit: PAGE_SIZE } });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load policies.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(search, status, page);
  }, [page, status, load]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    load(search, status, 1);
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  function formatMoney(n) {
    if (n === null || n === undefined) return '—';
    return `₹${Number(n).toLocaleString('en-IN')}`;
  }

  function isExpiringSoon(endDate) {
    const days = (new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 30;
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Policies</h2>
          <p className="subtitle">{total} total</p>
        </div>
        <Link to="/policies/new" className="btn-primary btn-inline">
          + Add policy
        </Link>
      </div>

      <div className="filter-bar">
        <form className="search-bar" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search by policy number or customer name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn-secondary">Search</button>
        </form>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="status-filter"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No policies found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Policy ID</th>
                <th>Policy #</th>
                <th>Customer</th>
                <th>Insurer</th>
                <th>Vertical</th>
                <th>Premium</th>
                <th>Expires</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>
                    <button className="row-link" onClick={() => navigate(`/policies/${p.id}/edit`)}>
                      {p.policy_number}
                    </button>
                  </td>
                  <td>{p.customer_name || '—'}</td>
                  <td>{p.insurer_name || '—'}</td>
                  <td>{p.vertical_name || '—'}</td>
                  <td>{formatMoney(p.premium_amount)}</td>
                  <td className={isExpiringSoon(p.policy_end_date) && p.status === 'Active' ? 'expiring-soon' : ''}>
                    {new Date(p.policy_end_date).toLocaleDateString('en-IN')}
                  </td>
                  <td>
                    <span className={`status-pill status-${p.status?.toLowerCase()}`}>{p.status}</span>
                  </td>
                  <td>
                    <button className="btn-link" onClick={() => navigate(`/policies/${p.id}/finance`)}>
                      Finance
                    </button>
                  </td>
                </tr>
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
