import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import Layout from '../components/Layout';
import CommissionReceiptModal from '../components/CommissionReceiptModal';
import CommissionStatementModal from '../components/CommissionStatementModal';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'received', label: 'Received' },
];

export default function CommissionReconciliation() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [insurers, setInsurers] = useState([]);
  const [insurerBranches, setInsurerBranches] = useState([]);
  const [brokerBranches, setBrokerBranches] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);

  const [insurerId, setInsurerId] = useState('');
  const [insurerBranchId, setInsurerBranchId] = useState('');
  const [brokerBranchId, setBrokerBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  const [receiptPolicy, setReceiptPolicy] = useState(null);
  const [statementModalOpen, setStatementModalOpen] = useState(false);
  const [statements, setStatements] = useState([]);

  const loadStatements = useCallback(async () => {
    try {
      const res = await api.get('/commission-reconciliation/statements');
      setStatements(res.data.data);
    } catch {
      // Non-critical — the main table is the important part of this page.
    }
  }, []);

  useEffect(() => {
    loadStatements();
  }, [loadStatements]);

  useEffect(() => {
    api.get('/lookups/insurers').then((res) => setInsurers(res.data));
    api.get('/lookups/branches').then((res) => setBrokerBranches(res.data));
    api.get('/lookups/bank-accounts').then((res) => setBankAccounts(res.data));
  }, []);

  useEffect(() => {
    if (!insurerId) {
      setInsurerBranches([]);
      setInsurerBranchId('');
      return;
    }
    api.get('/lookups/insurer-branches', { params: { insurer_id: insurerId } }).then((res) => {
      setInsurerBranches(res.data);
    });
  }, [insurerId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/commission-reconciliation', {
        params: {
          insurer_id: insurerId || undefined,
          insurer_branch_id: insurerBranchId || undefined,
          issued_from_branch_id: brokerBranchId || undefined,
          status: status || undefined,
          from: from || undefined,
          to: to || undefined,
          search: search || undefined,
        },
      });
      setRows(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load commission reconciliation.');
    } finally {
      setLoading(false);
    }
  }, [insurerId, insurerBranchId, brokerBranchId, status, from, to, search]);

  useEffect(() => {
    load();
  }, [load]);

  function handleFilterSubmit(e) {
    e.preventDefault();
    load();
  }

  async function handleExport() {
    setError('');
    try {
      const res = await api.get('/commission-reconciliation/export.csv', {
        params: {
          insurer_id: insurerId || undefined,
          insurer_branch_id: insurerBranchId || undefined,
          issued_from_branch_id: brokerBranchId || undefined,
          status: status || undefined,
          from: from || undefined,
          to: to || undefined,
          search: search || undefined,
        },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `commission-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not export.');
    }
  }

  async function handleSaveReceipt(values) {
    try {
      await api.post(`/commission-reconciliation/${receiptPolicy.policy_id}/receipt`, values);
      setReceiptPolicy(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the receipt.');
    }
  }

  async function handleRemoveReceipt() {
    try {
      await api.delete(`/commission-reconciliation/${receiptPolicy.policy_id}/receipt`);
      setReceiptPolicy(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove the receipt.');
    }
  }

  function formatMoney(n) {
    if (n === null || n === undefined) return '—';
    return `₹${Number(n).toLocaleString('en-IN')}`;
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN');
  }

  const groups = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = `${r.insurer_id ?? 'none'}|${r.insurer_branch_id ?? 'none'}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          insurerName: r.insurer_name || '—',
          insurerBranchName: r.insurer_branch_name || '—',
          rows: [],
          expectedTotal: 0,
          receivedTotal: 0,
        });
      }
      const g = map.get(key);
      g.rows.push(r);
      g.expectedTotal += Number(r.expected_total) || 0;
      g.receivedTotal += Number(r.received_amount) || 0;
    }
    return Array.from(map.values()).sort((a, b) => a.insurerName.localeCompare(b.insurerName));
  }, [rows]);

  const grandExpected = rows.reduce((sum, r) => sum + (Number(r.expected_total) || 0), 0);
  const grandReceived = rows.reduce((sum, r) => sum + (Number(r.received_amount) || 0), 0);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Commission reconciliation</h2>
          <p className="subtitle">
            {rows.length} polic{rows.length === 1 ? 'y' : 'ies'} — expected {formatMoney(grandExpected)}, received {formatMoney(grandReceived)}
          </p>
        </div>
      </div>

      <form className="filter-bar" onSubmit={handleFilterSubmit} style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <select value={insurerId} onChange={(e) => setInsurerId(e.target.value)}>
          <option value="">All insurers</option>
          {insurers.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>

        <select value={insurerBranchId} onChange={(e) => setInsurerBranchId(e.target.value)} disabled={!insurerId}>
          <option value="">All insurer branches</option>
          {insurerBranches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <select value={brokerBranchId} onChange={(e) => setBrokerBranchId(e.target.value)}>
          <option value="">All broker branches</option>
          {brokerBranches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Policy start from" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Policy start to" />

        <input
          type="text"
          placeholder="Search policy # or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <button type="submit" className="btn-secondary">Filter</button>
        <button type="button" className="btn-secondary" onClick={handleExport}>Export CSV</button>
        <button type="button" className="btn-primary btn-inline" onClick={() => setStatementModalOpen(true)}>
          Import statement
        </button>
      </form>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No policies match these filters.</p>
      ) : (
        groups.map((g) => (
          <div key={g.key} style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '0.25rem' }}>
              {g.insurerName}{g.insurerBranchName !== '—' ? ` — ${g.insurerBranchName}` : ''}
            </h3>
            <p className="subtitle" style={{ marginTop: 0 }}>
              Expected {formatMoney(g.expectedTotal)} · Received {formatMoney(g.receivedTotal)} · Variance {formatMoney(g.expectedTotal - g.receivedTotal)}
            </p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Policy #</th>
                  <th>Customer</th>
                  <th>Broker branch</th>
                  <th>Premium</th>
                  <th>Brok % / TP % / Reward %</th>
                  <th>Expected</th>
                  <th>Received</th>
                  <th>Variance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.policy_id}>
                    <td>{r.policy_number}</td>
                    <td>{r.customer_name}</td>
                    <td>{r.broker_branch_name || '—'}</td>
                    <td>{formatMoney(r.premium_amount)}</td>
                    <td>{r.brok_percent ?? '—'}% / {r.tp_brok_percent ?? '—'}% / {r.reward_percent ?? '—'}%</td>
                    <td>
                      {r.commission_status && r.commission_status !== 'approved' ? (
                        <span style={{ color: r.commission_status === 'rejected' ? '#b91c1c' : '#b45309' }}>
                          {r.commission_status === 'rejected' ? 'Commission rejected' : 'Awaiting approval'}
                        </span>
                      ) : (
                        formatMoney(r.expected_total)
                      )}
                    </td>
                    <td>
                      {r.received_amount === null ? (
                        <span style={{ color: '#b45309' }}>Pending</span>
                      ) : (
                        <>
                          {formatMoney(r.received_amount)}
                          <div className="subtitle" style={{ margin: 0 }}>{formatDate(r.received_date)}</div>
                        </>
                      )}
                    </td>
                    <td style={{ color: r.variance === null ? undefined : Number(r.variance) === 0 ? '#15803d' : '#b45309' }}>
                      {r.variance === null ? '—' : formatMoney(r.variance)}
                    </td>
                    <td>
                      {r.commission_status && r.commission_status !== 'approved' ? (
                        <Link to={`/policies/${r.policy_id}/edit`} className="btn-link">Review</Link>
                      ) : (
                        <button type="button" className="btn-link" onClick={() => setReceiptPolicy(r)}>
                          {r.receipt_id ? 'Edit' : 'Mark received'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {statements.length > 0 && (
        <>
          <h3>Imported statements</h3>
          <table className="data-table" style={{ marginBottom: '2rem' }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Insurer</th>
                <th>File</th>
                <th>Reference</th>
                <th>Policies matched</th>
                <th>Total</th>
                <th>Uploaded by</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => (
                <tr key={s.id}>
                  <td>{formatDate(s.created_at)}</td>
                  <td>{s.insurer_name || '—'}</td>
                  <td>{s.filename || '—'}</td>
                  <td>{s.reference_id || '—'}</td>
                  <td>{s.matched_count}</td>
                  <td>{formatMoney(s.total_amount)}</td>
                  <td>{s.uploaded_by_first_name ? `${s.uploaded_by_first_name} ${s.uploaded_by_last_name || ''}`.trim() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <CommissionReceiptModal
        open={Boolean(receiptPolicy)}
        policy={receiptPolicy}
        bankAccounts={bankAccounts}
        onClose={() => setReceiptPolicy(null)}
        onSave={handleSaveReceipt}
        onRemove={handleRemoveReceipt}
      />

      <CommissionStatementModal
        open={statementModalOpen}
        insurers={insurers}
        bankAccounts={bankAccounts}
        onClose={() => setStatementModalOpen(false)}
        onImported={() => {
          load();
          loadStatements();
        }}
      />
    </Layout>
  );
}
