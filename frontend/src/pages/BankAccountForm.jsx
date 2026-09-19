import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';

const EMPTY_FORM = {
  bank_name_id: '',
  name: '',
  ac_no: '',
  type: 'Saving',
  ifsc: '',
};

const TYPE_OPTIONS = ['Saving', 'Current', 'Loan', 'Credit card', 'Debit card'];

export default function BankAccountForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [bankNames, setBankNames] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/lookups/bank-names').then((res) => setBankNames(res.data));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/bank-accounts/${id}`)
      .then((res) => {
        const a = res.data;
        setForm({
          bank_name_id: a.bank_name_id || '',
          name: a.name || '',
          ac_no: a.ac_no || '',
          type: a.type || 'Saving',
          ifsc: a.ifsc || '',
        });
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load bank account.'))
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
        await api.put(`/bank-accounts/${id}`, payload);
      } else {
        await api.post('/bank-accounts', payload);
      }
      navigate('/bank-accounts');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save bank account.');
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
      <h2>{isEdit ? 'Edit bank account' : 'Add bank account'}</h2>
      <p className="subtitle">{isEdit ? 'Update bank account details.' : 'Create a new bank account record.'}</p>

      {error && <div className="form-error">{error}</div>}

      <form className="entity-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Bank name *</label>
            <select name="bank_name_id" value={form.bank_name_id} onChange={handleChange} required>
              <option value="">—</option>
              {bankNames.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Account name *</label>
            <input name="name" value={form.name} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>Account number *</label>
            <input name="ac_no" value={form.ac_no} onChange={handleChange} required />
          </div>

          <div className="field">
            <label>Type</label>
            <select name="type" value={form.type} onChange={handleChange}>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>IFSC</label>
            <input
              name="ifsc"
              value={form.ifsc}
              onChange={(e) => handleChange({ target: { name: 'ifsc', value: e.target.value.toUpperCase() } })}
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/bank-accounts')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-inline" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create bank account'}
          </button>
        </div>
      </form>
    </Layout>
  );
}
