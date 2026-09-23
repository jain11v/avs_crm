import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';
import { PAGES } from '../pages';

const PAGE_SIZE = 50;

// Admin-only: turn an employee record into a login ("create user"), reset
// a password, change a role, manage custom roles, and decide which pages
// each role can see.
export default function Admin() {
  const [employees, setEmployees] = useState([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [empError, setEmpError] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState('employee');
  const [editPassword, setEditPassword] = useState('');
  const [rowSaving, setRowSaving] = useState(false);
  const [rowError, setRowError] = useState('');

  // Full role list (includes admin) — used for the Users table's role
  // dropdown and the Roles section below. Separate from the
  // role-permissions matrix's role list, which deliberately excludes admin.
  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [roleError, setRoleError] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleElevated, setNewRoleElevated] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editRoleLabel, setEditRoleLabel] = useState('');
  const [editRoleElevated, setEditRoleElevated] = useState(false);

  const [matrixRoles, setMatrixRoles] = useState([]);
  const [matrix, setMatrix] = useState({});
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

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    setRoleError('');
    try {
      const res = await api.get('/roles');
      setRoles(res.data);
    } catch (err) {
      setRoleError(err.response?.data?.error || 'Could not load roles.');
    } finally {
      setRolesLoading(false);
    }
  }, []);

  const loadMatrix = useCallback(async () => {
    setMatrixLoading(true);
    setMatrixError('');
    try {
      const res = await api.get('/role-permissions');
      setMatrixRoles(res.data.roles);
      setMatrix(res.data.matrix);
    } catch (err) {
      setMatrixError(err.response?.data?.error || 'Could not load permissions.');
    } finally {
      setMatrixLoading(false);
    }
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { loadRoles(); }, [loadRoles]);
  useEffect(() => { loadMatrix(); }, [loadMatrix]);

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

  async function handleAddRole(e) {
    e.preventDefault();
    setRoleError('');
    if (!newRoleLabel.trim()) {
      setRoleError('Role name is required.');
      return;
    }
    setRoleSaving(true);
    try {
      await api.post('/roles', { label: newRoleLabel.trim(), is_elevated: newRoleElevated });
      setNewRoleLabel('');
      setNewRoleElevated(false);
      await Promise.all([loadRoles(), loadMatrix()]);
    } catch (err) {
      setRoleError(err.response?.data?.error || 'Could not create role.');
    } finally {
      setRoleSaving(false);
    }
  }

  function startEditRole(role) {
    setEditingRoleId(role.id);
    setEditRoleLabel(role.label);
    setEditRoleElevated(role.is_elevated);
    setRoleError('');
  }

  function cancelEditRole() {
    setEditingRoleId(null);
    setRoleError('');
  }

  async function saveEditRole(role) {
    setRoleError('');
    if (!editRoleLabel.trim()) {
      setRoleError('Role name is required.');
      return;
    }
    setRoleSaving(true);
    try {
      await api.put(`/roles/${role.id}`, { label: editRoleLabel.trim(), is_elevated: editRoleElevated });
      setEditingRoleId(null);
      await Promise.all([loadRoles(), loadMatrix()]);
    } catch (err) {
      setRoleError(err.response?.data?.error || 'Could not save role.');
    } finally {
      setRoleSaving(false);
    }
  }

  async function handleDeleteRole(role) {
    if (!window.confirm(`Delete the "${role.label}" role?`)) return;
    setRoleError('');
    try {
      await api.delete(`/roles/${role.id}`);
      await Promise.all([loadRoles(), loadMatrix()]);
    } catch (err) {
      setRoleError(err.response?.data?.error || 'Could not delete role.');
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
                      {roles.map((r) => (
                        <option key={r.key} value={r.key}>{r.label}</option>
                      ))}
                    </select>
                  ) : (
                    roles.find((r) => r.key === emp.role)?.label || emp.role
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

      <h3 style={{ marginTop: '2.5rem' }}>Roles</h3>
      <p className="subtitle">
        Employee, Manager, and Admin are built in and can't be renamed or removed. Add a custom role for anything else —
        "Elevated" grants the same team-oversight access Manager has (approvals, seeing others' records), separate from
        page access below. Elevation changes take effect for that role's holders the next time they log in, not immediately.
      </p>

      {roleError && <div className="form-error">{roleError}</div>}

      {rolesLoading ? (
        <p className="subtitle">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Elevated</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td>
                  {editingRoleId === r.id ? (
                    <input
                      className="table-input"
                      value={editRoleLabel}
                      onChange={(e) => setEditRoleLabel(e.target.value)}
                    />
                  ) : (
                    r.label
                  )}
                  {r.is_builtin && (
                    <span className="status-pill inactive" style={{ marginLeft: '0.5rem' }}>Built-in</span>
                  )}
                </td>
                <td>
                  {editingRoleId === r.id ? (
                    <input
                      type="checkbox"
                      checked={editRoleElevated}
                      onChange={(e) => setEditRoleElevated(e.target.checked)}
                    />
                  ) : (
                    <span className={`status-pill ${r.is_elevated ? 'active' : 'inactive'}`}>
                      {r.is_elevated ? 'Yes' : 'No'}
                    </span>
                  )}
                </td>
                <td colSpan={2}>
                  {r.is_builtin ? null : editingRoleId === r.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn-link" onClick={() => saveEditRole(r)} disabled={roleSaving}>
                        {roleSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn-link" onClick={cancelEditRole}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn-link" onClick={() => startEditRole(r)}>Edit</button>
                      <button className="btn-link" onClick={() => handleDeleteRole(r)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form
        onSubmit={handleAddRole}
        style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1rem' }}
      >
        <input
          placeholder="New role name, e.g. Accountant"
          value={newRoleLabel}
          onChange={(e) => setNewRoleLabel(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={newRoleElevated}
            onChange={(e) => setNewRoleElevated(e.target.checked)}
          />
          {' '}Elevated
        </label>
        <button type="submit" className="btn-secondary" disabled={roleSaving}>
          {roleSaving ? 'Adding…' : '+ Add role'}
        </button>
      </form>

      <h3 style={{ marginTop: '2.5rem' }}>Page access by role</h3>
      <p className="subtitle">
        Admin always has every page — only the roles below can be restricted here.
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
                {matrixRoles.map((role) => (
                  <th key={role.key}>{role.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PAGES.map((p) => (
                <tr key={p.key}>
                  <td>{p.label}</td>
                  {matrixRoles.map((role) => (
                    <td key={role.key}>
                      <input
                        type="checkbox"
                        checked={(matrix[role.key] || []).includes(p.key)}
                        onChange={() => togglePermission(role.key, p.key)}
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
