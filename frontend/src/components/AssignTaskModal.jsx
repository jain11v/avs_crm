import { useEffect, useState } from 'react';

const EMPTY_FORM = { title: '', description: '', due_date: '', priority: 'normal' };

export default function AssignTaskModal({ open, employeeName, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setError('');
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

  function handleSave() {
    if (!form.title.trim()) {
      setError('Give the task a title.');
      return;
    }
    onSave({
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      priority: form.priority,
    });
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Assign task — {employeeName}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="form-grid">
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
