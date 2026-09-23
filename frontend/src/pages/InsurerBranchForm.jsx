import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const EMPTY_FORM = {
  name: '',
  insurer_id: '',
  broker_code: '',
  branch_code: '',
  contact_person: '',
  email: '',
  phone: '',
  address: '',
  state_id: '',
  city_id: '',
  pan: '',
  gst: '',
  bank_name_id: '',
  account_no: '',
  ifsc: '',
  website: '',
  remarks: '',
};

export default function InsurerBranchForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    ...EMPTY_FORM,
    insurer_id: searchParams.get('insurer_id') || '',
  });
  const [insurers, setInsurers] = useState([]);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [bankNames, setBankNames] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/lookups/insurers').then((res) => setInsurers(res.data));
    api.get('/lookups/states').then((res) => setStates(res.data));
    api.get('/lookups/bank-names').then((res) => setBankNames(res.data));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/insurer-branches/${id}`)
      .then((res) => {
        const b = res.data;
        setForm({
          name: b.name || '',
          insurer_id: b.insurer_id || '',
          broker_code: b.broker_code || '',
          branch_code: b.branch_code || '',
          contact_person: b.contact_person || '',
          email: b.email || '',
          phone: b.phone || '',
          address: b.address || '',
          state_id: b.state_id || '',
          city_id: b.city_id || '',
          pan: b.pan || '',
          gst: b.gst || '',
          bank_name_id: b.bank_name_id || '',
          account_no: b.account_no || '',
          ifsc: b.ifsc || '',
          website: b.website || '',
          remarks: b.remarks || '',
        });
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load insurer branch.'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // Whenever state changes, load its cities. Clear the previously selected
  // city if it no longer belongs to the newly selected state.
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
        await api.put(`/insurer-branches/${id}`, payload);
      } else {
        await api.post('/insurer-branches', payload);
      }
      navigate(`/insurer-branches${form.insurer_id ? `?insurer_id=${form.insurer_id}` : ''}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save insurer branch.');
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
      <h2>{isEdit ? 'Edit insurer branch' : 'Add insurer branch'}</h2>
      <p className="subtitle">{isEdit ? 'Update insurer branch details.' : 'Create a new insurer branch record.'}</p>

      {error && <div className="form-error">{error}</div>}

      <form className="entity-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Insurer *</label>
            <select name="insurer_id" value={form.insurer_id} onChange={handleChange} required>
              <option value="">—</option>
              {insurers.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>

          <div className="field field-wide">
            <label>Name *</label>
            <input name="name" value={form.name} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>Branch code</label>
            <input name="branch_code" value={form.branch_code} onChange={handleChange} />
          </div>

          <div className="field">
            <label>Broker code</label>
            <input name="broker_code" value={form.broker_code} onChange={handleChange} />
          </div>

          <div className="field">
            <label>Contact person</label>
            <input name="contact_person" value={form.contact_person} onChange={handleChange} />
          </div>

          <div className="field">
            <label>Email</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} />
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

          <div className="field field-wide">
            <label>Address *</label>
            <input name="address" value={form.address} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>State *</label>
            <select name="state_id" value={form.state_id} onChange={handleChange} required>
              <option value="">—</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>City *</label>
            <select name="city_id" value={form.city_id} onChange={handleChange} disabled={!form.state_id} required>
              <option value="">—</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>PAN *</label>
            <input
              name="pan"
              value={form.pan}
              onChange={(e) => handleChange({ target: { name: 'pan', value: e.target.value.toUpperCase() } })}
              placeholder="ABCDE1234F"
              maxLength={10}
              pattern="[A-Z]{5}[0-9]{4}[A-Z]"
              title="Format: AAAAA9999A"
              required
            />
          </div>

          <div className="field">
            <label>GST *</label>
            <input
              name="gst"
              value={form.gst}
              onChange={(e) => handleChange({ target: { name: 'gst', value: e.target.value.toUpperCase() } })}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]"
              title="15-character GSTIN"
              required
            />
          </div>

          <div className="field">
            <label>Bank name</label>
            <select name="bank_name_id" value={form.bank_name_id} onChange={handleChange}>
              <option value="">—</option>
              {bankNames.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Account number</label>
            <input name="account_no" value={form.account_no} onChange={handleChange} />
          </div>

          <div className="field">
            <label>IFSC</label>
            <input
              name="ifsc"
              value={form.ifsc}
              onChange={(e) => handleChange({ target: { name: 'ifsc', value: e.target.value.toUpperCase() } })}
            />
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

          <div className="field field-wide">
            <label>Remarks</label>
            <input name="remarks" value={form.remarks} onChange={handleChange} maxLength={150} />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/insurer-branches')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-inline" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create insurer branch'}
          </button>
        </div>
      </form>
    </Layout>
  );
}
