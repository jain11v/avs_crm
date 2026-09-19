import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

// Nothing is stored or scheduled server-side — every open re-fetches
// current alert conditions (renewals due, commission overdue, pending
// approvals), so there's no "mark as read" state to manage and an alert
// simply disappears once whatever it flagged is resolved.
const POLL_MS = 5 * 60 * 1000;

export default function AlertsBell() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    function load() {
      api.get('/alerts').then((res) => setAlerts(res.data.data)).catch(() => {});
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalCount = alerts.reduce((sum, a) => sum + a.count, 0);

  function handleItemClick(link) {
    setOpen(false);
    navigate(link);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn-link"
        onClick={() => setOpen((o) => !o)}
        style={{ position: 'relative' }}
        aria-label="Alerts"
      >
        Alerts
        {totalCount > 0 && (
          <span
            style={{
              marginLeft: '0.3rem',
              background: '#b91c1c',
              color: '#fff',
              borderRadius: '999px',
              padding: '0.05rem 0.4rem',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            {totalCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: '0.4rem',
            width: '340px',
            background: 'var(--panel, #fff)',
            border: '1px solid var(--border, #ddd)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 50,
            maxHeight: '420px',
            overflowY: 'auto',
          }}
        >
          {alerts.length === 0 ? (
            <p className="subtitle" style={{ padding: '0.9rem' }}>Nothing needs your attention right now.</p>
          ) : (
            alerts.map((a) => (
              <div key={a.type} style={{ borderBottom: '1px solid var(--border, #eee)', padding: '0.7rem 0.9rem' }}>
                <button
                  type="button"
                  className="btn-link"
                  style={{ textAlign: 'left', fontWeight: 600 }}
                  onClick={() => setExpanded((e) => (e === a.type ? null : a.type))}
                >
                  {a.message}
                </button>
                {expanded === a.type && (
                  <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
                    {a.items.map((item, i) => (
                      <li key={i} style={{ marginBottom: '0.3rem' }}>
                        <button type="button" className="btn-link" onClick={() => handleItemClick(item.link)}>
                          {item.label}
                        </button>
                      </li>
                    ))}
                    {a.viewAllLink && (
                      <li>
                        <button type="button" className="btn-link" onClick={() => handleItemClick(a.viewAllLink)}>
                          View all →
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
