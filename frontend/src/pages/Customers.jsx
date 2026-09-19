import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;

export default function Customers() {
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
      const res = await api.get('/customers', { params: { q, page: p, limit: PAGE_SIZE } });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load customers.');
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

  async function handleDeactivate(customer) {
    const nextActive = !customer.is_active;
    const verb = nextActive ? 'reactivate' : 'deactivate';
    if (!window.confirm(`${verb === 'reactivate' ? 'Reactivate' : 'Deactivate'} ${customer.name}?`)) return;

    try {
      await api.patch(`/customers/${customer.id}/status`, { is_active: nextActive });
      load(search, page);
    } catch (err) {
      alert(err.response?.data?.error || `Could not ${verb} customer.`);
    }
  }

  async function handleDelete(customer) {
    if (!window.confirm(`Delete ${customer.name}? This cannot be undone.`)) return;

    try {
      await api.delete(`/customers/${customer.id}`);
      load(search, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete customer.');
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Customers</h2>
          <p className="subtitle">{total} total</p>
        </div>
        <Link to="/customers/new" className="btn-primary btn-inline">
          + Add customer
        </Link>
      </div>

      <form className="search-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          placeholder="Search by name, email, or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No customers found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>City / State</th>
                <th>Type</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button className="row-link" onClick={() => navigate(`/customers/${c.id}/edit`)}>
                      {c.title ? `${c.title} ` : ''}{c.name}
                    </button>
                  </td>
                  <td>{c.email}</td>
                  <td>{c.phone || '—'}</td>
                  <td>{c.city_name ? `${c.city_name}, ${c.state_name}` : '—'}</td>
                  <td>{c.type_of_customer || '—'}</td>
                  <td>
                    <span className={`status-pill ${c.is_active ? 'active' : 'inactive'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="btn-link" onClick={() => handleDeactivate(c)}>
                      {c.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    {' · '}
                    <button className="btn-link" onClick={() => handleDelete(c)}>
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
