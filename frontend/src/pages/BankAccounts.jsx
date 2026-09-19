import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;

export default function BankAccounts() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async (q, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/bank-accounts', { params: { q, page: p, limit: PAGE_SIZE } });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load bank accounts.');
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

  async function handleDelete(account) {
    if (!window.confirm(`Delete ${account.name || 'this account'}? This cannot be undone.`)) return;

    try {
      await api.delete(`/bank-accounts/${account.id}`);
      load(search, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete bank account.');
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Bank accounts</h2>
          <p className="subtitle">{total} total</p>
        </div>
        <Link to="/bank-accounts/new" className="btn-primary btn-inline">
          + Add bank account
        </Link>
      </div>

      <form className="search-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          placeholder="Search by name or account number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No bank accounts found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Bank</th>
                <th>Account number</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <button className="row-link" onClick={() => navigate(`/bank-accounts/${a.id}/edit`)}>
                      {a.name || '—'}
                    </button>
                  </td>
                  <td>{a.bank_name || '—'}</td>
                  <td>{a.ac_no || '—'}</td>
                  <td>{a.type || '—'}</td>
                  <td>
                    <Link className="btn-link" to={`/transactions?bank_id=${a.id}`}>
                      Ledger
                    </Link>
                    {' · '}
                    <button className="btn-link" onClick={() => handleDelete(a)}>
                      Delete
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
