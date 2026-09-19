import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';

// Per-employee counts: leads/renewals lost, and tasks/renewals completed.
// See backend/src/controllers/performanceController.js for exactly what
// each column counts and why.
export default function Performance() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/performance');
      setRows(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load performance.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Performance</h2>
          <p className="subtitle">Leads/renewals lost, and tasks/renewals completed, per employee</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Leads lost</th>
              <th>Renewals lost</th>
              <th>Tasks completed</th>
              <th>Renewals completed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.first_name} {r.last_name || ''}
                  {!r.is_active && <span className="subtitle"> (inactive)</span>}
                </td>
                <td>{r.leads_lost}</td>
                <td>{r.renewals_lost}</td>
                <td>{r.tasks_completed}</td>
                <td>{r.renewals_completed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
