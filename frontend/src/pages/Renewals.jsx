import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

const DAYS_OPTIONS = [7, 30, 60, 90];

function formatMoney(n) {
  if (n === null || n === undefined) return '—';
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN');
}

function daysUntil(dateStr) {
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  return Math.round(diff);
}

// Status values are plain English (e.g. "Not Renewed") but CSS classes
// can't contain spaces — slugify before building the status-pill class.
function statusSlug(status) {
  return status?.toLowerCase().replace(/\s+/g, '-') ?? '';
}

// Policies due for renewal — renewable, status 'Active' or 'Not Renewed'
// (being marked lost must NOT make a policy disappear from here — the
// business still wants to see and possibly re-chase it), due within the
// chosen window (including overdue ones), and not already renewed.
// Renewing one takes you to a pre-filled "Add policy" form (customer,
// insurer, coverage, and commission carried over) rather than a separate
// flow. The only thing that removes a due policy from this list is
// actually renewing it (which flips it to 'Renewed').
export default function Renewals() {
  const navigate = useNavigate();
  // Non-admins get a fixed window (ending in the next 10 days or ended in
  // the last 2) set by the backend — the days picker is admin-only.
  const isAdmin = useAuth().employee?.role === 'admin';
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (d) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/policies/renewals-due', { params: { days: d } });
      setRows(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load renewals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  async function handleMarkLost(p) {
    if (!window.confirm(`Mark ${p.policy_number} as not renewed? It'll stay on this list, marked "Not Renewed".`)) return;
    setError('');
    try {
      await api.patch(`/policies/${p.id}/lost`);
      load(days);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not mark this policy lost.');
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Renewals</h2>
          <p className="subtitle">
            {rows.length} total — {isAdmin ? 'policies due for renewal' : 'policies ending in the next 10 days or ended in the last 2 days'}, most urgent first
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="filter-bar">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="status-filter">
            {DAYS_OPTIONS.map((d) => (
              <option key={d} value={d}>Due within {d} days</option>
            ))}
          </select>
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">Nothing due for renewal in this window.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Policy #</th>
              <th>Customer</th>
              <th>Insurer</th>
              <th>Premium</th>
              <th>Expires</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const d = daysUntil(p.policy_end_date);
              return (
                <tr key={p.id}>
                  <td>{p.policy_number}</td>
                  <td>{p.customer_name || '—'}</td>
                  <td>{p.insurer_name || '—'}</td>
                  <td>{formatMoney(p.premium_amount)}</td>
                  <td className={d <= 0 ? 'expiring-soon' : d <= 30 ? 'expiring-soon' : ''}>
                    {formatDate(p.policy_end_date)} {d <= 0 ? `(overdue ${Math.abs(d)}d)` : `(${d}d)`}
                  </td>
                  <td>
                    <span className={`status-pill status-${statusSlug(p.status)}`}>{p.status}</span>
                  </td>
                  <td>
                    <button className="btn-link" onClick={() => navigate(`/policies/new?renew_from=${p.id}`)}>
                      Renew
                    </button>
                    {' · '}
                    <button className="btn-link" onClick={() => handleMarkLost(p)}>
                      Not renewed
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
