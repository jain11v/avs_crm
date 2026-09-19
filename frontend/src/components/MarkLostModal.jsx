import { useEffect, useState } from 'react';

// A lead's "didn't convert" outcome always needs a reason — used for later
// reporting on why leads don't turn into policies.
export default function MarkLostModal({ open, taskTitle, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError('');
    setSaving(false);
  }, [open]);

  if (!open) return null;

  async function handleConfirm() {
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err.response?.data?.error || 'Could not mark this lead lost.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Mark as lost lead</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <p className="subtitle" style={{ marginTop: 0 }}>{taskTitle}</p>
          {error && <div className="form-error">{error}</div>}

          <div className="field field-wide">
            <label>Why didn't this convert? *</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-inline" onClick={handleConfirm} disabled={saving}>
              {saving ? 'Saving…' : 'Mark lost'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
