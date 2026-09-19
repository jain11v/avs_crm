import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;

export default function SubVerticals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const verticalId = searchParams.get('vertical_id') || '';

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [verticals, setVerticals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/lookups/verticals').then((res) => setVerticals(res.data));
  }, []);

  const load = useCallback(async (q, vertId, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/sub-verticals', {
        params: { q, vertical_id: vertId || undefined, page: p, limit: PAGE_SIZE },
      });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load sub-verticals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(search, verticalId, page);
  }, [page, verticalId, load]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    load(search, verticalId, 1);
  }

  function handleVerticalFilterChange(e) {
    const value = e.target.value;
    setPage(1);
    if (value) {
      setSearchParams({ vertical_id: value });
    } else {
      setSearchParams({});
    }
  }

  async function handleDeactivate(sv) {
    const nextActive = !sv.is_active;
    const verb = nextActive ? 'Reactivate' : 'Deactivate';
    if (!window.confirm(`${verb} ${sv.name}?`)) return;

    try {
      await api.patch(`/sub-verticals/${sv.id}/status`, { is_active: nextActive });
      load(search, verticalId, page);
    } catch (err) {
      alert(err.response?.data?.error || `Could not ${verb.toLowerCase()} sub-vertical.`);
    }
  }

  async function handleDelete(sv) {
    if (!window.confirm(`Delete ${sv.name}? This cannot be undone.`)) return;

    try {
      await api.delete(`/sub-verticals/${sv.id}`);
      load(search, verticalId, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete sub-vertical.');
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const addHref = verticalId ? `/sub-verticals/new?vertical_id=${verticalId}` : '/sub-verticals/new';

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Sub-verticals</h2>
          <p className="subtitle">{total} total</p>
        </div>
        <Link to={addHref} className="btn-primary btn-inline">
          + Add sub-vertical
        </Link>
      </div>

      <div className="filter-bar">
        <form className="search-bar" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn-secondary">Search</button>
        </form>

        <select value={verticalId} onChange={handleVerticalFilterChange} className="status-filter">
          <option value="">All verticals</option>
          {verticals.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No sub-verticals found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Vertical</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((sv) => (
                <tr key={sv.id}>
                  <td>
                    <button className="row-link" onClick={() => navigate(`/sub-verticals/${sv.id}/edit`)}>
                      {sv.name}
                    </button>
                  </td>
                  <td>{sv.vertical_name || '—'}</td>
                  <td>
                    <span className={`status-pill ${sv.is_active ? 'active' : 'inactive'}`}>
                      {sv.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="btn-link" onClick={() => handleDeactivate(sv)}>
                      {sv.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    {' · '}
                    <button className="btn-link" onClick={() => handleDelete(sv)}>
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
