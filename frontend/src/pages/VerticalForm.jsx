import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const EMPTY_FORM = {
  name: '',
  vertical_head: '',
  description: '',
};

export default function VerticalForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/lookups/employees').then((res) => setEmployees(res.data));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/verticals/${id}`)
      .then((res) => {
        const v = res.data;
        setForm({
          name: v.name || '',
          vertical_head: v.vertical_head || '',
          description: v.description || '',
        });
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load vertical.'))
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
        await api.put(`/verticals/${id}`, payload);
      } else {
        await api.post('/verticals', payload);
      }
      navigate('/verticals');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save vertical.');
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
      <h2>{isEdit ? 'Edit vertical' : 'Add vertical'}</h2>
      <p className="subtitle">{isEdit ? 'Update vertical details.' : 'Create a new vertical record.'}</p>

      {error && <div className="form-error">{error}</div>}

      <form className="entity-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field-wide">
            <label>Name *</label>
            <input name="name" value={form.name} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>Vertical head</label>
            <select name="vertical_head" value={form.vertical_head} onChange={handleChange}>
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="field field-wide">
            <label>Description</label>
            <input name="description" value={form.description} onChange={handleChange} />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/verticals')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-inline" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create vertical'}
          </button>
        </div>
      </form>
    </Layout>
  );
}
