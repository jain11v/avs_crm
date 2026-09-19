import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const EMPTY_FORM = {
  name: '',
  vertical_id: '',
  description: '',
};

export default function SubVerticalForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    ...EMPTY_FORM,
    vertical_id: searchParams.get('vertical_id') || '',
  });
  const [verticals, setVerticals] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/lookups/verticals').then((res) => setVerticals(res.data));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/sub-verticals/${id}`)
      .then((res) => {
        const sv = res.data;
        setForm({
          name: sv.name || '',
          vertical_id: sv.vertical_id || '',
          description: sv.description || '',
        });
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load sub-vertical.'))
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
        await api.put(`/sub-verticals/${id}`, payload);
      } else {
        await api.post('/sub-verticals', payload);
      }
      navigate(`/sub-verticals${form.vertical_id ? `?vertical_id=${form.vertical_id}` : ''}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save sub-vertical.');
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
      <h2>{isEdit ? 'Edit sub-vertical' : 'Add sub-vertical'}</h2>
      <p className="subtitle">{isEdit ? 'Update sub-vertical details.' : 'Create a new sub-vertical record.'}</p>

      {error && <div className="form-error">{error}</div>}

      <form className="entity-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Vertical *</label>
            <select name="vertical_id" value={form.vertical_id} onChange={handleChange} required>
              <option value="">—</option>
              {verticals.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

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
          <button type="button" className="btn-secondary" onClick={() => navigate('/sub-verticals')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-inline" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create sub-vertical'}
          </button>
        </div>
      </form>
    </Layout>
  );
}
