import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;

export default function Insurers() {
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
      const res = await api.get('/insurers', { params: { q, page: p, limit: PAGE_SIZE } });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load insurers.');
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

  async function handleDeactivate(insurer) {
    const nextActive = !insurer.is_active;
    const verb = nextActive ? 'Reactivate' : 'Deactivate';
    if (!window.confirm(`${verb} ${insurer.name}?`)) return;

    try {
      await api.patch(`/insurers/${insurer.id}/status`, { is_active: nextActive });
      load(search, page);
    } catch (err) {
      alert(err.response?.data?.error || `Could not ${verb.toLowerCase()} insurer.`);
    }
  }

  async function handleDelete(insurer) {
    if (!window.confirm(`Delete ${insurer.name}? This cannot be undone.`)) return;

    try {
      await api.delete(`/insurers/${insurer.id}`);
      load(search, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete insurer.');
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Insurers</h2>
          <p className="subtitle">{total} total</p>
        </div>
        <Link to="/insurers/new" className="btn-primary btn-inline">
          + Add insurer
        </Link>
      </div>

      <form className="search-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          placeholder="Search by name or registration number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No insurers found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Registration number</th>
                <th>Website</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td>
                    <button className="row-link" onClick={() => navigate(`/insurers/${i.id}/edit`)}>
                      {i.name}
                    </button>
                  </td>
                  <td>{i.registration_number || '—'}</td>
                  <td>{i.website || '—'}</td>
                  <td>
                    <span className={`status-pill ${i.is_active ? 'active' : 'inactive'}`}>
                      {i.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <Link className="btn-link" to={`/insurer-branches?insurer_id=${i.id}`}>
                      Branches
                    </Link>
                    {' · '}
                    <button className="btn-link" onClick={() => handleDeactivate(i)}>
                      {i.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    {' · '}
                    <button className="btn-link" onClick={() => handleDelete(i)}>
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
