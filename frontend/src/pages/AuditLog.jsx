import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 50;

const ENTITY_LABELS = {
  policy: 'Policy',
  commission: 'Commission',
  commission_receipt: 'Commission receipt',
  customer_payment: 'Customer payment',
  insurer_payment: 'Insurer payment',
  policy_adjustment: 'Discount / cashback',
};

const ACTION_LABELS = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  approved: 'Approved',
  rejected: 'Rejected',
};

const MONEY_FIELDS = new Set(['amount', 'premium_amount', 'sum_insured']);
const PERCENT_FIELDS = new Set(['brok_percent', 'tp_brok_percent', 'gst']);
const DATE_FIELDS = new Set(['payment_date', 'received_date', 'policy_start_date', 'policy_end_date']);

function formatValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (MONEY_FIELDS.has(field)) return `₹${Number(value).toLocaleString('en-IN')}`;
  if (PERCENT_FIELDS.has(field)) return `${value}%`;
  if (DATE_FIELDS.has(field)) return new Date(value).toLocaleDateString('en-IN');
  return String(value);
}

function fieldLabel(field) {
  return field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [employees, setEmployees] = useState([]);
  const [entityType, setEntityType] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    api.get('/lookups/employees').then((res) => setEmployees(res.data));
  }, []);

  const load = useCallback(async (p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/audit-log', {
        params: {
          entity_type: entityType || undefined,
          employee_id: employeeId || undefined,
          policy_id: policyId || undefined,
          from: from || undefined,
          to: to || undefined,
          page: p,
          limit: PAGE_SIZE,
        },
      });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the activity log.');
    } finally {
      setLoading(false);
    }
  }, [entityType, employeeId, policyId, from, to]);

  useEffect(() => {
    load(page);
  }, [page, load]);

  function handleFilterSubmit(e) {
    e.preventDefault();
    setPage(1);
    load(1);
  }

  function formatDateTime(d) {
    return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Activity log</h2>
          <p className="subtitle">{total} total — who changed what, and when, across policies, payments, and commission</p>
        </div>
      </div>

      <form className="filter-bar" onSubmit={handleFilterSubmit} style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(ENTITY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Policy ID…"
          value={policyId}
          onChange={(e) => setPolicyId(e.target.value)}
          style={{ maxWidth: '120px' }}
        />

        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From date" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To date" />

        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No activity matches these filters.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Entity</th>
                <th>Action</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td>{r.employee_first_name ? `${r.employee_first_name} ${r.employee_last_name || ''}`.trim() : '—'}</td>
                  <td>
                    {ENTITY_LABELS[r.entity_type] || r.entity_type} #{r.entity_id}
                    {r.policy_number && (
                      <div className="subtitle" style={{ margin: 0 }}>Policy {r.policy_number}</div>
                    )}
                  </td>
                  <td>{ACTION_LABELS[r.action] || r.action}</td>
                  <td>
                    {r.changes && Object.keys(r.changes).length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                        {Object.entries(r.changes).map(([field, { from: fromVal, to: toVal }]) => (
                          <li key={field}>
                            {fieldLabel(field)}: {formatValue(field, fromVal)} → {formatValue(field, toVal)}
                          </li>
                        ))}
                      </ul>
                    ) : '—'}
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
