import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 20;
const STATUSES = ['pending', 'approved', 'rejected'];

export default function Expenses() {
  const { employee } = useAuth();
  const canDecide = employee?.role === 'admin' || employee?.is_elevated;

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async (st, mine, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/expenses', {
        params: { status: st || undefined, user_id: mine ? employee?.id : undefined, page: p, limit: PAGE_SIZE },
      });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load expenses.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee]);

  useEffect(() => {
    load(status, mineOnly, page);
  }, [page, status, mineOnly, load]);

  function formatMoney(n) {
    if (n === null || n === undefined) return '—';
    return `₹${Number(n).toLocaleString('en-IN')}`;
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN');
  }

  async function handleApprove(expense) {
    if (!window.confirm(`Approve this expense of ${formatMoney(expense.amount)} for ${expense.user_first_name} ${expense.user_last_name}?`)) return;

    try {
      await api.patch(`/expenses/${expense.id}/decision`, { decision: 'approved' });
      load(status, mineOnly, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not approve expense.');
    }
  }

  async function handleReject(expense) {
    const reason = window.prompt('Reason for rejecting this expense (optional):', '');
    if (reason === null) return; // cancelled

    try {
      await api.patch(`/expenses/${expense.id}/decision`, { decision: 'rejected', approver_remarks: reason });
      load(status, mineOnly, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not reject expense.');
    }
  }

  async function handleDelete(expense) {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;

    try {
      await api.delete(`/expenses/${expense.id}`);
      load(status, mineOnly, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete expense.');
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Expenses</h2>
          <p className="subtitle">{total} total</p>
        </div>
        <Link to="/expenses/new" className="btn-primary btn-inline">
          + Add expense
        </Link>
      </div>

      <div className="filter-bar">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="status-filter"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => { setMineOnly(e.target.checked); setPage(1); }}
          />
          {' '}Show only my expenses
        </label>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No expenses found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Description</th>
                <th>Category</th>
                <th>Account</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Status</th>
                <th>Approver note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const isOwn = employee?.id === e.user_id;
                return (
                  <tr key={e.id}>
                    <td>{e.user_first_name} {e.user_last_name}</td>
                    <td>
                      <button className="row-link" onClick={() => navigate(`/expenses/${e.id}/edit`)}>
                        {e.description}
                      </button>
                    </td>
                    <td>{e.head_name || '—'}</td>
                    <td>{e.bank_account_name || '—'}</td>
                    <td>{formatMoney(e.amount)}</td>
                    <td>{formatDate(e.expense_date)}</td>
                    <td>
                      <span className={`status-pill status-${e.status}`}>{e.status}</span>
                    </td>
                    <td>{e.approver_remarks || '—'}</td>
                    <td>
                      {e.status === 'pending' && canDecide && !isOwn && (
                        <>
                          <button className="btn-link" onClick={() => handleApprove(e)}>Approve</button>
                          {' · '}
                          <button className="btn-link" onClick={() => handleReject(e)}>Reject</button>
                          {' · '}
                        </>
                      )}
                      {e.status !== 'approved' && (isOwn || canDecide) && (
                        <button className="btn-link" onClick={() => handleDelete(e)}>Delete</button>
                      )}
                    </td>
                  </tr>
                );
              })}
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
