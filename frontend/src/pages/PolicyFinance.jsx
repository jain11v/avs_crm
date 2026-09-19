import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import PolicyEntryModal from '../components/PolicyEntryModal';

function formatMoney(n) {
  if (n === null || n === undefined) return '—';
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN');
}

// One page for everything money-related on a single policy: what the
// customer has paid, what's been paid out to the insurer, any discount/
// cashback given, and the resulting balances — with one form to add any of
// those right here. Basic accounting: premium == amount owed to the
// insurer == (amount paid by the customer + discount/cashback + whatever
// balance remains).
export default function PolicyFinance() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { employee } = useAuth();
  const canDecide = employee?.role === 'admin' || employee?.role === 'manager';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Carried over from the policy-creation form when the policy saved but
  // recording its payment failed — kept separate from `error` so the page's
  // own load() (which resets `error`) doesn't wipe it out.
  const [carriedError, setCarriedError] = useState(location.state?.error || '');

  useEffect(() => {
    if (location.state?.error) {
      // Clear it from history so a refresh/back doesn't keep re-showing it.
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [entryModalOpen, setEntryModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/policies/${id}/finance`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load policy finance.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(row) {
    if (!window.confirm(`Approve this ${row.type} of ${formatMoney(row.amount)}?`)) return;
    try {
      await api.patch(`/policy-adjustments/${row.id}/decision`, { decision: 'approved' });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not approve.');
    }
  }

  async function handleReject(row) {
    const reason = window.prompt('Reason for rejecting this (optional):', '');
    if (reason === null) return;
    try {
      await api.patch(`/policy-adjustments/${row.id}/decision`, { decision: 'rejected', approver_remarks: reason });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not reject.');
    }
  }

  async function handleDelete(row) {
    if (!window.confirm('Delete this adjustment? This cannot be undone.')) return;
    try {
      await api.delete(`/policy-adjustments/${row.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete.');
    }
  }

  if (loading) {
    return (
      <Layout>
        <p className="subtitle">Loading…</p>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="form-error">{error || 'Policy not found.'}</div>
      </Layout>
    );
  }

  const { policy, customer_payments, insurer_payments, adjustments, totals } = data;

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>{policy.policy_number}</h2>
          <p className="subtitle">
            {policy.customer_name || '—'} · {policy.insurer_name || '—'} · Premium {formatMoney(totals.premium_amount)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link to={`/policies/${policy.id}/edit`} className="btn-secondary">
            Edit policy
          </Link>
          <button className="btn-primary btn-inline" onClick={() => setEntryModalOpen(true)}>
            + Record payment / discount
          </button>
        </div>
      </div>

      {carriedError && <div className="form-error">{carriedError}</div>}

      <div className="summary-cards">
        <div className="summary-card">
          <span className="summary-label">Paid by customer</span>
          <span className="summary-value">{formatMoney(totals.total_paid_by_customer)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Discount approved</span>
          <span className="summary-value">{formatMoney(totals.total_discount)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Customer balance</span>
          <span className="summary-value" style={{ color: Number(totals.customer_balance) > 0 ? '#b45309' : '#15803d' }}>
            {formatMoney(totals.customer_balance)}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Paid to insurer</span>
          <span className="summary-value">{formatMoney(totals.total_paid_to_insurer)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Insurer balance</span>
          <span className="summary-value" style={{ color: Number(totals.insurer_balance) > 0 ? '#b45309' : '#15803d' }}>
            {formatMoney(totals.insurer_balance)}
          </span>
        </div>
      </div>

      <h3 style={{ marginTop: '2rem', marginBottom: '0.75rem' }}>Customer payments</h3>
      {customer_payments.length === 0 ? (
        <p className="subtitle">No payments recorded yet.</p>
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
            {customer_payments.map((p) => (
              <tr key={p.allocation_id}>
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

      <h3 style={{ marginTop: '2rem', marginBottom: '0.75rem' }}>Insurer payments</h3>
      {insurer_payments.length === 0 ? (
        <p className="subtitle">No payments recorded yet.</p>
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
            {insurer_payments.map((p) => (
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

      <h3 style={{ marginTop: '2rem', marginBottom: '0.75rem' }}>Discounts &amp; cashbacks</h3>
      {adjustments.length === 0 ? (
        <p className="subtitle">None recorded yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Amount</th>
              <th>Created by</th>
              <th>Status</th>
              <th>Approver note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {adjustments.map((a) => {
              const isOwn = employee?.id === a.created_by;
              return (
                <tr key={a.id}>
                  <td style={{ textTransform: 'capitalize' }}>{a.type}</td>
                  <td>{formatMoney(a.amount)}</td>
                  <td>
                    {a.created_by_first_name ? `${a.created_by_first_name} ${a.created_by_last_name}` : '—'}
                  </td>
                  <td>
                    <span className={`status-pill status-${a.status}`}>{a.status}</span>
                  </td>
                  <td>{a.approver_remarks || '—'}</td>
                  <td>
                    {a.status === 'pending' && canDecide && !isOwn && (
                      <>
                        <button className="btn-link" onClick={() => handleApprove(a)}>Approve</button>
                        {' · '}
                        <button className="btn-link" onClick={() => handleReject(a)}>Reject</button>
                        {' · '}
                      </>
                    )}
                    {a.status !== 'approved' && (
                      <button className="btn-link" onClick={() => handleDelete(a)}>Delete</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <PolicyEntryModal
        open={entryModalOpen}
        policyId={policy.id}
        customerId={policy.customer_id}
        premiumAmount={totals.premium_amount}
        onClose={() => setEntryModalOpen(false)}
        onSaved={() => { setEntryModalOpen(false); load(); }}
      />
    </Layout>
  );
}
