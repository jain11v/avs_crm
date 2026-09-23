const STATUS_LABELS = { pending: 'Pending', in_progress: 'In progress', done: 'Done' };
const STATUS_COLORS = { pending: '#b45309', in_progress: '#2563eb', done: '#15803d' };
const PRIORITY_LABELS = { low: 'Low', normal: 'Normal', high: 'High' };
const OUTCOME_LABELS = { pending: 'Open lead', converted: 'Policy made', lost: 'Lost lead' };
const OUTCOME_COLORS = { pending: '#6b7280', converted: '#15803d', lost: '#b91c1c' };
const RECURRENCE_LABELS = { daily: '↻ Daily', weekly: '↻ Weekly', monthly: '↻ Monthly' };

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN');
}

function isOverdue(task) {
  if (!task.due_date || task.status === 'done') return false;
  return new Date(task.due_date) < new Date(new Date().toDateString());
}

// How long the assignee actually took, start to finish — created_at and
// completed_at come from the same server, so the difference is safe from
// the timezone parsing quirks that affect displaying either one alone.
function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return '—';
  const ms = new Date(endIso) - new Date(startIso);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

// Dumb display component — the caller decides what controls to offer
// (Dashboard lets the assignee move status forward and resolve the lead;
// the Employees page lets the assigner delete). Pass neither handler for
// a read-only list. onOpenDocs, if passed, makes the document count a
// button that opens a documents modal (caller owns that modal's state).
export default function TaskList({ tasks, onStatusChange, onDelete, onMarkLost, onOpenDocs, showAssignedBy, showAssignedTo }) {
  if (tasks.length === 0) {
    return <p className="subtitle">No tasks.</p>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Task</th>
          <th>Due</th>
          <th>Priority</th>
          {showAssignedBy && <th>Assigned by</th>}
          {showAssignedTo && <th>Assigned to</th>}
          <th>Docs</th>
          <th>Lead</th>
          <th>Status</th>
          <th>Time taken</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <tr key={t.id}>
            <td>
              {t.title}
              {t.description && <div className="subtitle" style={{ margin: 0 }}>{t.description}</div>}
            </td>
            <td>
              {isOverdue(t) ? (
                <span style={{ color: '#b91c1c', fontWeight: 600 }}>{formatDate(t.due_date)} — Overdue</span>
              ) : (
                formatDate(t.due_date)
              )}
              {t.recurrence && t.recurrence !== 'none' && (
                <div className="subtitle" style={{ margin: 0 }}>{RECURRENCE_LABELS[t.recurrence]}</div>
              )}
            </td>
            <td>{PRIORITY_LABELS[t.priority] || t.priority}</td>
            {showAssignedBy && (
              <td>{t.assigned_by_first_name ? `${t.assigned_by_first_name} ${t.assigned_by_last_name || ''}`.trim() : '—'}</td>
            )}
            {showAssignedTo && (
              <td>{t.assigned_to_first_name ? `${t.assigned_to_first_name} ${t.assigned_to_last_name || ''}`.trim() : '—'}</td>
            )}
            <td>
              {t.document_count > 0 ? (
                onOpenDocs ? (
                  <button type="button" className="btn-link" onClick={() => onOpenDocs(t)}>
                    {t.document_count} file{t.document_count > 1 ? 's' : ''}
                  </button>
                ) : (
                  `${t.document_count} file${t.document_count > 1 ? 's' : ''}`
                )
              ) : (
                '—'
              )}
            </td>
            <td>
              <span style={{ color: OUTCOME_COLORS[t.outcome], fontWeight: 600 }}>
                {t.outcome === 'converted' && t.policy_number
                  ? `Policy #${t.policy_number}`
                  : OUTCOME_LABELS[t.outcome] || t.outcome}
              </span>
              {t.outcome === 'lost' && t.lost_reason && (
                <div className="subtitle" style={{ margin: 0 }}>{t.lost_reason}</div>
              )}
            </td>
            <td>
              {onStatusChange ? (
                <select
                  value={t.status}
                  onChange={(e) => onStatusChange(t, e.target.value)}
                  style={{ color: STATUS_COLORS[t.status], fontWeight: 600 }}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              ) : (
                <span style={{ color: STATUS_COLORS[t.status], fontWeight: 600 }}>
                  {STATUS_LABELS[t.status] || t.status}
                </span>
              )}
            </td>
            <td>{formatDuration(t.created_at, t.completed_at)}</td>
            <td>
              {onMarkLost && t.outcome === 'pending' && (
                <button type="button" className="btn-link" onClick={() => onMarkLost(t)}>
                  Mark lost
                </button>
              )}
              {onDelete && (
                <button type="button" className="btn-link" onClick={() => onDelete(t)}>
                  Delete
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
