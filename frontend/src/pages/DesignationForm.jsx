import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const EMPTY_FORM = {
  title: '',
  department_id: '',
  level: '',
  description: '',
};

export default function DesignationForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    ...EMPTY_FORM,
    department_id: searchParams.get('department_id') || '',
  });
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/lookups/departments').then((res) => setDepartments(res.data));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/designations/${id}`)
      .then((res) => {
        const d = res.data;
        setForm({
          title: d.title || '',
          department_id: d.department_id || '',
          level: d.level ?? '',
          description: d.description || '',
        });
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load designation.'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
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
        await api.put(`/designations/${id}`, payload);
      } else {
        await api.post('/designations', payload);
      }
      navigate(`/designations${form.department_id ? `?department_id=${form.department_id}` : ''}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save designation.');
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
      <h2>{isEdit ? 'Edit designation' : 'Add designation'}</h2>
      <p className="subtitle">{isEdit ? 'Update designation details.' : 'Create a new designation record.'}</p>

      {error && <div className="form-error">{error}</div>}

      <form className="entity-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field-wide">
            <label>Title *</label>
            <input name="title" value={form.title} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>Department</label>
            <select name="department_id" value={form.department_id} onChange={handleChange}>
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Level</label>
            <input type="number" name="level" value={form.level} onChange={handleChange} />
          </div>

          <div className="field field-wide">
            <label>Description</label>
            <input name="description" value={form.description} onChange={handleChange} />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/designations')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-inline" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create designation'}
          </button>
        </div>
      </form>
    </Layout>
  );
}
