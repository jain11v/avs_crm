import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import TaskList from '../components/TaskList';
import DocumentsPanel from '../components/DocumentsPanel';
import api from '../api/axios';

export default function Dashboard() {
  const { employee } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTasks = useCallback(() => {
    api.get('/tasks/mine').then((res) => setTasks(res.data)).catch((err) => {
      setError(err.response?.data?.error || 'Could not load your tasks.');
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function handleStatusChange(task, status) {
    try {
      await api.patch(`/tasks/${task.id}/status`, { status });
      loadTasks();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update that task.');
    }
  }

  return (
    <Layout>
      <h2>Welcome back, {employee?.name?.split(' ')[0]}.</h2>
      <p className="subtitle">Here's what's on your plate.</p>

      {error && <div className="form-error">{error}</div>}

      <h3 style={{ marginTop: '1.5rem' }}>My tasks</h3>
      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : (
        <TaskList tasks={tasks} showAssignedBy onStatusChange={handleStatusChange} />
      )}

      {employee?.id && <DocumentsPanel entityType="employee" entityId={employee.id} title="Files for you" />}
    </Layout>
  );
}
