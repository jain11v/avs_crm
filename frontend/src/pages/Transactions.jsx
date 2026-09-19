import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;
const STATUSES = ['pending', 'approved', 'rejected'];

// Read-only ledger view. Transactions are never created or edited here —
// every row is posted automatically the moment its expense is submitted
// (status 'pending'), then updated in place when a senior approves or
// rejects it (see expenseController). Only 'approved' rows count toward
// the account balance.
export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const bankId = searchParams.get('bank_id') || '';

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [balance, setBalance] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/lookups/bank-accounts').then((res) => setBankAccounts(res.data));
  }, []);

  const load = useCallback(async (q, bank, st, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/transactions', {
        params: { q, bank_id: bank || undefined, status: st || undefined, page: p, limit: PAGE_SIZE },
      });
      setRows(res.data.data);
      setTotal(res.data.total);
      setBalance(res.data.balance);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load transactions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(search, bankId, status, page);
  }, [page, bankId, status, load]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    load(search, bankId, status, 1);
  }

  function handleBankFilterChange(e) {
    const value = e.target.value;
    setPage(1);
    if (value) {
      setSearchParams({ bank_id: value });
    } else {
      setSearchParams({});
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

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Transactions</h2>
          <p className="subtitle">
            {total} total{balance !== null ? ` · Balance: ${formatMoney(balance)}` : ''}
          </p>
        </div>
      </div>

      <p className="subtitle">
        Every expense is posted here as soon as it's submitted — pending entries don't count toward the balance
        until a senior approves them.
      </p>

      <div className="filter-bar">
        <form className="search-bar" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search by remarks or reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn-secondary">Search</button>
        </form>

        <select value={bankId} onChange={handleBankFilterChange} className="status-filter">
          <option value="">All accounts</option>
          {bankAccounts.map((b) => (
            <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
          ))}
        </select>

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
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No transactions found.</p>
      ) : (
        <>
          <div className="modal-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th>Employee</th>
                  <th>Remarks</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.date_of_transaction)}</td>
                    <td>{t.bank_account_name || '—'}</td>
                    <td>
                      <span className={`status-pill ${t.type_of_transaction === 'Credit' ? 'active' : 'inactive'}`}>
                        {t.type_of_transaction}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill status-${t.status}`}>{t.status}</span>
                    </td>
                    <td>{formatMoney(t.amount)}</td>
                    <td>{t.head_name || '—'}</td>
                    <td>{t.user_first_name ? `${t.user_first_name} ${t.user_last_name}` : '—'}</td>
                    <td>{t.remarks || '—'}</td>
                    <td>{formatMoney(t.running_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
