import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import DocumentsPanel from '../components/DocumentsPanel';
import TaskList from '../components/TaskList';
import AssignTaskModal from '../components/AssignTaskModal';
import TaskDocumentsModal from '../components/TaskDocumentsModal';
import { useAuth } from '../context/AuthContext';
import { uploadFiles } from '../utils/uploadFiles';
import { isAncestor } from '../utils/orgHierarchy';

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  gender: '',
  email: '',
  phone: '',
  address: '',
  state_id: '',
  city_id: '',
  salary: '',
  annual_leave_entitlement: '12',
  date_of_birth: '',
  date_of_joining: '',
  date_of_resign: '',
  aadhar: '',
  pan: '',
  business_expected: '',
  department_id: '',
  designation_id: '',
  reporting_to: '',
  reporting_branch: '',
};

export default function EmployeeForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { employee: currentEmployee } = useAuth();

  const [form, setForm] = useState(EMPTY_FORM);
  const [currentRole, setCurrentRole] = useState('');
  const [tasks, setTasks] = useState([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [docsTask, setDocsTask] = useState(null);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newFiles, setNewFiles] = useState([]);

  function handleNewFilesSelected(e) {
    setNewFiles(Array.from(e.target.files || []));
  }

  useEffect(() => {
    api.get('/lookups/states').then((res) => setStates(res.data));
    api.get('/lookups/departments').then((res) => setDepartments(res.data));
    api.get('/lookups/employees').then((res) => setEmployees(res.data));
    api.get('/lookups/branches').then((res) => setBranches(res.data));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/employees/${id}`)
      .then((res) => {
        const e = res.data;
        setForm({
          first_name: e.first_name || '',
          last_name: e.last_name || '',
          gender: e.gender || '',
          email: e.email || '',
          phone: e.phone || '',
          address: e.address || '',
          state_id: e.state_id || '',
          city_id: e.city_id || '',
          salary: e.salary || '',
          annual_leave_entitlement: e.annual_leave_entitlement ?? '12',
          date_of_birth: e.date_of_birth ? e.date_of_birth.slice(0, 10) : '',
          date_of_joining: e.date_of_joining ? e.date_of_joining.slice(0, 10) : '',
          date_of_resign: e.date_of_resign ? e.date_of_resign.slice(0, 10) : '',
          aadhar: e.aadhar || '',
          pan: e.pan || '',
          business_expected: e.business_expected || '',
          department_id: e.department_id || '',
          designation_id: e.designation_id || '',
          reporting_to: e.reporting_to || '',
          reporting_branch: e.reporting_branch || '',
        });
        setCurrentRole(e.role || 'employee');
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load employee.'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const loadTasks = useCallback(() => {
    if (!isEdit) return;
    api.get('/tasks', { params: { assigned_to: id } }).then((res) => setTasks(res.data)).catch(() => {});
  }, [id, isEdit]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function handleAssignTask(values) {
    try {
      const { files, ...body } = values;
      const res = await api.post('/tasks', body);
      if (files && files.length > 0) {
        await uploadFiles(files, 'task', res.data.id);
      }
      setAssignModalOpen(false);
      loadTasks();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not assign that task.');
    }
  }

  async function handleDeleteTask(task) {
    try {
      await api.delete(`/tasks/${task.id}`);
      loadTasks();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete that task.');
    }
  }

  // Mirrors the backend's own rule (admin, anyone above this employee in
  // the reporting chain, or this employee viewing their own record) — just
  // for showing/hiding the button; the API enforces it for real.
  const canAssignTask = currentEmployee && (
    currentEmployee.role === 'admin' ||
    (isEdit && String(currentEmployee.id) === String(id)) ||
    (isEdit && isAncestor(employees, currentEmployee.id, id))
  );

  // Cascade: state -> its cities
  useEffect(() => {
    if (!form.state_id) {
      setCities([]);
      return;
    }
    api.get('/lookups/cities', { params: { state_id: form.state_id } }).then((res) => {
      setCities(res.data);
    });
  }, [form.state_id]);

  // Cascade: department -> its designations
  useEffect(() => {
    api.get('/lookups/designations', { params: { department_id: form.department_id || undefined } }).then((res) => {
      setDesignations(res.data);
    });
  }, [form.department_id]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({
      ...f,
      [name]: value,
      ...(name === 'state_id' ? { city_id: '' } : {}),
      ...(name === 'department_id' ? { designation_id: '' } : {}),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
    );

    try {
      if (isEdit) {
        await api.put(`/employees/${id}`, payload);
      } else {
        const res = await api.post('/employees', payload);
        if (newFiles.length > 0) {
          await uploadFiles(newFiles, 'employee', res.data.id);
        }
      }
      navigate('/employees');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save employee.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <p className="subtitle">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h2>{isEdit ? 'Edit employee' : 'Add employee'}</h2>
      <p className="subtitle">{isEdit ? 'Update employee details.' : 'Create a new employee record.'}</p>

      {error && <div className="form-error">{error}</div>}

      <form className="entity-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>First name *</label>
            <input name="first_name" value={form.first_name} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>Last name *</label>
            <input name="last_name" value={form.last_name} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>Gender{!isEdit && ' *'}</label>
            <select name="gender" value={form.gender} onChange={handleChange} required={!isEdit}>
              <option value="">—</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div className="field">
            <label>Email *</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>Phone{!isEdit && ' *'}</label>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="9876543210"
              maxLength={10}
              pattern="[6-9][0-9]{9}"
              title="10 digits, starting with 6-9"
              required={!isEdit}
            />
          </div>

          <div className="field">
            <label>Date of birth{!isEdit && ' *'}</label>
            <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} required={!isEdit} />
          </div>

          <div className="field field-wide">
            <label>Address{!isEdit && ' *'}</label>
            <input name="address" value={form.address} onChange={handleChange} required={!isEdit} />
          </div>

          <div className="field">
            <label>State{!isEdit && ' *'}</label>
            <select name="state_id" value={form.state_id} onChange={handleChange} required={!isEdit}>
              <option value="">—</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>City{!isEdit && ' *'}</label>
            <select name="city_id" value={form.city_id} onChange={handleChange} disabled={!form.state_id} required={!isEdit}>
              <option value="">—</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Aadhar</label>
            <input
              name="aadhar"
              value={form.aadhar}
              onChange={handleChange}
              placeholder="234567890123"
              maxLength={12}
              pattern="[0-9]{12}"
              title="Exactly 12 digits"
            />
          </div>

          <div className="field">
            <label>PAN</label>
            <input
              name="pan"
              value={form.pan}
              onChange={(e) => handleChange({ target: { name: 'pan', value: e.target.value.toUpperCase() } })}
              placeholder="ABCDE1234F"
              maxLength={10}
              pattern="[A-Z]{5}[0-9]{4}[A-Z]"
              title="Format: AAAAA9999A"
            />
          </div>

          <div className="field">
            <label>Department{!isEdit && ' *'}</label>
            <select name="department_id" value={form.department_id} onChange={handleChange} required={!isEdit}>
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Designation{!isEdit && ' *'}</label>
            <select name="designation_id" value={form.designation_id} onChange={handleChange} required={!isEdit}>
              <option value="">—</option>
              {designations.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Reporting manager</label>
            <select name="reporting_to" value={form.reporting_to} onChange={handleChange}>
              <option value="">—</option>
              {employees.filter((e) => String(e.id) !== String(id)).map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Reporting branch{!isEdit && ' *'}</label>
            <select name="reporting_branch" value={form.reporting_branch} onChange={handleChange} required={!isEdit}>
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div className="field">
              <label>Role</label>
              <p className="subtitle" style={{ margin: '0.4rem 0 0', textTransform: 'capitalize' }}>
                {currentRole || 'employee'}
              </p>
              <p className="subtitle" style={{ margin: '0.2rem 0 0', fontSize: '0.85em' }}>
                Changed from Admin, not here.
              </p>
            </div>
          )}

          <div className="field">
            <label>Date of joining{!isEdit && ' *'}</label>
            <input type="date" name="date_of_joining" value={form.date_of_joining} onChange={handleChange} required={!isEdit} />
          </div>

          <div className="field">
            <label>Date of resignation</label>
            <input type="date" name="date_of_resign" value={form.date_of_resign} onChange={handleChange} />
          </div>

          <div className="field">
            <label>Salary{!isEdit && ' *'}</label>
            <input type="number" step="0.01" min="0" name="salary" value={form.salary} onChange={handleChange} required={!isEdit} />
          </div>

          <div className="field">
            <label>Annual leave entitlement (days)</label>
            <input type="number" step="1" min="0" name="annual_leave_entitlement" value={form.annual_leave_entitlement} onChange={handleChange} />
          </div>

          <div className="field">
            <label>Business expected</label>
            <input
              type="number" step="0.01" min="0"
              name="business_expected" value={form.business_expected} onChange={handleChange}
            />
          </div>

          {!isEdit && (
            <div className="field field-wide">
              <label>Documents</label>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={handleNewFilesSelected}
              />
              {newFiles.length > 0 && (
                <p className="subtitle" style={{ marginTop: '0.4rem', marginBottom: 0 }}>
                  {newFiles.length} file{newFiles.length > 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/employees')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-inline" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create employee'}
          </button>
        </div>
      </form>

      {isEdit && (
        <>
          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={{ margin: 0 }}>Tasks</h3>
            {canAssignTask && (
              <button type="button" className="btn-secondary" onClick={() => setAssignModalOpen(true)}>
                + Assign task
              </button>
            )}
          </div>
          <div style={{ marginTop: '0.6rem' }}>
            <TaskList
              tasks={tasks}
              showAssignedBy
              onDelete={canAssignTask ? handleDeleteTask : undefined}
              onOpenDocs={setDocsTask}
            />
          </div>

          <DocumentsPanel entityType="employee" entityId={id} title="Documents" />

          <AssignTaskModal
            open={assignModalOpen}
            lockedEmployeeId={id}
            lockedEmployeeName={`${form.first_name} ${form.last_name}`.trim()}
            onClose={() => setAssignModalOpen(false)}
            onSave={handleAssignTask}
          />

          <TaskDocumentsModal open={Boolean(docsTask)} task={docsTask} onClose={() => setDocsTask(null)} />
        </>
      )}
    </Layout>
  );
}
