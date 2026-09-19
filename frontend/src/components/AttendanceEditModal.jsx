import { useEffect, useState } from 'react';

const STATUS_OPTIONS = ['present', 'absent', 'half_day', 'leave'];

// Manager/admin correction of any employee's attendance row — e.g. they
// forgot to check out, or need a day retroactively marked absent.

function toTimeInputValue(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AttendanceEditModal({ open, record, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !record) return;
    setForm({
      status: record.status,
      check_in_time: toTimeInputValue(record.check_in_time),
      check_out_time: toTimeInputValue(record.check_out_time),
      remarks: record.remarks || '',
    });
    setError('');
  }, [open, record]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !record) return null;

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function handleSave() {
    if (!form.status) {
      setError('Select a status.');
      return;
    }
    // Times are edited as a clock time on the record's own date — combine
    // back into a full timestamp, same date, only the hour/minute changed.
    const combine = (timeStr) => {
      if (!timeStr) return null;
      const [h, m] = timeStr.split(':');
      const d = new Date(record.date);
      d.setHours(Number(h), Number(m), 0, 0);
      return d.toISOString();
    };

    onSave({
      status: form.status,
      check_in_time: combine(form.check_in_time),
      check_out_time: combine(form.check_out_time),
      remarks: form.remarks || null,
    });
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Attendance — {record.first_name} {record.last_name}, {new Date(record.date).toLocaleDateString('en-IN')}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="form-grid">
            <div className="field">
              <label>Status</label>
              <select name="status" value={form.status} onChange={handleChange}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Check-in time</label>
              <input type="time" name="check_in_time" value={form.check_in_time} onChange={handleChange} />
            </div>

            <div className="field">
              <label>Check-out time</label>
              <input type="time" name="check_out_time" value={form.check_out_time} onChange={handleChange} />
            </div>

            <div className="field field-wide">
              <label>Remarks</label>
              <input name="remarks" value={form.remarks} onChange={handleChange} maxLength={255} />
            </div>
          </div>

          <div className="form-actions">
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
