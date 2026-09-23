import { useEffect, useState } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';

const EMPTY_FORM = {
  phone: '',
  address: '',
  gender: '',
  date_of_birth: '',
  state_id: '',
  city_id: '',
};

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSaved, setPwSaved] = useState(false);

  useEffect(() => {
    api.get('/lookups/states').then((res) => setStates(res.data));
  }, []);

  useEffect(() => {
    api
      .get('/auth/profile')
      .then((res) => {
        const p = res.data;
        setProfile(p);
        setForm({
          phone: p.phone || '',
          address: p.address || '',
          gender: p.gender || '',
          date_of_birth: p.date_of_birth ? p.date_of_birth.slice(0, 10) : '',
          state_id: p.state_id || '',
          city_id: p.city_id || '',
        });
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load your profile.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!form.state_id) {
      setCities([]);
      return;
    }
    api.get('/lookups/cities', { params: { state_id: form.state_id } }).then((res) => setCities(res.data));
  }, [form.state_id]);

  function handleChange(e) {
    const { name, value } = e.target;
    setSaved(false);
    setForm((f) => ({ ...f, [name]: value, ...(name === 'state_id' ? { city_id: '' } : {}) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    setSaving(true);

    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
    );

    try {
      await api.put('/auth/profile', payload);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  function handlePwChange(e) {
    const { name, value } = e.target;
    setPwSaved(false);
    setPwForm((f) => ({ ...f, [name]: value }));
  }

  async function handlePwSubmit(e) {
    e.preventDefault();
    setPwError('');
    setPwSaved(false);

    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwError('New password and confirmation don’t match.');
      return;
    }

    setPwSaving(true);
    try {
      await api.patch('/auth/password', {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
      setPwSaved(true);
    } catch (err) {
      setPwError(err.response?.data?.error || 'Could not change your password.');
    } finally {
      setPwSaving(false);
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
          <h2>My profile</h2>
          <p className="subtitle">Update your own contact details and password.</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-grid" style={{ marginBottom: '1rem' }}>
        <div className="field">
          <label>Name</label>
          <p className="subtitle" style={{ margin: '0.4rem 0 0' }}>{profile?.first_name} {profile?.last_name}</p>
        </div>
        <div className="field">
          <label>Email</label>
          <p className="subtitle" style={{ margin: '0.4rem 0 0' }}>{profile?.email}</p>
        </div>
        <div className="field">
          <label>Role</label>
          <p className="subtitle" style={{ margin: '0.4rem 0 0', textTransform: 'capitalize' }}>{profile?.role}</p>
        </div>
      </div>
      <p className="subtitle" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
        Name, email, and role are managed by an admin, not here.
      </p>

      <form className="entity-form" onSubmit={handleSubmit}>
        <div className="form-grid">
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
            <label>Gender</label>
            <select name="gender" value={form.gender} onChange={handleChange}>
              <option value="">—</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div className="field">
            <label>Date of birth</label>
            <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} />
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
        </div>

        <div className="form-actions">
          {saved && <span className="subtitle">Saved.</span>}
          <button type="submit" className="btn-primary btn-inline" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <h3 style={{ marginTop: '2rem' }}>Change password</h3>
      {pwError && <div className="form-error">{pwError}</div>}

      <form className="entity-form" onSubmit={handlePwSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Current password</label>
            <input
              type="password" name="current_password" value={pwForm.current_password} onChange={handlePwChange}
              autoComplete="current-password" required
            />
          </div>
          <div className="field">
            <label>New password</label>
            <input
              type="password" name="new_password" value={pwForm.new_password} onChange={handlePwChange}
              autoComplete="new-password" minLength={6} required
            />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input
              type="password" name="confirm_password" value={pwForm.confirm_password} onChange={handlePwChange}
              autoComplete="new-password" minLength={6} required
            />
          </div>
        </div>

        <div className="form-actions">
          {pwSaved && <span className="subtitle">Password changed.</span>}
          <button type="submit" className="btn-primary btn-inline" disabled={pwSaving}>
            {pwSaving ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </Layout>
  );
}
