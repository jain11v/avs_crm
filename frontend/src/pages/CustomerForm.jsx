import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import DocumentsPanel from '../components/DocumentsPanel';

const EMPTY_FORM = {
  title: '',
  name: '',
  gender: '',
  email: '',
  phone: '',
  address: '',
  state_id: '',
  city_id: '',
  aadhar: '',
  pan: '',
  gst: '',
  dob: '',
  customer_type_id: '',
  priority_level: '',
  employee_id: '',
  branch_id: '',
  source_id: '',
};

export default function CustomerForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [customerTypes, setCustomerTypes] = useState([]);
  const [customerSources, setCustomerSources] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState([]);
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);

  // Load dropdown data once.
  useEffect(() => {
    api.get('/lookups/states').then((res) => setStates(res.data));
    api.get('/lookups/employees').then((res) => setEmployees(res.data));
    api.get('/lookups/branches').then((res) => setBranches(res.data));
    api.get('/lookups/customer-types').then((res) => setCustomerTypes(res.data));
    api.get('/lookups/customer-sources').then((res) => setCustomerSources(res.data));
  }, []);

  // If editing, load the existing customer.
  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/customers/${id}`)
      .then((res) => {
        const c = res.data;
        setForm({
          title: c.title || '',
          name: c.name || '',
          gender: c.gender || '',
          email: c.email || '',
          phone: c.phone || '',
          address: c.address || '',
          state_id: c.state_id || '',
          city_id: c.city_id || '',
          aadhar: c.aadhar || '',
          pan: c.pan || '',
          gst: c.gst || '',
          dob: c.dob ? c.dob.slice(0, 10) : '',
          customer_type_id: c.customer_type_id || '',
          priority_level: c.priority_level || '',
          employee_id: c.employee_id || '',
          branch_id: c.branch_id || '',
          source_id: c.source_id || '',
        });
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load customer.'))
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
    if (name === 'name' || name === 'phone') {
      setDuplicatesDismissed(false);
    }
    setForm((f) => ({ ...f, [name]: value, ...(name === 'state_id' ? { city_id: '' } : {}) }));
  }

  // Checks for an existing customer with the same name or phone number, so
  // people don't end up re-creating someone who's already in the system.
  // Only relevant when adding — editing a customer isn't creating a duplicate.
  useEffect(() => {
    if (isEdit) return;
    if (form.name.trim().length < 3 && !form.phone) {
      setDuplicates([]);
      return;
    }
    const timeout = setTimeout(() => {
      api
        .get('/customers/check-duplicate', { params: { name: form.name.trim(), phone: form.phone || undefined } })
        .then((res) => setDuplicates(res.data))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timeout);
  }, [form.name, form.phone, isEdit]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);

    // Convert empty-string selects/numbers to null so we don't send "" into
    // integer/date columns.
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
    );

    try {
      if (isEdit) {
        await api.put(`/customers/${id}`, payload);
      } else {
        await api.post('/customers', payload);
      }
      navigate('/customers');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save customer.');
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
      <div className="page-header">
        <div>
          <h2>{isEdit ? 'Edit customer' : 'Add customer'}</h2>
          <p className="subtitle">{isEdit ? 'Update customer details.' : 'Create a new customer record.'}</p>
        </div>
        {isEdit && (
          <Link to={`/customers/${id}/notes`} className="btn-secondary">
            Notes &amp; follow-ups
          </Link>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      {!duplicatesDismissed && duplicates.length > 0 && (
        <div className="form-error" style={{ background: '#fdf3e2', borderColor: '#f0dfa9', color: '#92620c' }}>
          <strong>Possible match found</strong> — this person may already be in the system.
          <table className="data-table" style={{ marginTop: '0.6rem' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Address</th>
                <th>City / State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {duplicates.map((d) => (
                <tr key={d.id}>
                  <td>{d.title ? `${d.title} ` : ''}{d.name}</td>
                  <td>{d.phone || '—'}</td>
                  <td>{d.address || '—'}</td>
                  <td>{d.city_name ? `${d.city_name}, ${d.state_name}` : '—'}</td>
                  <td>
                    <button type="button" className="btn-link" onClick={() => navigate(`/customers/${d.id}/edit`)}>
                      Use this one
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn-link" style={{ marginTop: '0.6rem' }} onClick={() => setDuplicatesDismissed(true)}>
            None of these — continue creating new
          </button>
        </div>
      )}

      <form className="entity-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Title</label>
            <select name="title" value={form.title} onChange={handleChange}>
              <option value="">—</option>
              <option value="Mr.">Mr.</option>
              <option value="Ms.">Ms.</option>
              <option value="Mrs.">Mrs.</option>
              <option value="M/s">M/s</option>
            </select>
          </div>

          <div className="field field-wide">
            <label>Name *</label>
            <input name="name" value={form.name} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>Gender{!isEdit && ' *'}</label>
            <select name="gender" value={form.gender} onChange={handleChange} required={!isEdit}>
              <option value="">—</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Company">Company</option>
            </select>
          </div>

          <div className="field">
            <label>Email</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} />
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
            <label>Date of birth</label>
            <input type="date" name="dob" value={form.dob} onChange={handleChange} />
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

          <div className="field">
            <label>Customer type{!isEdit && ' *'}</label>
            <select name="customer_type_id" value={form.customer_type_id} onChange={handleChange} required={!isEdit}>
              <option value="">—</option>
              {customerTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Priority level{!isEdit && ' *'}</label>
            <select name="priority_level" value={form.priority_level} onChange={handleChange} required={!isEdit}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div className="field">
              <label>Assigned employee</label>
              <select name="employee_id" value={form.employee_id} onChange={handleChange}>
                <option value="">—</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <label>Branch{!isEdit && ' *'}</label>
            <select name="branch_id" value={form.branch_id} onChange={handleChange} required={!isEdit}>
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Source{!isEdit && ' *'}</label>
            <select name="source_id" value={form.source_id} onChange={handleChange} required={!isEdit}>
              <option value="">—</option>
              {customerSources.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/customers')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-inline" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
          </button>
        </div>
      </form>

      {isEdit && <DocumentsPanel entityType="customer" entityId={id} />}
    </Layout>
  );
}
