import { useEffect, useState } from 'react';

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = { leave_type: 'paid', start_date: todayIsoDate(), end_date: todayIsoDate(), reason: '' };

export default function ApplyLeaveModal({ open, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setError('');
    setSaving(false);
  }, [open]);

  if (!open) return null;

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSave() {
    if (!form.start_date || !form.end_date) {
      setError('Choose a start and end date.');
      return;
    }
    if (form.end_date < form.start_date) {
      setError('End date cannot be before start date.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason.trim() || null,
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit this leave request.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Apply for leave</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="form-grid">
            <div className="field">
              <label>Type *</label>
              <select name="leave_type" value={form.leave_type} onChange={handleChange}>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>

            <div className="field">
              <label>Start date *</label>
              <input type="date" name="start_date" value={form.start_date} onChange={handleChange} />
            </div>

            <div className="field">
              <label>End date *</label>
              <input type="date" name="end_date" value={form.end_date} onChange={handleChange} />
            </div>

            <div className="field field-wide">
              <label>Reason</label>
              <input name="reason" value={form.reason} onChange={handleChange} maxLength={255} />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-inline" onClick={handleSave} disabled={saving}>
              {saving ? 'Submitting…' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
