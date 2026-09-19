import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const EMPTY_FORM = {
  name: '',
  registration_number: '',
  website: '',
};

export default function InsurerForm() {
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
      .get(`/insurers/${id}`)
      .then((res) => {
        const i = res.data;
        setForm({
          name: i.name || '',
          registration_number: i.registration_number || '',
          website: i.website || '',
        });
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load insurer.'))
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
        await api.put(`/insurers/${id}`, payload);
      } else {
        await api.post('/insurers', payload);
      }
      navigate('/insurers');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save insurer.');
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
      <h2>{isEdit ? 'Edit insurer' : 'Add insurer'}</h2>
      <p className="subtitle">{isEdit ? 'Update insurer details.' : 'Create a new insurer record.'}</p>

      {error && <div className="form-error">{error}</div>}

      <form className="entity-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field-wide">
            <label>Name *</label>
            <input name="name" value={form.name} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>Registration number</label>
            <input name="registration_number" value={form.registration_number} onChange={handleChange} />
          </div>

          <div className="field">
            <label>Website</label>
            <input
              type="url"
              name="website"
              value={form.website}
              onChange={handleChange}
              placeholder="https://example.com"
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/insurers')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-inline" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create insurer'}
          </button>
        </div>
      </form>
    </Layout>
  );
}
