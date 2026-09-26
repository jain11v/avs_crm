import { useEffect, useState } from 'react';
import api from '../api/axios';
import Layout from '../components/Layout';

// Local-time YYYY-MM-DD (toISOString() would shift to UTC and can land on
// the previous day in IST).
function localIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Download business reports as Excel: pick a report and a date range. The
// list of reports and what each one's date range filters on comes from the
// backend (businessReportsController.js). Admin-only unless the `reports`
// page is granted to a role.
export default function Reports() {
  const today = new Date();
  const [reports, setReports] = useState([]);
  const [reportKey, setReportKey] = useState('');
  const [from, setFrom] = useState(localIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(localIsoDate(today));
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports')
      .then((res) => {
        setReports(res.data);
        if (res.data.length > 0) setReportKey(res.data[0].key);
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load the list of reports.'));
  }, []);

  const selected = reports.find((r) => r.key === reportKey);

  async function handleDownload(e) {
    e.preventDefault();
    if (!reportKey || !from || !to) {
      setError('Choose a report and both dates.');
      return;
    }
    if (from > to) {
      setError('The From date must be on or before the To date.');
      return;
    }

    setError('');
    setDownloading(true);
    try {
      const res = await api.get(`/reports/${reportKey}/download`, {
        params: { from, to },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportKey.replace(/_/g, '-')}-${from}-to-${to}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // With responseType 'blob' the error body is a Blob, not parsed JSON.
      let message = 'Could not download the report.';
      try {
        const body = JSON.parse(await err.response.data.text());
        if (body.error) message = body.error;
      } catch {
        // keep the generic message
      }
      setError(message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h2>Reports</h2>
          <p className="subtitle">Download business reports as Excel files for any date range.</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleDownload}>
        <div className="form-grid">
          <div className="field field-wide">
            <label>Report</label>
            <select value={reportKey} onChange={(e) => setReportKey(e.target.value)}>
              {reports.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            {selected && <p className="subtitle" style={{ margin: '0.4rem 0 0' }}>{selected.description}</p>}
          </div>

          <div className="field">
            <label>From</label>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </div>

          <div className="field">
            <label>To</label>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary btn-inline" disabled={downloading || !reportKey}>
            {downloading ? 'Preparing…' : 'Download Excel'}
          </button>
        </div>
      </form>
    </Layout>
  );
}
