import { useState } from 'react';
import api from '../api/axios';

// Upload → map columns → review matches → confirm. An insurer statement
// covers many policies in one payout; this matches each row against the
// system's expected commission (same formula as the per-policy screen)
// before anything is written, so the user reviews before committing.

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const MAPPING_FIELDS = [
  { key: 'policy_number', label: 'Policy number', required: true },
  { key: 'amount', label: 'Commission amount', required: true },
  { key: 'reference', label: 'Reference / row ref', required: false },
];

export default function CommissionStatementModal({ open, insurers, bankAccounts, onClose, onImported }) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [file, setFile] = useState(null);
  const [insurerId, setInsurerId] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({ policy_number: '', amount: '', reference: '' });

  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [bankAccountId, setBankAccountId] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [receivedDate, setReceivedDate] = useState(todayIsoDate());
  const [remarks, setRemarks] = useState('');
  const [importSummary, setImportSummary] = useState(null);

  if (!open) return null;

  function reset() {
    setStep(1);
    setError('');
    setFile(null);
    setInsurerId('');
    setHeaders([]);
    setRawRows([]);
    setMapping({ policy_number: '', amount: '', reference: '' });
    setResults([]);
    setSelected(new Set());
    setBankAccountId('');
    setReferenceId('');
    setRemarks('');
    setImportSummary(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleParse() {
    if (!file) {
      setError('Choose a CSV or Excel file first.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/commission-reconciliation/statements/parse', formData);
      setHeaders(res.data.headers);
      setRawRows(res.data.rows);
      // Guess obvious column matches so the user usually just confirms.
      const guess = (patterns) => res.data.headers.findIndex((h) => patterns.some((p) => h.toLowerCase().includes(p)));
      setMapping({
        policy_number: String(guess(['policy no', 'policy number', 'policy_no', 'policyno'])),
        amount: String(guess(['commission', 'net amount', 'amount'])),
        reference: String(guess(['reference', 'remark', 'particulars'])),
      });
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not read that file.');
    } finally {
      setLoading(false);
    }
  }

  async function handleMatch() {
    if (mapping.policy_number === '' || mapping.policy_number === '-1' || mapping.amount === '' || mapping.amount === '-1') {
      setError('Map both Policy number and Commission amount to a column.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/commission-reconciliation/statements/match', {
        rows: rawRows,
        mapping: {
          policy_number: Number(mapping.policy_number),
          amount: Number(mapping.amount),
          ...(mapping.reference !== '' && mapping.reference !== '-1' ? { reference: Number(mapping.reference) } : {}),
        },
      });
      setResults(res.data.results);
      setSelected(new Set(res.data.results.map((r, i) => (r.matched ? i : null)).filter((i) => i !== null)));
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not match that statement.');
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(i) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  async function handleImport() {
    if (!bankAccountId) {
      setError('Select the account the commission was received into.');
      return;
    }
    const rows = results
      .map((r, i) => ({ ...r, i }))
      .filter((r) => selected.has(r.i) && r.matched)
      .map((r) => ({ policy_id: r.policy_id, amount: r.statement_amount, reference: r.reference || undefined }));

    if (rows.length === 0) {
      setError('Select at least one matched row to import.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await api.post('/commission-reconciliation/statements/import', {
        insurer_id: insurerId || undefined,
        bank_account_id: bankAccountId,
        reference_id: referenceId || undefined,
        remarks: remarks || undefined,
        filename: file?.name,
        received_date: receivedDate,
        rows,
      });
      setImportSummary(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not import this statement.');
    } finally {
      setLoading(false);
    }
  }

  function handleDone() {
    onImported();
    handleClose();
  }

  const matchedCount = results.filter((r) => r.matched).length;
  const selectedTotal = results
    .map((r, i) => ({ ...r, i }))
    .filter((r) => selected.has(r.i) && r.matched)
    .reduce((sum, r) => sum + (Number(r.statement_amount) || 0), 0);

  return (
    <div className="modal-overlay" onMouseDown={handleClose}>
      <div className="modal-panel" style={{ maxWidth: '900px' }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Import commission statement</h3>
          <button type="button" className="modal-close" onClick={handleClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          {step === 1 && (
            <>
              <p className="subtitle" style={{ marginTop: 0 }}>
                Upload the insurer's payout statement (CSV or Excel) — one row per policy.
              </p>
              <div className="form-grid">
                <div className="field">
                  <label>Insurer (optional, for record-keeping)</label>
                  <select value={insurerId} onChange={(e) => setInsurerId(e.target.value)}>
                    <option value="">—</option>
                    {insurers.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>File</label>
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files[0] || null)} />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={handleClose}>Cancel</button>
                <button type="button" className="btn-primary btn-inline" onClick={handleParse} disabled={loading}>
                  {loading ? 'Reading…' : 'Next'}
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="subtitle" style={{ marginTop: 0 }}>
                {rawRows.length} row{rawRows.length === 1 ? '' : 's'} found. Match each field to a column from the file.
              </p>
              <div className="form-grid">
                {MAPPING_FIELDS.map((f) => (
                  <div className="field" key={f.key}>
                    <label>{f.label}{f.required ? ' *' : ''}</label>
                    <select
                      value={mapping[f.key]}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                    >
                      <option value="-1">—</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {rawRows.length > 0 && (
                <div className="modal-table-wrap" style={{ marginTop: '1rem' }}>
                  <table className="data-table">
                    <thead>
                      <tr>{headers.map((h, i) => <th key={i}>{h || `Column ${i + 1}`}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rawRows.slice(0, 5).map((row, i) => (
                        <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setStep(1)}>Back</button>
                <button type="button" className="btn-primary btn-inline" onClick={handleMatch} disabled={loading}>
                  {loading ? 'Matching…' : 'Match'}
                </button>
              </div>
            </>
          )}

          {step === 3 && !importSummary && (
            <>
              <p className="subtitle" style={{ marginTop: 0 }}>
                {matchedCount} of {results.length} rows matched a policy. Unmatched rows are shown for reference and can't be imported.
              </p>

              <div className="modal-table-wrap" style={{ maxHeight: '320px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Policy #</th>
                      <th>Customer</th>
                      <th>Statement amount</th>
                      <th>Expected</th>
                      <th>Variance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} style={{ opacity: r.matched ? 1 : 0.55 }}>
                        <td>
                          {r.matched && (
                            <input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)} />
                          )}
                        </td>
                        <td>{r.policy_number || '—'}</td>
                        <td>{r.customer_name || '—'}</td>
                        <td>₹{Number(r.statement_amount || 0).toLocaleString('en-IN')}</td>
                        <td>{r.matched ? `₹${Number(r.expected_total).toLocaleString('en-IN')}` : '—'}</td>
                        <td style={{ color: r.matched && Number(r.variance) !== 0 ? '#b45309' : undefined }}>
                          {r.matched ? `₹${Number(r.variance).toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td>
                          {r.matched
                            ? (r.already_received ? 'Will replace existing receipt' : 'OK')
                            : r.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="subtitle" style={{ marginTop: '0.6rem' }}>
                {selected.size} selected — total ₹{selectedTotal.toLocaleString('en-IN')}
              </p>

              <div className="form-grid" style={{ marginTop: '0.5rem' }}>
                <div className="field">
                  <label>Received into account *</label>
                  <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                    <option value="">—</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Received date</label>
                  <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
                </div>
                <div className="field">
                  <label>Statement reference no.</label>
                  <input value={referenceId} onChange={(e) => setReferenceId(e.target.value)} maxLength={100} />
                </div>
                <div className="field field-wide">
                  <label>Remarks</label>
                  <input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={255} />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setStep(2)}>Back</button>
                <button type="button" className="btn-primary btn-inline" onClick={handleImport} disabled={loading}>
                  {loading ? 'Importing…' : `Import ${selected.size} receipt${selected.size === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}

          {importSummary && (
            <>
              <p>
                Imported {importSummary.imported} receipt{importSummary.imported === 1 ? '' : 's'}
                {importSummary.failed > 0 ? `, ${importSummary.failed} failed` : ''}.
              </p>
              {importSummary.failures?.length > 0 && (
                <ul>
                  {importSummary.failures.map((f, i) => (
                    <li key={i}>Policy {f.policy_id}: {f.error}</li>
                  ))}
                </ul>
              )}
              <div className="form-actions">
                <button type="button" className="btn-primary btn-inline" onClick={handleDone}>Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
