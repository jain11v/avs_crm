import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';

const PAGE_SIZE = 10;

const EMPTY_NEW_CUSTOMER = {
  title: '',
  name: '',
  email: '',
  phone: '',
  address: '',
  state_id: '',
  city_id: '',
  dob: '',
};

// Name alone can't reliably identify a customer once there are thousands of
// them — many share a name, and most don't have an email on file. This picker
// opens a full-detail search modal (name, phone, address, city/state, DOB,
// masked Aadhar) so the person filling out the form can actually tell two
// "Ramesh Kumar"s apart before picking one. It also lets them add a brand
// new customer on the spot (only name is required) without leaving whatever
// they were filling out — with a check for existing customers sharing that
// name or phone number first, so it's harder to create an accidental
// duplicate.
export default function CustomerPicker({ customerId, customerLabel, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [addMode, setAddMode] = useState(false);
  const [newCustomer, setNewCustomer] = useState(EMPTY_NEW_CUSTOMER);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');
  const [duplicates, setDuplicates] = useState([]);
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);

  const load = useCallback(async (q, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/customers', { params: { q, page: p, limit: PAGE_SIZE } });
      setResults(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not search customers.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Loads whenever the modal opens or the page changes.
  useEffect(() => {
    if (!open || addMode) return;
    load(query, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page, addMode]);

  // Debounced live search as the person types inside the modal. If we're not
  // already on page 1, changing it triggers the effect above; otherwise load
  // directly since setPage(1) wouldn't cause a state change to react to.
  useEffect(() => {
    if (!open || addMode) return;
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

  useEffect(() => {
    if (!addMode) return;
    api.get('/lookups/states').then((res) => setStates(res.data));
  }, [addMode]);

  useEffect(() => {
    if (!newCustomer.state_id) {
      setCities([]);
      return;
    }
    api.get('/lookups/cities', { params: { state_id: newCustomer.state_id } }).then((res) => {
      setCities(res.data);
    });
  }, [newCustomer.state_id]);

  // Checks for an existing customer with the same name or phone number
  // while filling out the quick-add form, so it's harder to accidentally
  // create a duplicate.
  useEffect(() => {
    if (!addMode) return;
    if (newCustomer.name.trim().length < 3 && !newCustomer.phone) {
      setDuplicates([]);
      return;
    }
    const timeout = setTimeout(() => {
      api
        .get('/customers/check-duplicate', {
          params: { name: newCustomer.name.trim(), phone: newCustomer.phone || undefined },
        })
        .then((res) => setDuplicates(res.data))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timeout);
  }, [addMode, newCustomer.name, newCustomer.phone]);

  function openModal() {
    setQuery('');
    setAddMode(false);
    setOpen(true);
  }

  function openAddMode() {
    setNewCustomer(EMPTY_NEW_CUSTOMER);
    setAddError('');
    setDuplicates([]);
    setDuplicatesDismissed(false);
    setAddMode(true);
  }

  function handlePick(customer) {
    setOpen(false);
    onSelect(customer.id, customer.name);
  }

  function handleClear(e) {
    e.stopPropagation();
    onSelect(null, '');
  }

  function handleNewCustomerChange(e) {
    const { name, value } = e.target;
    if (name === 'name' || name === 'phone') {
      setDuplicatesDismissed(false);
    }
    setNewCustomer((f) => ({ ...f, [name]: value, ...(name === 'state_id' ? { city_id: '' } : {}) }));
  }

  function handleUseExisting(customer) {
    setOpen(false);
    onSelect(customer.id, customer.name);
  }

  async function handleCreateCustomer() {
    setAddError('');
    if (!newCustomer.name) {
      setAddError('Name is required.');
      return;
    }

    setAddSaving(true);
    const payload = Object.fromEntries(
      Object.entries(newCustomer).map(([k, v]) => [k, v === '' ? null : v])
    );

    try {
      const res = await api.post('/customers', payload);
      setOpen(false);
      onSelect(res.data.id, newCustomer.name);
    } catch (err) {
      setAddError(err.response?.data?.error || 'Could not create customer.');
    } finally {
      setAddSaving(false);
    }
  }

  function formatDob(dob) {
    if (!dob) return '—';
    return new Date(dob).toLocaleDateString('en-IN');
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <>
      <div className="customer-picker-trigger">
        <input
          type="text"
          readOnly
          value={customerLabel || ''}
          onClick={openModal}
          placeholder="Click to search by name, phone, or address…"
        />
        {customerId ? (
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
              <h3>{addMode ? 'Add new customer' : 'Select customer'}</h3>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="modal-body">
              {addMode ? (
                <>
                  {addError && <div className="form-error">{addError}</div>}

                  {!duplicatesDismissed && duplicates.length > 0 && (
                    <div className="form-error" style={{ background: '#fdf3e2', borderColor: '#f0dfa9', color: '#92620c' }}>
                      <strong>Possible match found</strong> — this person may already be in the system.
                      <table className="data-table" style={{ marginTop: '0.6rem' }}>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Address</th>
                            <th>City / State</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {duplicates.map((d) => (
                            <tr key={d.id}>
                              <td>{d.title ? `${d.title} ` : ''}{d.name}</td>
                              <td>{d.phone || '—'}</td>
                              <td>{d.address || '—'}</td>
                              <td>{d.city_name ? `${d.city_name}, ${d.state_name}` : '—'}</td>
                              <td>
                                <button type="button" className="btn-link" onClick={() => handleUseExisting(d)}>
                                  Use this one
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <button type="button" className="btn-link" style={{ marginTop: '0.6rem' }} onClick={() => setDuplicatesDismissed(true)}>
                        None of these — continue creating new
                      </button>
                    </div>
                  )}

                  <div className="form-grid">
                    <div className="field">
                      <label>Title</label>
                      <select name="title" value={newCustomer.title} onChange={handleNewCustomerChange}>
                        <option value="">—</option>
                        <option value="Mr.">Mr.</option>
                        <option value="Ms.">Ms.</option>
                        <option value="Mrs.">Mrs.</option>
                        <option value="M/s">M/s</option>
                      </select>
                    </div>
                    <div className="field field-wide">
                      <label>Name *</label>
                      <input name="name" value={newCustomer.name} onChange={handleNewCustomerChange} />
                    </div>
                    <div className="field">
                      <label>Email</label>
                      <input type="email" name="email" value={newCustomer.email} onChange={handleNewCustomerChange} />
                    </div>
                    <div className="field">
                      <label>Phone</label>
                      <input
                        name="phone"
                        value={newCustomer.phone}
                        onChange={handleNewCustomerChange}
                        placeholder="9876543210"
                        maxLength={10}
                      />
                    </div>
                    <div className="field">
                      <label>Date of birth</label>
                      <input type="date" name="dob" value={newCustomer.dob} onChange={handleNewCustomerChange} />
                    </div>
                    <div className="field field-wide">
                      <label>Address</label>
                      <input name="address" value={newCustomer.address} onChange={handleNewCustomerChange} />
                    </div>
                    <div className="field">
                      <label>State</label>
                      <select name="state_id" value={newCustomer.state_id} onChange={handleNewCustomerChange}>
                        <option value="">—</option>
                        {states.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>City</label>
                      <select
                        name="city_id" value={newCustomer.city_id} onChange={handleNewCustomerChange}
                        disabled={!newCustomer.state_id}
                      >
                        <option value="">—</option>
                        {cities.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button type="button" className="btn-secondary" onClick={() => setAddMode(false)}>
                      Back to search
                    </button>
                    <button type="button" className="btn-primary btn-inline" onClick={handleCreateCustomer} disabled={addSaving}>
                      {addSaving ? 'Creating…' : 'Create & select'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <input
                      type="text"
                      className="modal-search-input"
                      style={{ marginBottom: 0, flex: 1 }}
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name, phone, email, or address / city / state…"
                    />
                    <button type="button" className="btn-secondary" onClick={openAddMode}>
                      + Add new customer
                    </button>
                  </div>

                  {error && <div className="form-error">{error}</div>}

                  {loading ? (
                    <p className="subtitle">Searching…</p>
                  ) : results.length === 0 ? (
                    <p className="subtitle">No matching customers.</p>
                  ) : (
                    <div className="modal-table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Address</th>
                            <th>City / State</th>
                            <th>DOB</th>
                            <th>Aadhar</th>
                            <th>Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((c) => (
                            <tr key={c.id} className="selectable-row" onClick={() => handlePick(c)}>
                              <td>{c.title ? `${c.title} ` : ''}{c.name}</td>
                              <td>{c.phone || '—'}</td>
                              <td>{c.address || '—'}</td>
                              <td>{c.city_name ? `${c.city_name}, ${c.state_name}` : '—'}</td>
                              <td>{formatDob(c.dob)}</td>
                              <td>{c.aadhar_masked || '—'}</td>
                              <td>{c.type_of_customer || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {total > PAGE_SIZE && (
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
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
