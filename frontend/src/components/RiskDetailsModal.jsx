import { useEffect, useState } from 'react';

// The insured risk for a policy — field set depends on the sub-vertical
// (a Private Car needs registration/engine/chassis numbers, a Fire policy
// needs building/stock details). `fields` comes from riskSchemas.js, keyed
// off the selected sub-vertical; the values themselves are stored as one
// JSON object on the policy (policies.risk_details).

const EMPTY_MEMBER = { name: '', relationship: '', age: '', gender: '' };

function emptyValuesFor(fields) {
  const out = {};
  for (const f of fields) {
    out[f.key] = f.type === 'checkbox' ? false : f.type === 'member_list' ? [] : '';
  }
  return out;
}

export default function RiskDetailsModal({ open, subVerticalName, fields, initialValues, onClose, onSave }) {
  const [values, setValues] = useState({});

  useEffect(() => {
    if (!open || !fields) return;
    const base = emptyValuesFor(fields);
    setValues({ ...base, ...(initialValues || {}) });
  }, [open, fields, initialValues]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !fields) return null;

  function setField(key, value) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function updateMember(fieldKey, index, memberField, value) {
    setValues((v) => {
      const members = [...(v[fieldKey] || [])];
      members[index] = { ...members[index], [memberField]: value };
      return { ...v, [fieldKey]: members };
    });
  }

  function addMember(fieldKey) {
    setValues((v) => ({ ...v, [fieldKey]: [...(v[fieldKey] || []), { ...EMPTY_MEMBER }] }));
  }

  function removeMember(fieldKey, index) {
    setValues((v) => ({ ...v, [fieldKey]: (v[fieldKey] || []).filter((_, i) => i !== index) }));
  }

  function handleSave() {
    onSave(values);
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Risk details — {subVerticalName}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <div className="form-grid">
            {fields.map((f) => {
              if (f.type === 'member_list') {
                const members = values[f.key] || [];
                return (
                  <div className="field field-wide" key={f.key}>
                    <label>{f.label}</label>
                    <div className="modal-table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Relationship</th>
                            <th>Age</th>
                            <th>Gender</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {members.map((m, i) => (
                            <tr key={i}>
                              <td>
                                <input
                                  className="table-input"
                                  value={m.name}
                                  onChange={(e) => updateMember(f.key, i, 'name', e.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  className="table-input"
                                  value={m.relationship}
                                  onChange={(e) => updateMember(f.key, i, 'relationship', e.target.value)}
                                  placeholder="e.g. SELF, SPOUSE, SON"
                                />
                              </td>
                              <td>
                                <input
                                  className="table-input"
                                  type="number" min="0"
                                  value={m.age}
                                  onChange={(e) => updateMember(f.key, i, 'age', e.target.value)}
                                />
                              </td>
                              <td>
                                <select
                                  className="table-input"
                                  value={m.gender}
                                  onChange={(e) => updateMember(f.key, i, 'gender', e.target.value)}
                                >
                                  <option value="">—</option>
                                  <option value="MALE">MALE</option>
                                  <option value="FEMALE">FEMALE</option>
                                  <option value="OTHER">OTHER</option>
                                </select>
                              </td>
                              <td>
                                <button type="button" className="btn-link" onClick={() => removeMember(f.key, i)}>
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button type="button" className="btn-secondary" style={{ marginTop: '0.5rem' }} onClick={() => addMember(f.key)}>
                      + Add member
                    </button>
                  </div>
                );
              }

              if (f.type === 'checkbox') {
                return (
                  <div className="field checkbox-field" key={f.key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(values[f.key])}
                        onChange={(e) => setField(f.key, e.target.checked)}
                      />
                      {' '}{f.label}
                    </label>
                  </div>
                );
              }

              if (f.type === 'select') {
                return (
                  <div className="field" key={f.key}>
                    <label>{f.label}</label>
                    <select value={values[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)}>
                      <option value="">—</option>
                      {f.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                );
              }

              return (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  <input
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    step={f.type === 'number' ? 'any' : undefined}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                </div>
              );
            })}
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-inline" onClick={handleSave}>
              Save risk details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
