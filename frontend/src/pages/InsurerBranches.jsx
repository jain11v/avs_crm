import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;

export default function InsurerBranches() {
  const [searchParams, setSearchParams] = useSearchParams();
  const insurerId = searchParams.get('insurer_id') || '';

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [insurers, setInsurers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/lookups/insurers').then((res) => setInsurers(res.data));
  }, []);

  const load = useCallback(async (q, insId, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/insurer-branches', {
        params: { q, insurer_id: insId || undefined, page: p, limit: PAGE_SIZE },
      });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load insurer branches.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(search, insurerId, page);
  }, [page, insurerId, load]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    load(search, insurerId, 1);
  }

  function handleInsurerFilterChange(e) {
    const value = e.target.value;
    setPage(1);
    if (value) {
      setSearchParams({ insurer_id: value });
    } else {
      setSearchParams({});
    }
  }

  async function handleDeactivate(branch) {
    const nextActive = !branch.is_active;
    const verb = nextActive ? 'Reactivate' : 'Deactivate';
    if (!window.confirm(`${verb} ${branch.name}?`)) return;

    try {
      await api.patch(`/insurer-branches/${branch.id}/status`, { is_active: nextActive });
      load(search, insurerId, page);
    } catch (err) {
      alert(err.response?.data?.error || `Could not ${verb.toLowerCase()} insurer branch.`);
    }
  }

  async function handleDelete(branch) {
    if (!window.confirm(`Delete ${branch.name}? This cannot be undone.`)) return;

    try {
      await api.delete(`/insurer-branches/${branch.id}`);
      load(search, insurerId, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete insurer branch.');
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const addHref = insurerId ? `/insurer-branches/new?insurer_id=${insurerId}` : '/insurer-branches/new';

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Insurer branches</h2>
          <p className="subtitle">{total} total</p>
        </div>
        <Link to={addHref} className="btn-primary btn-inline">
          + Add branch
        </Link>
      </div>

      <div className="filter-bar">
        <form className="search-bar" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search by branch name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn-secondary">Search</button>
        </form>

        <select value={insurerId} onChange={handleInsurerFilterChange} className="status-filter">
          <option value="">All insurers</option>
          {insurers.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No insurer branches found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Insurer</th>
                <th>Branch code</th>
                <th>Contact person</th>
                <th>City / State</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <button className="row-link" onClick={() => navigate(`/insurer-branches/${b.id}/edit`)}>
                      {b.name}
                    </button>
                  </td>
                  <td>{b.insurer_name || '—'}</td>
                  <td>{b.branch_code || '—'}</td>
                  <td>{b.contact_person || '—'}</td>
                  <td>{b.city_name ? `${b.city_name}, ${b.state_name}` : '—'}</td>
                  <td>
                    <span className={`status-pill ${b.is_active ? 'active' : 'inactive'}`}>
                      {b.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="btn-link" onClick={() => handleDeactivate(b)}>
                      {b.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    {' · '}
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
