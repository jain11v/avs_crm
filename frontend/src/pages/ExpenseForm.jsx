import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { employee } = useAuth();
  const isManager = employee?.role === 'admin' || employee?.role === 'manager';

  const [form, setForm] = useState({
    user_id: '',
    description: '',
    amount: '',
    expense_date: todayIsoDate(),
    head_id: '',
    bank_account_id: '',
    remarks: '',
  });
  const [status, setStatus] = useState('pending');
  const [approverInfo, setApproverInfo] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [heads, setHeads] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/lookups/employees').then((res) => setEmployees(res.data));
    api.get('/lookups/heads').then((res) => setHeads(res.data));
    api.get('/lookups/bank-accounts').then((res) => setBankAccounts(res.data));
  }, []);

  useEffect(() => {
    if (!isEdit) {
      setForm((f) => ({ ...f, user_id: employee?.id || '' }));
      return;
    }
    api
      .get(`/expenses/${id}`)
      .then((res) => {
        const e = res.data;
        setForm({
          user_id: e.user_id || '',
          description: e.description || '',
          amount: e.amount || '',
          expense_date: e.expense_date ? e.expense_date.slice(0, 10) : todayIsoDate(),
          head_id: e.head_id || '',
          bank_account_id: e.bank_account_id || '',
          remarks: e.remarks || '',
        });
        setStatus(e.status);
        if (e.status !== 'pending' && e.approved_at) {
          setApproverInfo({
            name: `${e.approver_first_name || ''} ${e.approver_last_name || ''}`.trim(),
            at: e.approved_at,
            remarks: e.approver_remarks,
          });
        }
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load expense.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const locked = isEdit && status === 'approved';

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
        await api.put(`/expenses/${id}`, payload);
      } else {
        await api.post('/expenses', payload);
      }
      navigate('/expenses');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save expense.');
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
      <h2>{isEdit ? 'Edit expense' : 'Add expense'}</h2>
      <p className="subtitle">
        {isEdit ? 'Update expense details.' : 'Record a new office expense for approval.'}
      </p>

      {error && <div className="form-error">{error}</div>}

      {locked && (
        <div className="form-error">
          This expense has already been approved{approverInfo?.name ? ` by ${approverInfo.name}` : ''} and posted to the
          ledger — it cannot be edited.
        </div>
      )}

      {isEdit && status === 'rejected' && (
        <div className="form-error">
          This expense was rejected{approverInfo?.name ? ` by ${approverInfo.name}` : ''}
          {approverInfo?.remarks ? `: "${approverInfo.remarks}"` : '.'}
          {' '}Saving changes below will resubmit it for approval.
        </div>
      )}

      <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0 }}>
        <form className="entity-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label>Employee *</label>
              <select name="user_id" value={form.user_id} onChange={handleChange} required disabled={!isManager}>
                <option value="">—</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>

            <div className="field field-wide">
              <label>Description *</label>
              <input name="description" value={form.description} onChange={handleChange} required />
            </div>

            <div className="field">
              <label>Amount *</label>
              <input
                type="number" step="0.01" min="0.01"
                name="amount" value={form.amount} onChange={handleChange} required
              />
            </div>

            <div className="field">
              <label>Expense date</label>
              <input type="date" name="expense_date" value={form.expense_date} onChange={handleChange} />
            </div>

            <div className="field">
              <label>Category</label>
              <select name="head_id" value={form.head_id} onChange={handleChange}>
                <option value="">—</option>
                {heads.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Pay from account *</label>
              <select name="bank_account_id" value={form.bank_account_id} onChange={handleChange} required>
                <option value="">—</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
                ))}
              </select>
            </div>

            <div className="field field-wide">
              <label>Remarks</label>
              <input name="remarks" value={form.remarks} onChange={handleChange} maxLength={255} />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => navigate('/expenses')}>
              Cancel
            </button>
            {!locked && (
              <button type="submit" className="btn-primary btn-inline" disabled={saving}>
                {saving ? 'Saving…' : isEdit ? (status === 'rejected' ? 'Save & resubmit' : 'Save changes') : 'Submit expense'}
              </button>
            )}
          </div>
        </form>
      </fieldset>
    </Layout>
  );
}
