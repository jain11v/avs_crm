import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 10;

export default function PolicyPicker({ policyId, policyLabel, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchRequired, setSearchRequired] = useState(false);
  // Non-admins get at most 10 results and no paging — enforced by the
  // backend, see utils/restrictedSearch.js.
  const isAdmin = useAuth().employee?.role === 'admin';

  const load = useCallback(async (q, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/policies', { params: { q, page: p, limit: PAGE_SIZE } });
      setResults(res.data.data);
      setTotal(res.data.total);
      setSearchRequired(!!res.data.search_required);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not search policies.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load(query, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page]);

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      if (page !== 1) {
        setPage(1);
      } else {
        load(query, 1);
      }
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  function openModal() {
    setQuery('');
    setOpen(true);
  }

  function handlePick(policy) {
    setOpen(false);
    onSelect(policy.id, `${policy.policy_number} — ${policy.customer_name || ''}`);
  }

  function handleClear(e) {
    e.stopPropagation();
    onSelect(null, '');
  }

  function formatMoney(n) {
    if (n === null || n === undefined) return '—';
    return `₹${Number(n).toLocaleString('en-IN')}`;
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <>
      <div className="customer-picker-trigger">
        <input
          type="text"
          readOnly
          value={policyLabel || ''}
          onClick={openModal}
          placeholder="Click to search by policy number or customer…"
        />
        {policyId ? (
          <>
            <button type="button" className="btn-secondary" onClick={openModal}>Change</button>
            <button type="button" className="btn-link" onClick={handleClear}>Clear</button>
          </>
        ) : (
          <button type="button" className="btn-secondary" onClick={openModal}>Search</button>
        )}
      </div>

      {open && (
        <div className="modal-overlay" onMouseDown={() => setOpen(false)}>
          <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Select policy</h3>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="modal-body">
              <input
                type="text"
                className="modal-search-input"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by policy number or customer name…"
              />

              {error && <div className="form-error">{error}</div>}

              {loading ? (
                <p className="subtitle">Searching…</p>
              ) : searchRequired ? (
                <p className="subtitle">Type at least 3 characters to search policies.</p>
              ) : results.length === 0 ? (
                <p className="subtitle">No matching policies.</p>
              ) : (
                <div className="modal-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Policy #</th>
                        <th>Customer</th>
                        <th>Insurer</th>
                        <th>Premium</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((p) => (
                        <tr key={p.id} className="selectable-row" onClick={() => handlePick(p)}>
                          <td>{p.policy_number}</td>
                          <td>{p.customer_name || '—'}</td>
                          <td>{p.insurer_name || '—'}</td>
                          <td>{formatMoney(p.premium_amount)}</td>
                          <td>{p.status || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!isAdmin && total > results.length && (
                <p className="subtitle">Showing {results.length} of {total} matches — refine your search to narrow it down.</p>
              )}

              {isAdmin && total > PAGE_SIZE && (
                <div className="pagination">
                  <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary">
                    Previous
                  </button>
                  <span>Page {page} of {totalPages} ({total} matches)</span>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-secondary">
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
