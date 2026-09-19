const STATUS_LABELS = { pending: 'Pending', in_progress: 'In progress', done: 'Done' };
const STATUS_COLORS = { pending: '#b45309', in_progress: '#2563eb', done: '#15803d' };
const PRIORITY_LABELS = { low: 'Low', normal: 'Normal', high: 'High' };

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN');
}

// Dumb display component — the caller decides what controls to offer
// (Dashboard lets the assignee move status forward; the Employees page
// lets the assigner delete). Pass neither handler for a read-only list.
export default function TaskList({ tasks, onStatusChange, onDelete, showAssignedBy }) {
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
          <th>Status</th>
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
            <td>{formatDate(t.due_date)}</td>
            <td>{PRIORITY_LABELS[t.priority] || t.priority}</td>
            {showAssignedBy && (
              <td>{t.assigned_by_first_name ? `${t.assigned_by_first_name} ${t.assigned_by_last_name || ''}`.trim() : '—'}</td>
            )}
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
            <td>
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
