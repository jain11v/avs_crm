import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;

export default function Verticals() {
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
      const res = await api.get('/verticals', { params: { q, page: p, limit: PAGE_SIZE } });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load verticals.');
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

  async function handleDeactivate(vertical) {
    const nextActive = !vertical.is_active;
    const verb = nextActive ? 'Reactivate' : 'Deactivate';
    if (!window.confirm(`${verb} ${vertical.name}?`)) return;

    try {
      await api.patch(`/verticals/${vertical.id}/status`, { is_active: nextActive });
      load(search, page);
    } catch (err) {
      alert(err.response?.data?.error || `Could not ${verb.toLowerCase()} vertical.`);
    }
  }

  async function handleDelete(vertical) {
    if (!window.confirm(`Delete ${vertical.name}? This also removes its sub-verticals and cannot be undone.`)) return;

    try {
      await api.delete(`/verticals/${vertical.id}`);
      load(search, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete vertical.');
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Verticals</h2>
          <p className="subtitle">{total} total</p>
        </div>
        <Link to="/verticals/new" className="btn-primary btn-inline">
          + Add vertical
        </Link>
      </div>

      <form className="search-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No verticals found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Vertical head</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td>
                    <button className="row-link" onClick={() => navigate(`/verticals/${v.id}/edit`)}>
                      {v.name}
                    </button>
                  </td>
                  <td>{v.head_first_name ? `${v.head_first_name} ${v.head_last_name}` : '—'}</td>
                  <td>
                    <span className={`status-pill ${v.is_active ? 'active' : 'inactive'}`}>
                      {v.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <Link className="btn-link" to={`/sub-verticals?vertical_id=${v.id}`}>
                      Sub-verticals
                    </Link>
                    {' · '}
                    <button className="btn-link" onClick={() => handleDeactivate(v)}>
                      {v.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    {' · '}
                    <button className="btn-link" onClick={() => handleDelete(v)}>
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
