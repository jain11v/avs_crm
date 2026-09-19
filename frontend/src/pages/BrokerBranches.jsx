import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;

export default function BrokerBranches() {
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
      const res = await api.get('/branches', { params: { q, page: p, limit: PAGE_SIZE } });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load branches.');
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

  async function handleDelete(branch) {
    if (!window.confirm(`Delete ${branch.name}? This cannot be undone.`)) return;

    try {
      await api.delete(`/branches/${branch.id}`);
      load(search, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete branch.');
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Broker branches</h2>
          <p className="subtitle">{total} total</p>
        </div>
        <Link to="/branches/new" className="btn-primary btn-inline">
          + Add branch
        </Link>
      </div>

      <form className="search-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          placeholder="Search by name, email, or branch code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No branches found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Branch code</th>
                <th>Email</th>
                <th>Phone</th>
                <th>City / State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <button className="row-link" onClick={() => navigate(`/branches/${b.id}/edit`)}>
                      {b.name}
                    </button>
                  </td>
                  <td>{b.branch_code || '—'}</td>
                  <td>{b.email}</td>
                  <td>{b.phone || '—'}</td>
                  <td>{b.city_name ? `${b.city_name}, ${b.state_name}` : '—'}</td>
                  <td>
                    <button className="btn-link" onClick={() => handleDelete(b)}>
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
