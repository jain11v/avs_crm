import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';
import AttendanceEditModal from '../components/AttendanceEditModal';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 30;
const MARK_STATUSES = ['half_day', 'leave', 'absent'];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN');
}

function rosterStatusLabel(row, date) {
  if (row.status) return row.status.replace('_', ' ');
  return date === todayIsoDate() ? 'Not checked in yet' : 'No record';
}

export default function Attendance() {
  const { employee } = useAuth();
  const isManager = employee?.role === 'admin' || employee?.role === 'manager';

  const [today, setToday] = useState(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [markDate, setMarkDate] = useState(todayIsoDate());
  const [markStatus, setMarkStatus] = useState('leave');
  const [markRemarks, setMarkRemarks] = useState('');

  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [month, setMonth] = useState(todayIsoDate().slice(0, 7));
  const [summaryRows, setSummaryRows] = useState([]);

  const [rosterDate, setRosterDate] = useState(todayIsoDate());
  const [rosterRows, setRosterRows] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(true);

  const [editRecord, setEditRecord] = useState(null);

  const loadToday = useCallback(async () => {
    setTodayLoading(true);
    try {
      const res = await api.get('/attendance/today');
      setToday(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load today’s attendance.');
    } finally {
      setTodayLoading(false);
    }
  }, []);

  const loadList = useCallback(async (p) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/attendance', {
        params: { employee_id: employeeId || undefined, from: from || undefined, to: to || undefined, page: p, limit: PAGE_SIZE },
      });
      setRows(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load attendance.');
    } finally {
      setLoading(false);
    }
  }, [employeeId, from, to]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await api.get('/attendance/summary', { params: { month, employee_id: employeeId || undefined } });
      setSummaryRows(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the monthly summary.');
    }
  }, [month, employeeId]);

  const loadRoster = useCallback(async () => {
    if (!isManager) return;
    setRosterLoading(true);
    try {
      const res = await api.get('/attendance/roster', { params: { date: rosterDate } });
      setRosterRows(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the attendance roster.');
    } finally {
      setRosterLoading(false);
    }
  }, [isManager, rosterDate]);

  useEffect(() => {
    loadToday();
    if (isManager) {
      api.get('/lookups/employees').then((res) => setEmployees(res.data));
    }
  }, [loadToday, isManager]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    loadList(page);
  }, [page, loadList]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  async function handleCheckIn() {
    setError('');
    try {
      await api.post('/attendance/check-in');
      loadToday();
      loadList(page);
      loadRoster();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not check in.');
    }
  }

  async function handleCheckOut() {
    setError('');
    try {
      await api.post('/attendance/check-out');
      loadToday();
      loadList(page);
      loadRoster();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not check out.');
    }
  }

  async function handleMark(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/attendance/mark', { date: markDate, status: markStatus, remarks: markRemarks || null });
      setMarkRemarks('');
      if (markDate === todayIsoDate()) loadToday();
      loadList(page);
      loadSummary();
      loadRoster();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not mark attendance.');
    }
  }

  function handleFilterSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadList(1);
  }

  async function handleSaveEdit(values) {
    try {
      await api.put(`/attendance/${editRecord.id}`, values);
      setEditRecord(null);
      loadList(page);
      loadSummary();
      loadToday();
      loadRoster();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the correction.');
    }
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Attendance</h2>
          <p className="subtitle">Check in and out, or mark a day directly.</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="field">
          <label>Today</label>
          {todayLoading ? (
            <p className="subtitle" style={{ marginTop: '0.4rem' }}>Loading…</p>
          ) : !today || !today.check_in_time ? (
            <button type="button" className="btn-primary btn-inline" onClick={handleCheckIn}>
              Check in
            </button>
          ) : !today.check_out_time ? (
            <>
              <p className="subtitle" style={{ margin: '0.2rem 0 0.5rem' }}>Checked in at {formatTime(today.check_in_time)}</p>
              <button type="button" className="btn-primary btn-inline" onClick={handleCheckOut}>
                Check out
              </button>
            </>
          ) : (
            <p className="subtitle" style={{ marginTop: '0.4rem' }}>
              {formatTime(today.check_in_time)} – {formatTime(today.check_out_time)}
            </p>
          )}
        </div>

        <div className="field field-wide">
          <label>Mark a day (half-day / leave / absent)</label>
          <form onSubmit={handleMark} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" value={markDate} onChange={(e) => setMarkDate(e.target.value)} max={todayIsoDate()} />
            <select value={markStatus} onChange={(e) => setMarkStatus(e.target.value)}>
              {MARK_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
            <input
              type="text" placeholder="Remarks (optional)" value={markRemarks}
              onChange={(e) => setMarkRemarks(e.target.value)} maxLength={255}
              style={{ flex: 1, minWidth: '160px' }}
            />
            <button type="submit" className="btn-secondary">Mark</button>
          </form>
        </div>
      </div>

      {isManager && (
        <>
          <h3>Roster</h3>
          <div className="filter-bar">
            <input type="date" value={rosterDate} onChange={(e) => setRosterDate(e.target.value)} max={todayIsoDate()} />
          </div>
          {rosterLoading ? (
            <p className="subtitle">Loading…</p>
          ) : rosterRows.length === 0 ? (
            <p className="subtitle">No active employees.</p>
          ) : (
            <table className="data-table" style={{ marginBottom: '2rem' }}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rosterRows.map((r) => (
                  <tr key={r.employee_id}>
                    <td>{r.first_name} {r.last_name}</td>
                    <td>{formatTime(r.check_in_time)}</td>
                    <td>{formatTime(r.check_out_time)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{rosterStatusLabel(r, rosterDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <h3>Monthly summary</h3>
      <div className="filter-bar">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        {isManager && (
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        )}
      </div>
      <table className="data-table" style={{ marginBottom: '2rem' }}>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Present</th>
            <th>Half-day</th>
            <th>Leave</th>
            <th>Absent</th>
          </tr>
        </thead>
        <tbody>
          {summaryRows.length === 0 ? (
            <tr><td colSpan={5} className="subtitle">No records this month.</td></tr>
          ) : (
            summaryRows.map((r) => (
              <tr key={r.employee_id}>
                <td>{r.first_name} {r.last_name}</td>
                <td>{r.present_count}</td>
                <td>{r.half_day_count}</td>
                <td>{r.leave_count}</td>
                <td>{r.absent_count}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h3>Daily records</h3>
      <form className="filter-bar" onSubmit={handleFilterSubmit}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From date" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To date" />
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="subtitle">No attendance records found.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                {isManager && <th>Employee</th>}
                <th>Status</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Remarks</th>
                {isManager && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  {isManager && <td>{r.first_name} {r.last_name}</td>}
                  <td style={{ textTransform: 'capitalize' }}>{r.status.replace('_', ' ')}</td>
                  <td>{formatTime(r.check_in_time)}</td>
                  <td>{formatTime(r.check_out_time)}</td>
                  <td>{r.remarks || '—'}</td>
                  {isManager && (
                    <td>
                      <button type="button" className="btn-link" onClick={() => setEditRecord(r)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary">
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-secondary">
              Next
            </button>
          </div>
        </>
      )}

      <AttendanceEditModal
        open={Boolean(editRecord)}
        record={editRecord}
        onClose={() => setEditRecord(null)}
        onSave={handleSaveEdit}
      />
    </Layout>
  );
}
