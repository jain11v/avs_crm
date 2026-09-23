import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatMoney(n) {
  if (n === null || n === undefined) return '—';
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

export default function Payroll() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({}); // { [id]: { deduction, bank_account_id, head_id } }
  const [bankAccounts, setBankAccounts] = useState([]);
  const [heads, setHeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/lookups/bank-accounts').then((res) => setBankAccounts(res.data));
    api.get('/lookups/heads').then((res) => setHeads(res.data));
  }, []);

  const load = useCallback(async (m) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/payroll', { params: { month: m } });
      setRows(res.data.data);
      setEdits(Object.fromEntries(res.data.data.map((r) => [
        r.id,
        { deduction: r.deduction, bank_account_id: r.bank_account_id || '', head_id: r.head_id || '' },
      ])));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load payroll.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(month); }, [month, load]);

  function handleEditChange(id, field, value) {
    setEdits((e) => ({ ...e, [id]: { ...e[id], [field]: value } }));
  }

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      const res = await api.post('/payroll/generate', { month });
      await load(month);
      if (res.data.created === 0) {
        alert('Nothing new to generate — every active salaried employee already has a payroll entry for this month.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not generate payroll.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveDeduction(row) {
    const edit = edits[row.id];
    try {
      await api.put(`/payroll/${row.id}`, { deduction: edit.deduction });
      load(month);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not save this change.');
    }
  }

  async function handlePay(row) {
    const edit = edits[row.id];
    if (!edit.bank_account_id || !edit.head_id) {
      alert('Choose a bank account and a head before marking this paid.');
      return;
    }
    if (!window.confirm(`Pay ${formatMoney(row.net_amount)} to ${row.first_name} ${row.last_name}?`)) return;
    try {
      await api.patch(`/payroll/${row.id}/pay`, { bank_account_id: edit.bank_account_id, head_id: edit.head_id });
      load(month);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not mark this paid.');
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Remove ${row.first_name} ${row.last_name}'s draft payroll entry for this month?`)) return;
    try {
      await api.delete(`/payroll/${row.id}`);
      load(month);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete this entry.');
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Payroll</h2>
          <p className="subtitle">{rows.length} entr{rows.length === 1 ? 'y' : 'ies'} for this month</p>
        </div>
      </div>

      <div className="filter-bar">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button type="button" className="btn-primary btn-inline" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating…' : 'Generate payroll'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No payroll entries for this month yet — click "Generate payroll" to create one per active employee.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Base salary</th>
              <th>Unpaid leave days</th>
              <th>Deduction</th>
              <th>Net amount</th>
              <th>Bank account</th>
              <th>Head</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const edit = edits[r.id] || {};
              const isDraft = r.status === 'draft';
              return (
                <tr key={r.id}>
                  <td>{r.first_name} {r.last_name}</td>
                  <td>{formatMoney(r.base_salary)}</td>
                  <td>{r.unpaid_leave_days}</td>
                  <td>
                    {isDraft ? (
                      <input
                        type="number" step="0.01" min="0" className="table-input"
                        value={edit.deduction ?? ''}
                        onChange={(ev) => handleEditChange(r.id, 'deduction', ev.target.value)}
                        onBlur={() => handleSaveDeduction(r)}
                      />
                    ) : formatMoney(r.deduction)}
                  </td>
                  <td>{formatMoney(r.net_amount)}</td>
                  <td>
                    {isDraft ? (
                      <select className="table-input" value={edit.bank_account_id || ''} onChange={(ev) => handleEditChange(r.id, 'bank_account_id', ev.target.value)}>
                        <option value="">—</option>
                        {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>)}
                      </select>
                    ) : (r.bank_account_name || '—')}
                  </td>
                  <td>
                    {isDraft ? (
                      <select className="table-input" value={edit.head_id || ''} onChange={(ev) => handleEditChange(r.id, 'head_id', ev.target.value)}>
                        <option value="">—</option>
                        {heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                      </select>
                    ) : (r.head_name || '—')}
                  </td>
                  <td>
                    <span className={`status-pill status-${r.status === 'paid' ? 'approved' : 'pending'}`}>{r.status}</span>
                  </td>
                  <td>
                    {isDraft && (
                      <>
                        <button className="btn-link" onClick={() => handlePay(r)}>Mark paid</button>
                        {' · '}
                        <button className="btn-link" onClick={() => handleDelete(r)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
