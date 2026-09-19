import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const EMPTY_FORM = { name: '', description: '' };

export default function HeadForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/heads/${id}`)
      .then((res) => {
        const h = res.data;
        setForm({ name: h.name || '', description: h.description || '' });
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load head.'))
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
        await api.put(`/heads/${id}`, payload);
      } else {
        await api.post('/heads', payload);
      }
      navigate('/heads');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save head.');
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
      <h2>{isEdit ? 'Edit head' : 'Add head'}</h2>
      <p className="subtitle">
        {isEdit ? 'Update head details.' : 'Create a new category — used for both expenses and income in the ledger.'}
      </p>

      {error && <div className="form-error">{error}</div>}

      <form className="entity-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field-wide">
            <label>Name *</label>
            <input name="name" value={form.name} onChange={handleChange} required />
          </div>

          <div className="field field-wide">
            <label>Description</label>
            <input name="description" value={form.description} onChange={handleChange} />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/heads')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-inline" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create head'}
          </button>
        </div>
      </form>
    </Layout>
  );
}
