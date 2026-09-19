import { useEffect, useState } from 'react';

// A policy's premium is never typed in directly — it's built from one or
// more coverage rows (e.g. Own Damage, Third Party, Personal Accident),
// each with its own premium and GST%. This modal is the only place those
// rows are edited; PolicyForm just displays the total they add up to.

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeRow(row) {
  const prem = Number(row.prem) || 0;
  const gstPercent = Number(row.gst_percent) || 0;
  const gst = round2(prem * (gstPercent / 100));
  return { prem, gstPercent, gst, final: round2(prem + gst) };
}

export function computeNetPremium(rows) {
  return round2(rows.reduce((sum, r) => sum + computeRow(r).final, 0));
}

const EMPTY_ROW = { coverage: '', sum_insured: '', prem_rate: '', prem: '', gst_percent: '', is_third_party: false };

export default function PremiumsModal({ open, initialRows, onClose, onSave }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRows(initialRows.length > 0 ? initialRows.map((r) => ({ ...r })) : [{ ...EMPTY_ROW }]);
    setError('');
  }, [open, initialRows]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function updateRow(index, field, value) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, { ...EMPTY_ROW }]);
  }

  function removeRow(index) {
    setRows((rs) => rs.filter((_, i) => i !== index));
  }

  function handleSave() {
    if (rows.length === 0) {
      setError('Add at least one premium coverage.');
      return;
    }
    for (const r of rows) {
      if (!r.coverage || !r.coverage.trim()) {
        setError('Each row needs a coverage name.');
        return;
      }
      const prem = Number(r.prem);
      if (r.prem === '' || r.prem === null || !Number.isFinite(prem) || prem < 0) {
        setError(`Enter a valid premium amount for "${r.coverage}".`);
        return;
      }
    }
    onSave(rows);
  }

  const netPremium = computeNetPremium(rows);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Premium coverages</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="modal-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Coverage *</th>
                  <th>Sum insured</th>
                  <th>Rate</th>
                  <th>Premium *</th>
                  <th>GST %</th>
                  <th>GST</th>
                  <th>Final</th>
                  <th title="Third Party — this row's premium is commissioned at the TP brokerage rate">TP</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const computed = computeRow(row);
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          className="table-input"
                          value={row.coverage}
                          onChange={(e) => updateRow(i, 'coverage', e.target.value)}
                          placeholder="e.g. Own Damage"
                        />
                      </td>
                      <td>
                        <input
                          className="table-input"
                          type="number" step="0.01" min="0"
                          value={row.sum_insured}
                          onChange={(e) => updateRow(i, 'sum_insured', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="table-input"
                          value={row.prem_rate || ''}
                          onChange={(e) => updateRow(i, 'prem_rate', e.target.value)}
                          placeholder="optional"
                        />
                      </td>
                      <td>
                        <input
                          className="table-input"
                          type="number" step="0.01" min="0"
                          value={row.prem}
                          onChange={(e) => updateRow(i, 'prem', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="table-input"
                          type="number" step="0.01" min="0"
                          value={row.gst_percent}
                          onChange={(e) => updateRow(i, 'gst_percent', e.target.value)}
                        />
                      </td>
                      <td>₹{computed.gst.toLocaleString('en-IN')}</td>
                      <td>₹{computed.final.toLocaleString('en-IN')}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(row.is_third_party)}
                          onChange={(e) => updateRow(i, 'is_third_party', e.target.checked)}
                        />
                      </td>
                      <td>
                        <button type="button" className="btn-link" onClick={() => removeRow(i)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="form-actions" style={{ justifyContent: 'space-between', marginTop: '1rem' }}>
            <button type="button" className="btn-secondary" onClick={addRow}>
              + Add coverage
            </button>
            <strong>Net premium: ₹{netPremium.toLocaleString('en-IN')}</strong>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-inline" onClick={handleSave}>
              Save premiums
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
