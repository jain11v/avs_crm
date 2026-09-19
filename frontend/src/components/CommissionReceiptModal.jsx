import { useEffect, useState } from 'react';

// Records what an insurer actually paid back as commission for one policy.
// Prefills the amount to the expected commission — the user overwrites it
// if the insurer paid something different, which is the whole point of
// reconciling.

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = { amount: '', bank_account_id: '', received_date: '', reference_id: '', remarks: '' };

export default function CommissionReceiptModal({ open, policy, bankAccounts, onClose, onSave, onRemove }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !policy) return;
    setForm({
      amount: policy.received_amount ?? policy.expected_total,
      bank_account_id: policy.received_bank_account_id ?? '',
      received_date: policy.received_date ? policy.received_date.slice(0, 10) : todayIsoDate(),
      reference_id: policy.received_reference ?? '',
      remarks: policy.received_remarks ?? '',
    });
    setError('');
  }, [open, policy]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !policy) return null;

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function handleSave() {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount received.');
      return;
    }
    if (!form.bank_account_id) {
      setError('Select the account the commission was received into.');
      return;
    }
    onSave({
      amount,
      bank_account_id: form.bank_account_id,
      received_date: form.received_date,
      reference_id: form.reference_id || null,
      remarks: form.remarks || null,
    });
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Commission received — {policy.policy_number}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <p className="subtitle" style={{ marginTop: 0 }}>
            Expected: ₹{policy.expected_total.toLocaleString('en-IN')}
            {' '}({policy.insurer_name}{policy.insurer_branch_name ? ` — ${policy.insurer_branch_name}` : ''})
          </p>

          <div className="form-grid">
            <div className="field">
              <label>Amount received *</label>
              <input
                type="number" step="0.01" min="0"
                name="amount" value={form.amount ?? ''} onChange={handleChange}
              />
            </div>

            <div className="field">
              <label>Received into account *</label>
              <select name="bank_account_id" value={form.bank_account_id} onChange={handleChange}>
                <option value="">—</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Received date</label>
              <input type="date" name="received_date" value={form.received_date} onChange={handleChange} />
            </div>

            <div className="field">
              <label>Reference / statement no.</label>
              <input name="reference_id" value={form.reference_id} onChange={handleChange} maxLength={100} />
            </div>

            <div className="field field-wide">
              <label>Remarks</label>
              <input name="remarks" value={form.remarks} onChange={handleChange} maxLength={255} />
            </div>
          </div>

          <div className="form-actions">
            {policy.receipt_id && (
              <button type="button" className="btn-link" onClick={onRemove}>
                Remove receipt
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-inline" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
