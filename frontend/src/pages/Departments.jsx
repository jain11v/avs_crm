import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;

export default function Departments() {
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
      const res = await api.get('/departments', { params: { q, page: p, limit: PAGE_SIZE } });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load departments.');
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

  async function handleDeactivate(dept) {
    const nextActive = !dept.is_active;
    const verb = nextActive ? 'Reactivate' : 'Deactivate';
    if (!window.confirm(`${verb} ${dept.name}?`)) return;

    try {
      await api.patch(`/departments/${dept.id}/status`, { is_active: nextActive });
      load(search, page);
    } catch (err) {
      alert(err.response?.data?.error || `Could not ${verb.toLowerCase()} department.`);
    }
  }

  async function handleDelete(dept) {
    if (!window.confirm(`Delete ${dept.name}? This cannot be undone.`)) return;

    try {
      await api.delete(`/departments/${dept.id}`);
      load(search, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete department.');
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Departments</h2>
          <p className="subtitle">{total} total</p>
        </div>
        <Link to="/departments/new" className="btn-primary btn-inline">
          + Add department
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
        <p className="subtitle">No departments found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <button className="row-link" onClick={() => navigate(`/departments/${d.id}/edit`)}>
                      {d.name}
                    </button>
                  </td>
                  <td>{d.description || '—'}</td>
                  <td>
                    <span className={`status-pill ${d.is_active ? 'active' : 'inactive'}`}>
                      {d.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <Link className="btn-link" to={`/designations?department_id=${d.id}`}>
                      Designations
                    </Link>
                    {' · '}
                    <button className="btn-link" onClick={() => handleDeactivate(d)}>
                      {d.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    {' · '}
                    <button className="btn-link" onClick={() => handleDelete(d)}>
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
