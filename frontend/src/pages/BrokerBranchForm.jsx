import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  address: '',
  state_id: '',
  city_id: '',
  branch_code: '',
  gst: '',
};

export default function BrokerBranchForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/lookups/states').then((res) => setStates(res.data));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/branches/${id}`)
      .then((res) => {
        const b = res.data;
        setForm({
          name: b.name || '',
          email: b.email || '',
          phone: b.phone || '',
          address: b.address || '',
          state_id: b.state_id || '',
          city_id: b.city_id || '',
          branch_code: b.branch_code || '',
          gst: b.gst || '',
        });
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load branch.'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  useEffect(() => {
    if (!form.state_id) {
      setCities([]);
      return;
    }
    api.get('/lookups/cities', { params: { state_id: form.state_id } }).then((res) => {
      setCities(res.data);
    });
  }, [form.state_id]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value, ...(name === 'state_id' ? { city_id: '' } : {}) }));
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
        await api.put(`/branches/${id}`, payload);
      } else {
        await api.post('/branches', payload);
      }
      navigate('/branches');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save branch.');
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
      <h2>{isEdit ? 'Edit branch' : 'Add branch'}</h2>
      <p className="subtitle">{isEdit ? 'Update broker branch details.' : 'Create a new broker branch record.'}</p>

      {error && <div className="form-error">{error}</div>}

      <form className="entity-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field-wide">
            <label>Name *</label>
            <input name="name" value={form.name} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>Email *</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>Phone</label>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="9876543210"
              maxLength={10}
              pattern="[6-9][0-9]{9}"
              title="10 digits, starting with 6-9"
            />
          </div>

          <div className="field">
            <label>Branch code</label>
            <input name="branch_code" value={form.branch_code} onChange={handleChange} />
          </div>

          <div className="field field-wide">
            <label>Address</label>
            <input name="address" value={form.address} onChange={handleChange} />
          </div>

          <div className="field">
            <label>State</label>
            <select name="state_id" value={form.state_id} onChange={handleChange}>
              <option value="">—</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>City</label>
            <select name="city_id" value={form.city_id} onChange={handleChange} disabled={!form.state_id}>
              <option value="">—</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>GST</label>
            <input
              name="gst"
              value={form.gst}
              onChange={(e) => handleChange({ target: { name: 'gst', value: e.target.value.toUpperCase() } })}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]"
              title="15-character GSTIN"
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/branches')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-inline" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create branch'}
          </button>
        </div>
      </form>
    </Layout>
  );
}
