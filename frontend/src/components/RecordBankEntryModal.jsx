import { useEffect, useState } from 'react';
import api from '../api/axios';
import CustomerPicker from './CustomerPicker';

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  entry_date: todayIsoDate(),
  bank_account_id: '',
  type_of_transaction: 'Debit',
  head_id: '',
  amount: '',
  remarks: '',
};

export default function RecordBankEntryModal({ open, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [linkTo, setLinkTo] = useState('none'); // 'none' | 'employee' | 'customer' | 'insurer'
  const [employeeId, setEmployeeId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerLabel, setCustomerLabel] = useState('');
  const [insurerId, setInsurerId] = useState('');

  const [bankAccounts, setBankAccounts] = useState([]);
  const [heads, setHeads] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [insurers, setInsurers] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setLinkTo('none');
    setEmployeeId('');
    setCustomerId('');
    setCustomerLabel('');
    setInsurerId('');
    setError('');
    setSaving(false);
    api.get('/lookups/bank-accounts').then((res) => setBankAccounts(res.data));
    api.get('/lookups/heads').then((res) => setHeads(res.data));
    api.get('/lookups/employees').then((res) => setEmployees(res.data));
    api.get('/lookups/insurers').then((res) => setInsurers(res.data));
  }, [open]);

  if (!open) return null;

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function handleLinkToChange(value) {
    setLinkTo(value);
    setEmployeeId('');
    setCustomerId('');
    setCustomerLabel('');
    setInsurerId('');
  }

  async function handleSave() {
    if (!form.bank_account_id || !form.head_id || !form.amount) {
      setError('Bank account, head, and amount are required.');
      return;
    }
    if (linkTo === 'employee' && !employeeId) {
      setError('Select an employee, or set "Link to" back to None.');
      return;
    }
    if (linkTo === 'customer' && !customerId) {
      setError('Select a customer, or set "Link to" back to None.');
      return;
    }
    if (linkTo === 'insurer' && !insurerId) {
      setError('Select an insurer, or set "Link to" back to None.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({
        entry_date: form.entry_date,
        bank_account_id: form.bank_account_id,
        type_of_transaction: form.type_of_transaction,
        head_id: form.head_id,
        amount: form.amount,
        remarks: form.remarks.trim() || null,
        employee_id: linkTo === 'employee' ? employeeId : null,
        customer_id: linkTo === 'customer' ? customerId : null,
        insurer_id: linkTo === 'insurer' ? insurerId : null,
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not record this bank entry.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Record bank entry</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="form-grid">
            <div className="field">
              <label>Type *</label>
              <select name="type_of_transaction" value={form.type_of_transaction} onChange={handleChange}>
                <option value="Debit">Debit</option>
                <option value="Credit">Credit</option>
              </select>
            </div>

            <div className="field">
              <label>Amount *</label>
              <input
                type="number" step="0.01" min="0.01"
                name="amount" value={form.amount} onChange={handleChange}
              />
            </div>

            <div className="field">
              <label>Bank account *</label>
              <select name="bank_account_id" value={form.bank_account_id} onChange={handleChange}>
                <option value="">—</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Head *</label>
              <select name="head_id" value={form.head_id} onChange={handleChange}>
                <option value="">—</option>
                {heads.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Date</label>
              <input type="date" name="entry_date" value={form.entry_date} onChange={handleChange} />
            </div>

            <div className="field field-wide">
              <label>Remarks</label>
              <input name="remarks" value={form.remarks} onChange={handleChange} maxLength={255} />
            </div>

            <div className="field field-wide">
              <label>If there's a balance left over — who with?</label>
              <select value={linkTo} onChange={(e) => handleLinkToChange(e.target.value)}>
                <option value="none">Nobody — this entry is self-contained</option>
                <option value="employee">An employee</option>
                <option value="customer">A customer</option>
                <option value="insurer">An insurer (e.g. a faulty duplicate premium payment)</option>
              </select>
            </div>

            {linkTo === 'employee' && (
              <div className="field field-wide">
                <label>Employee</label>
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">—</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            )}

            {linkTo === 'customer' && (
              <div className="field field-wide">
                <label>Customer</label>
                <CustomerPicker
                  customerId={customerId}
                  customerLabel={customerLabel}
                  onSelect={(id, label) => { setCustomerId(id); setCustomerLabel(label); }}
                />
              </div>
            )}

            {linkTo === 'insurer' && (
              <div className="field field-wide">
                <label>Insurer</label>
                <select value={insurerId} onChange={(e) => setInsurerId(e.target.value)}>
                  <option value="">—</option>
                  {insurers.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-inline" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Record entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
