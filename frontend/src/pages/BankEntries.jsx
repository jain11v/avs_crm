import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';
import RecordBankEntryModal from '../components/RecordBankEntryModal';

const PAGE_SIZE = 20;

export default function BankEntries() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);

  const load = useCallback(async (t, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/bank-entries', { params: { type: t || undefined, page: p, limit: PAGE_SIZE } });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load bank entries.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(type, page);
  }, [page, type, load]);

  function formatMoney(n) {
    if (n === null || n === undefined) return '—';
    return `₹${Number(n).toLocaleString('en-IN')}`;
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN');
  }

  function linkedPerson(r) {
    if (r.employee_first_name) return `${r.employee_first_name} ${r.employee_last_name} (employee)`;
    if (r.customer_name) return `${r.customer_name} (customer)`;
    return '—';
  }

  async function handleRecord(values) {
    await api.post('/bank-entries', values);
    setRecordOpen(false);
    load(type, page);
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Bank entries</h2>
          <p className="subtitle">{total} total — manual Credit/Debit entries not tied to a policy, expense, or payment</p>
        </div>
        <button type="button" className="btn-primary btn-inline" onClick={() => setRecordOpen(true)}>
          + Record bank entry
        </button>
      </div>

      <div className="filter-bar">
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="status-filter">
          <option value="">All types</option>
          <option value="Debit">Debit</option>
          <option value="Credit">Credit</option>
        </select>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No bank entries found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Account</th>
                <th>Head</th>
                <th>Linked to</th>
                <th>Remarks</th>
                <th>Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.entry_date)}</td>
                  <td>
                    <span className={`status-pill ${r.type_of_transaction === 'Credit' ? 'active' : 'inactive'}`}>
                      {r.type_of_transaction}
                    </span>
                  </td>
                  <td>{formatMoney(r.amount)}</td>
                  <td>{r.bank_account_name || '—'}</td>
                  <td>{r.head_name || '—'}</td>
                  <td>{linkedPerson(r)}</td>
                  <td>{r.remarks || '—'}</td>
                  <td>{r.created_by_first_name ? `${r.created_by_first_name} ${r.created_by_last_name}` : '—'}</td>
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

      <RecordBankEntryModal open={recordOpen} onClose={() => setRecordOpen(false)} onSave={handleRecord} />
    </Layout>
  );
}
