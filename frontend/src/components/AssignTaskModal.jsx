import { useEffect, useState } from 'react';

const EMPTY_FORM = { title: '', description: '', due_date: '', priority: 'normal', assigned_to: '', recurrence: 'none' };

// Two ways to open this: from an employee's own record (lockedEmployeeId
// fixes who it goes to) or from the Dashboard (employees is a picker list,
// assigned_to is chosen in the form). Supporting documents picked here are
// uploaded by the caller after the task itself is created — this modal
// just collects the File objects.
export default function AssignTaskModal({ open, employees, lockedEmployeeId, lockedEmployeeName, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY_FORM, assigned_to: lockedEmployeeId || '' });
    setFiles([]);
    setError('');
  }, [open, lockedEmployeeId]);

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

  function handleFilesSelected(e) {
    setFiles(Array.from(e.target.files || []));
  }

  function handleSave() {
    if (!form.title.trim()) {
      setError('Give the task a title.');
      return;
    }
    const assignedTo = lockedEmployeeId || form.assigned_to;
    if (!assignedTo) {
      setError('Choose who to assign this to.');
      return;
    }
    if (form.recurrence !== 'none' && !form.due_date) {
      setError('A due date is required for a repeating task.');
      return;
    }
    onSave({
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      priority: form.priority,
      recurrence: form.recurrence,
      assigned_to: assignedTo,
      files,
    });
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Assign task{lockedEmployeeName ? ` — ${lockedEmployeeName}` : ''}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="form-grid">
            {!lockedEmployeeId && (
              <div className="field field-wide">
                <label>Assign to *</label>
                <select name="assigned_to" value={form.assigned_to} onChange={handleChange}>
                  <option value="">—</option>
                  {(employees || []).map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="field field-wide">
              <label>Title *</label>
              <input name="title" value={form.title} onChange={handleChange} maxLength={200} />
            </div>

            <div className="field field-wide">
              <label>Description</label>
              <input name="description" value={form.description} onChange={handleChange} maxLength={2000} />
            </div>

            <div className="field">
              <label>Due date</label>
              <input type="date" name="due_date" value={form.due_date} onChange={handleChange} />
            </div>

            <div className="field">
              <label>Priority</label>
              <select name="priority" value={form.priority} onChange={handleChange}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="field">
              <label>Repeats</label>
              <select name="recurrence" value={form.recurrence} onChange={handleChange}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="field field-wide">
              <label>Supporting documents</label>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={handleFilesSelected}
              />
              {files.length > 0 && (
                <p className="subtitle" style={{ marginTop: '0.4rem', marginBottom: 0 }}>
                  {files.length} file{files.length > 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-inline" onClick={handleSave}>
              Assign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
