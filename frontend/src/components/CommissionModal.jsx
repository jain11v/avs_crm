import { useEffect, useState } from 'react';

// Commission is a single, optional record per policy — the broker's own
// brokerage % (plus a separate TP brokerage % for motor policies) and the
// GST charged on that commission, which defaults to 18% (the standard GST
// rate on brokerage/commission services in India).

const DEFAULT_FORM = { brok_percent: '', tp_brok_percent: '', gst: '18', remarks: '' };

export default function CommissionModal({ open, initialCommission, onClose, onSave }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(
      initialCommission
        ? {
            brok_percent: initialCommission.brok_percent ?? '',
            tp_brok_percent: initialCommission.tp_brok_percent ?? '',
            gst: initialCommission.gst ?? '18',
            remarks: initialCommission.remarks || '',
          }
        : DEFAULT_FORM
    );
    setError('');
  }, [open, initialCommission]);

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
    for (const [label, value] of [
      ['Brokerage %', form.brok_percent],
      ['TP brokerage %', form.tp_brok_percent],
      ['GST %', form.gst],
    ]) {
      if (value === '') continue;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        return `Enter a valid ${label}.`;
      }
    }
    return '';
  }

  function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    onSave({
      brok_percent: form.brok_percent === '' ? null : form.brok_percent,
      tp_brok_percent: form.tp_brok_percent === '' ? null : form.tp_brok_percent,
      gst: form.gst === '' ? 18 : form.gst,
      remarks: form.remarks || null,
    });
  }

  function handleRemove() {
    onSave(null);
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Commission</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="form-grid">
            <div className="field">
              <label>Brokerage %</label>
              <input
                type="number" step="0.01" min="0"
                name="brok_percent" value={form.brok_percent} onChange={handleChange}
              />
            </div>

            <div className="field">
              <label>TP brokerage %</label>
              <input
                type="number" step="0.01" min="0"
                name="tp_brok_percent" value={form.tp_brok_percent} onChange={handleChange}
              />
            </div>

            <div className="field">
              <label>GST %</label>
              <input
                type="number" step="0.01" min="0"
                name="gst" value={form.gst} onChange={handleChange}
              />
            </div>

            <div className="field field-wide">
              <label>Remarks</label>
              <input name="remarks" value={form.remarks} onChange={handleChange} maxLength={150} />
            </div>
          </div>

          <div className="form-actions">
            {initialCommission && (
              <button type="button" className="btn-link" onClick={handleRemove}>
                Remove commission
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-inline" onClick={handleSave}>
              Save commission
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
