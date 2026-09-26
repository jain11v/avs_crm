import { useEffect, useState } from 'react';
import api from '../api/axios';

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  customer_amount: '',
  customer_bank_account_id: '',
  customer_payment_date: todayIsoDate(),
  customer_reference_id: '',
  customer_remarks: '',

  insurer_bank_account_id: '',
  insurer_payment_date: todayIsoDate(),
  insurer_reference_id: '',
  insurer_remarks: '',

  adjustment_type: 'discount',
  adjustment_amount: '',
  adjustment_bank_account_id: '',
  adjustment_remarks: '',
};

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

// One form to record everything money-related on ONE policy at once: what
// the customer paid for it, what was paid to the insurer for it, and any
// discount/cashback against it — each section is optional (leave its
// amount blank to skip it). Deliberately simple: a customer payment here is
// always for this one policy, never split across several, and the insurer
// payment amount is always the full premium (that's what gets remitted to
// the insurer) rather than something typed in. Under the hood this still
// writes to the same three separate tables (customer_payments,
// insurer_payments, policy_adjustments) via the same endpoints the rest of
// the app uses — only the form presenting them is combined.
// A policy is paid to the insurer only once (the backend rejects a second
// payment), so once it's paid the insurer section is hidden entirely.
export default function PolicyEntryModal({ open, policyId, customerId, premiumAmount, insurerAlreadyPaid, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setError('');
    api.get('/lookups/bank-accounts').then((res) => setBankAccounts(res.data));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function validate() {
    const hasCustomer = Number(form.customer_amount) > 0;
    const hasInsurer = !insurerAlreadyPaid && Boolean(form.insurer_bank_account_id);
    const hasAdjustment = Number(form.adjustment_amount) > 0;

    if (!hasCustomer && !hasInsurer && !hasAdjustment) {
      return 'Enter an amount in at least one section.';
    }
    if (hasCustomer && !form.customer_bank_account_id) {
      return 'Select the account the customer payment was received into.';
    }
    if (hasAdjustment && form.adjustment_type === 'cashback' && !form.adjustment_bank_account_id) {
      return 'A cashback needs a bank account to pay it from.';
    }
    return '';
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setSaving(true);

    try {
      if (Number(form.customer_amount) > 0) {
        await api.post('/customer-payments', {
          customer_id: customerId,
          amount: form.customer_amount,
          bank_account_id: form.customer_bank_account_id,
          payment_date: form.customer_payment_date,
          reference_id: form.customer_reference_id || null,
          remarks: form.customer_remarks || null,
          allocations: [{ policy_id: policyId, amount: form.customer_amount }],
        });
      }

      if (!insurerAlreadyPaid && form.insurer_bank_account_id) {
        await api.post('/insurer-payments', {
          policy_id: policyId,
          amount: premiumAmount,
          bank_account_id: form.insurer_bank_account_id,
          payment_date: form.insurer_payment_date,
          reference_id: form.insurer_reference_id || null,
          remarks: form.insurer_remarks || null,
        });
      }

      if (Number(form.adjustment_amount) > 0) {
        await api.post('/policy-adjustments', {
          policy_id: policyId,
          type: form.adjustment_type,
          amount: form.adjustment_amount,
          bank_account_id: form.adjustment_type === 'cashback' ? form.adjustment_bank_account_id : null,
          remarks: form.adjustment_remarks || null,
        });
      }

      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save. Anything recorded before this error has already been saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Record payment / discount</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <p className="subtitle" style={{ marginTop: 0 }}>
            Fill in whichever sections apply — leave the amount blank to skip a section.
          </p>

          {error && <div className="form-error">{error}</div>}

          <h4 style={{ marginBottom: '0.6rem' }}>Customer payment</h4>
          <div className="form-grid">
            <div className="field">
              <label>Amount received</label>
              <input
                type="number" step="0.01" min="0"
                name="customer_amount" value={form.customer_amount} onChange={handleChange}
              />
            </div>
            <div className="field">
              <label>Received into account</label>
              <select name="customer_bank_account_id" value={form.customer_bank_account_id} onChange={handleChange}>
                <option value="">—</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Payment date</label>
              <input type="date" name="customer_payment_date" value={form.customer_payment_date} onChange={handleChange} />
            </div>
            <div className="field">
              <label>Reference / cheque no.</label>
              <input name="customer_reference_id" value={form.customer_reference_id} onChange={handleChange} maxLength={100} />
            </div>
            <div className="field">
              <label>Remarks</label>
              <input name="customer_remarks" value={form.customer_remarks} onChange={handleChange} maxLength={255} />
            </div>
          </div>

          {!insurerAlreadyPaid && (
            <>
            <h4 style={{ marginTop: '1.5rem', marginBottom: '0.6rem' }}>Insurer payment</h4>
            <p className="subtitle" style={{ marginTop: 0 }}>Always the full premium — that's what gets remitted to the insurer.</p>
            <div className="form-grid">
              <div className="field">
                <label>Amount paid</label>
                <input type="text" readOnly value={formatMoney(premiumAmount)} />
              </div>
              <div className="field">
                <label>Paid from account</label>
                <select name="insurer_bank_account_id" value={form.insurer_bank_account_id} onChange={handleChange}>
                  <option value="">—</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Payment date</label>
                <input type="date" name="insurer_payment_date" value={form.insurer_payment_date} onChange={handleChange} />
              </div>
              <div className="field">
                <label>Reference / cheque no.</label>
                <input name="insurer_reference_id" value={form.insurer_reference_id} onChange={handleChange} maxLength={100} />
              </div>
              <div className="field">
                <label>Remarks</label>
                <input name="insurer_remarks" value={form.insurer_remarks} onChange={handleChange} maxLength={255} />
              </div>
            </div>
            </>
          )}

          <h4 style={{ marginTop: '1.5rem', marginBottom: '0.6rem' }}>Discount / cashback</h4>
          <p className="subtitle" style={{ marginTop: 0 }}>Needs a senior's approval before it counts.</p>
          <div className="form-grid">
            <div className="field">
              <label>Type</label>
              <select name="adjustment_type" value={form.adjustment_type} onChange={handleChange}>
                <option value="discount">Discount</option>
                <option value="cashback">Cashback</option>
              </select>
            </div>
            <div className="field">
              <label>Amount</label>
              <input
                type="number" step="0.01" min="0"
                name="adjustment_amount" value={form.adjustment_amount} onChange={handleChange}
              />
            </div>
            {form.adjustment_type === 'cashback' && (
              <div className="field">
                <label>Pay from account</label>
                <select name="adjustment_bank_account_id" value={form.adjustment_bank_account_id} onChange={handleChange}>
                  <option value="">—</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
                  ))}
                </select>
              </div>
            )}
            <div className="field field-wide">
              <label>Remarks</label>
              <input name="adjustment_remarks" value={form.adjustment_remarks} onChange={handleChange} maxLength={255} />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-inline" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
