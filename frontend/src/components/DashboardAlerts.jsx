import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

// Same /alerts endpoint AlertsBell polls in the header — this just shows
// it inline and already-expanded, since the Dashboard has the room and
// there's no need to hide it behind a click here. Always inside a
// dashboard-card on Dashboard.jsx, so no margin of its own.
export default function DashboardAlerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/alerts').then((res) => setAlerts(res.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h3 style={{ marginBottom: '0.5rem' }}>Alerts</h3>
      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : alerts.length === 0 ? (
        <p className="subtitle">Nothing needs your attention right now.</p>
      ) : (
        alerts.map((a) => (
          <div key={a.type} style={{ marginBottom: '0.75rem' }}>
            <p style={{ fontWeight: 600, margin: '0 0 0.3rem' }}>{a.message}</p>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {a.items.map((item, i) => (
                <li key={i} style={{ marginBottom: '0.2rem' }}>
                  <button type="button" className="btn-link" onClick={() => navigate(item.link)}>
                    {item.label}
                  </button>
                </li>
              ))}
              {a.viewAllLink && (
                <li>
                  <button type="button" className="btn-link" onClick={() => navigate(a.viewAllLink)}>
                    View all →
                  </button>
                </li>
              )}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
