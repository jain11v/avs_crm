import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';
import { PAGES, ROLES } from '../pages';

const ROLE_OPTIONS = ['employee', 'manager', 'admin'];
const PAGE_SIZE = 50;

// Admin-only: turn an employee record into a login ("create user"), reset
// a password, change a role, and decide which pages each role can see.
export default function Admin() {
  const [employees, setEmployees] = useState([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [empError, setEmpError] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState('employee');
  const [editPassword, setEditPassword] = useState('');
  const [rowSaving, setRowSaving] = useState(false);
  const [rowError, setRowError] = useState('');

  const [matrix, setMatrix] = useState({ employee: [], manager: [] });
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [matrixSaving, setMatrixSaving] = useState(false);
  const [matrixError, setMatrixError] = useState('');
  const [matrixSaved, setMatrixSaved] = useState(false);

  const loadEmployees = useCallback(async () => {
    setEmpLoading(true);
    setEmpError('');
    try {
      const res = await api.get('/employees', { params: { limit: PAGE_SIZE } });
      setEmployees(res.data.data);
    } catch (err) {
      setEmpError(err.response?.data?.error || 'Could not load employees.');
    } finally {
      setEmpLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    api
      .get('/role-permissions')
      .then((res) => setMatrix(res.data.matrix))
      .catch((err) => setMatrixError(err.response?.data?.error || 'Could not load permissions.'))
      .finally(() => setMatrixLoading(false));
  }, []);

  function startEdit(emp) {
    setEditingId(emp.id);
    setEditRole(emp.role);
    setEditPassword('');
    setRowError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError('');
  }

  async function saveEdit(emp) {
    setRowError('');
    if (editPassword && editPassword.length < 6) {
      setRowError('Password must be at least 6 characters.');
      return;
    }
    const body = {};
    if (editRole !== emp.role) body.role = editRole;
    if (editPassword) body.password = editPassword;
    if (Object.keys(body).length === 0) {
      setEditingId(null);
      return;
    }

    setRowSaving(true);
    try {
      await api.patch(`/employees/${emp.id}/credentials`, body);
      setEditingId(null);
      loadEmployees();
    } catch (err) {
      setRowError(err.response?.data?.error || 'Could not save.');
    } finally {
      setRowSaving(false);
    }
  }

  function togglePermission(role, pageKey) {
    setMatrixSaved(false);
    setMatrix((m) => {
      const current = m[role] || [];
      const next = current.includes(pageKey)
        ? current.filter((k) => k !== pageKey)
        : [...current, pageKey];
      return { ...m, [role]: next };
    });
  }

  async function saveMatrix() {
    setMatrixError('');
    setMatrixSaving(true);
    try {
      await api.put('/role-permissions', matrix);
      setMatrixSaved(true);
    } catch (err) {
      setMatrixError(err.response?.data?.error || 'Could not save permissions.');
    } finally {
      setMatrixSaving(false);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Admin</h2>
          <p className="subtitle">Manage user logins, roles, and which pages each role can access.</p>
        </div>
      </div>

      <h3>Users</h3>
      <p className="subtitle">
        Every employee is a potential login — an employee can't sign in until an admin sets a password for them here.
      </p>

      {empError && <div className="form-error">{empError}</div>}

      {empLoading ? (
        <p className="subtitle">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Login</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td>{emp.first_name} {emp.last_name}</td>
                <td>{emp.email}</td>
                <td style={{ textTransform: 'capitalize' }}>
                  {editingId === emp.id ? (
                    <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  ) : (
                    emp.role
                  )}
                </td>
                <td>
                  <span className={`status-pill ${emp.has_login ? 'active' : 'inactive'}`}>
                    {emp.has_login ? 'Enabled' : 'No login'}
                  </span>
                </td>
                <td>
                  {editingId === emp.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="password"
                        className="table-input"
                        placeholder={emp.has_login ? 'New password (optional)' : 'Set password'}
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        style={{ minWidth: 180 }}
                      />
                      <button className="btn-link" onClick={() => saveEdit(emp)} disabled={rowSaving}>
                        {rowSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn-link" onClick={cancelEdit}>Cancel</button>
                    </div>
                  ) : (
                    <button className="btn-link" onClick={() => startEdit(emp)}>
                      {emp.has_login ? 'Reset password / role' : 'Create login'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editingId !== null && rowError && <div className="form-error" style={{ marginTop: '0.75rem' }}>{rowError}</div>}

      <h3 style={{ marginTop: '2.5rem' }}>Page access by role</h3>
      <p className="subtitle">
        Admin always has every page — only employee and manager can be restricted here.
      </p>

      {matrixError && <div className="form-error">{matrixError}</div>}

      {matrixLoading ? (
        <p className="subtitle">Loading…</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Page</th>
                {ROLES.map((role) => (
                  <th key={role} style={{ textTransform: 'capitalize' }}>{role}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PAGES.map((p) => (
                <tr key={p.key}>
                  <td>{p.label}</td>
                  {ROLES.map((role) => (
                    <td key={role}>
                      <input
                        type="checkbox"
                        checked={(matrix[role] || []).includes(p.key)}
                        onChange={() => togglePermission(role, p.key)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: '1rem' }}>
            <button className="btn-primary btn-inline" onClick={saveMatrix} disabled={matrixSaving}>
              {matrixSaving ? 'Saving…' : 'Save permissions'}
            </button>
            {matrixSaved && <span className="subtitle" style={{ margin: 0, alignSelf: 'center' }}>Saved.</span>}
          </div>
        </>
      )}
    </Layout>
  );
}
