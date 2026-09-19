import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const PAGE_SIZE = 20;

export default function Employees() {
  const [searchParams, setSearchParams] = useSearchParams();
  const departmentId = searchParams.get('department_id') || '';

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/lookups/departments').then((res) => setDepartments(res.data));
  }, []);

  const load = useCallback(async (q, deptId, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/employees', {
        params: { q, department_id: deptId || undefined, page: p, limit: PAGE_SIZE },
      });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load employees.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(search, departmentId, page);
  }, [page, departmentId, load]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    load(search, departmentId, 1);
  }

  function handleDepartmentFilterChange(e) {
    const value = e.target.value;
    setPage(1);
    if (value) {
      setSearchParams({ department_id: value });
    } else {
      setSearchParams({});
    }
  }

  async function handleDeactivate(emp) {
    const nextActive = !emp.is_active;
    const verb = nextActive ? 'Reactivate' : 'Deactivate';
    if (!window.confirm(`${verb} ${emp.first_name} ${emp.last_name}?`)) return;

    try {
      await api.patch(`/employees/${emp.id}/status`, { is_active: nextActive });
      load(search, departmentId, page);
    } catch (err) {
      alert(err.response?.data?.error || `Could not ${verb.toLowerCase()} employee.`);
    }
  }

  async function handleDelete(emp) {
    if (!window.confirm(`Delete ${emp.first_name} ${emp.last_name}? This cannot be undone.`)) return;

    try {
      await api.delete(`/employees/${emp.id}`);
      load(search, departmentId, page);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete employee.');
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Employees</h2>
          <p className="subtitle">{total} total</p>
        </div>
        <Link to="/employees/new" className="btn-primary btn-inline">
          + Add employee
        </Link>
      </div>

      <div className="filter-bar">
        <form className="search-bar" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search by name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn-secondary">Search</button>
        </form>

        <select value={departmentId} onChange={handleDepartmentFilterChange} className="status-filter">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No employees found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>
                    <button className="row-link" onClick={() => navigate(`/employees/${e.id}/edit`)}>
                      {e.first_name} {e.last_name}
                    </button>
                  </td>
                  <td>{e.email}</td>
                  <td>{e.phone || '—'}</td>
                  <td>{e.department_name || '—'}</td>
                  <td>{e.designation_title || '—'}</td>
                  <td>{e.role}</td>
                  <td>
                    <span className={`status-pill ${e.is_active ? 'active' : 'inactive'}`}>
                      {e.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="btn-link" onClick={() => handleDeactivate(e)}>
                      {e.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    {' · '}
                    <button className="btn-link" onClick={() => handleDelete(e)}>
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
