import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import TaskList from '../components/TaskList';
import DocumentsPanel from '../components/DocumentsPanel';
import DashboardAlerts from '../components/DashboardAlerts';
import DashboardStats from '../components/DashboardStats';
import AssignTaskModal from '../components/AssignTaskModal';
import MarkLostModal from '../components/MarkLostModal';
import TaskDocumentsModal from '../components/TaskDocumentsModal';
import api from '../api/axios';
import { uploadFiles } from '../utils/uploadFiles';
import { getDescendantIds } from '../utils/orgHierarchy';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { employee, hasPermission } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [lostTask, setLostTask] = useState(null);
  const [docsTask, setDocsTask] = useState(null);

  const loadTasks = useCallback(() => {
    api.get('/tasks/mine').then((res) => setTasks(res.data)).catch((err) => {
      setError(err.response?.data?.error || 'Could not load your tasks.');
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => { api.get('/lookups/employees').then((res) => setEmployees(res.data)); }, []);

  // Non-admins may only assign down their own reporting chain, plus
  // themselves (a personal to-do) — filter the picker to that instead of
  // showing everyone and letting the API reject an invalid pick.
  const descendantIds = employee?.role === 'admin' ? null : getDescendantIds(employees, employee?.id);
  const assignableEmployees = descendantIds
    ? employees.filter((e) => String(e.id) === String(employee?.id) || descendantIds.has(String(e.id)))
    : employees;

  async function handleStatusChange(task, status) {
    try {
      await api.patch(`/tasks/${task.id}/status`, { status });
      loadTasks();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update that task.');
    }
  }

  async function handleAssignTask(values) {
    try {
      const { files, ...body } = values;
      const res = await api.post('/tasks', body);
      if (files && files.length > 0) {
        await uploadFiles(files, 'task', res.data.id);
      }
      setAssignModalOpen(false);
      loadTasks();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not assign that task.');
    }
  }

  async function handleMarkLost(reason) {
    await api.patch(`/tasks/${lostTask.id}/lost`, { reason });
    setLostTask(null);
    loadTasks();
  }

  const pendingCount = tasks.filter((t) => t.status !== 'done').length;

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h2>{greeting()}, {employee?.name?.split(' ')[0]}.</h2>
          <p className="subtitle">Here's what's on your plate.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setAssignModalOpen(true)}>
          + New task
        </button>
      </div>

      <div className="quick-actions">
        {hasPermission('customers') && (
          <Link to="/customers/new" className="btn-secondary btn-inline">+ Customer</Link>
        )}
        {hasPermission('policies') && (
          <Link to="/policies/new" className="btn-secondary btn-inline">+ Policy</Link>
        )}
        <Link to="/chat" className="btn-secondary btn-inline">Open chat</Link>
      </div>

      <DashboardStats />

      {error && <div className="form-error" style={{ marginTop: '1.5rem' }}>{error}</div>}

      <div className="dashboard-card">
        <div className="dashboard-section-header">
          <h3>My tasks</h3>
          {!loading && tasks.length > 0 && (
            <span className="subtitle" style={{ margin: 0 }}>
              {pendingCount === 0 ? 'All caught up' : `${pendingCount} open`}
            </span>
          )}
        </div>
        {loading ? (
          <p className="subtitle">Loading…</p>
        ) : (
          <TaskList
            tasks={tasks}
            showAssignedBy
            onStatusChange={handleStatusChange}
            onMarkLost={setLostTask}
            onOpenDocs={setDocsTask}
          />
        )}
      </div>

      {employee?.id && (
        <div className="dashboard-card">
          <DocumentsPanel entityType="employee" entityId={employee.id} title="Files for you" />
        </div>
      )}

      <div className="dashboard-card">
        <DashboardAlerts />
      </div>

      <AssignTaskModal
        open={assignModalOpen}
        employees={assignableEmployees}
        onClose={() => setAssignModalOpen(false)}
        onSave={handleAssignTask}
      />

      <MarkLostModal
        open={Boolean(lostTask)}
        taskTitle={lostTask?.title}
        onClose={() => setLostTask(null)}
        onConfirm={handleMarkLost}
      />

      <TaskDocumentsModal open={Boolean(docsTask)} task={docsTask} onClose={() => setDocsTask(null)} />
    </Layout>
  );
}
