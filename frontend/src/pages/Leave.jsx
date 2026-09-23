import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';
import ApplyLeaveModal from '../components/ApplyLeaveModal';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 20;
const STATUSES = ['pending', 'approved', 'rejected'];

export default function Leave() {
  const { employee } = useAuth();
  const isManagerRole = employee?.role === 'admin' || employee?.role === 'manager';

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applyOpen, setApplyOpen] = useState(false);

  const load = useCallback(async (st, mine, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/leave', {
        params: { status: st || undefined, employee_id: mine ? employee?.id : undefined, page: p, limit: PAGE_SIZE },
      });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load leave requests.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee]);

  const loadBalance = useCallback(() => {
    api.get('/leave/balance').then((res) => setBalance(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load(status, mineOnly, page);
  }, [page, status, mineOnly, load]);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN');
  }

  async function handleApply(values) {
    await api.post('/leave', values);
    setApplyOpen(false);
    load(status, mineOnly, page);
    loadBalance();
  }

  async function handleApprove(row) {
    if (!window.confirm(`Approve ${row.employee_first_name} ${row.employee_last_name}'s ${row.leave_type} leave (${formatDate(row.start_date)} – ${formatDate(row.end_date)})?`)) return;
    try {
      await api.patch(`/leave/${row.id}/decision`, { decision: 'approved' });
      load(status, mineOnly, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not approve this leave request.');
    }
  }

  async function handleReject(row) {
    const reason = window.prompt('Reason for rejecting this leave request (optional):', '');
    if (reason === null) return;
    try {
      await api.patch(`/leave/${row.id}/decision`, { decision: 'rejected', approver_remarks: reason });
      load(status, mineOnly, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not reject this leave request.');
    }
  }

  async function handleCancel(row) {
    if (!window.confirm('Cancel this leave request?')) return;
    try {
      await api.delete(`/leave/${row.id}`);
      load(status, mineOnly, page);
      loadBalance();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not cancel this leave request.');
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Leave</h2>
          <p className="subtitle">{total} total</p>
        </div>
        <button type="button" className="btn-primary btn-inline" onClick={() => setApplyOpen(true)}>
          + Apply for leave
        </button>
      </div>

      {balance && (
        <p className="subtitle">
          You've used {balance.used} of {balance.entitlement} paid leave day{balance.entitlement === 1 ? '' : 's'} this year
          ({balance.remaining} remaining).
        </p>
      )}

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

        {isManagerRole && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => { setMineOnly(e.target.checked); setPage(1); }}
            />
            {' '}Show only my requests
          </label>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No leave requests found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Approver note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOwn = employee?.id === r.employee_id;
                const canDecide = employee?.role === 'admin' || String(r.reporting_to) === String(employee?.id);
                return (
                  <tr key={r.id}>
                    <td>{r.employee_first_name} {r.employee_last_name}</td>
                    <td style={{ textTransform: 'capitalize' }}>{r.leave_type}</td>
                    <td>{formatDate(r.start_date)}</td>
                    <td>{formatDate(r.end_date)}</td>
                    <td>{r.reason || '—'}</td>
                    <td>
                      <span className={`status-pill status-${r.status}`}>{r.status}</span>
                    </td>
                    <td>{r.approver_remarks || '—'}</td>
                    <td>
                      {r.status === 'pending' && canDecide && !isOwn && (
                        <>
                          <button className="btn-link" onClick={() => handleApprove(r)}>Approve</button>
                          {' · '}
                          <button className="btn-link" onClick={() => handleReject(r)}>Reject</button>
                          {' · '}
                        </>
                      )}
                      {r.status === 'pending' && (isOwn || isManagerRole) && (
                        <button className="btn-link" onClick={() => handleCancel(r)}>Cancel</button>
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

      <ApplyLeaveModal open={applyOpen} onClose={() => setApplyOpen(false)} onSave={handleApply} />
    </Layout>
  );
}
