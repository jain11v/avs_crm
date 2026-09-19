import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from './Layout';

// pageKey: gates by the role-permissions matrix (admin always passes).
// adminOnly: gates to the admin role specifically, regardless of the
// matrix — for the admin page itself, which manages that matrix and so
// can't be governed by it.
export default function ProtectedRoute({ children, pageKey, adminOnly }) {
  const { employee, loading, hasPermission } = useAuth();

  if (loading) {
    return <div className="page-loading">Loading…</div>;
  }

  if (!employee) {
    return <Navigate to="/login" replace />;
  }

  const allowed = adminOnly ? employee.role === 'admin' : pageKey ? hasPermission(pageKey) : true;

  if (!allowed) {
    return (
      <Layout>
        <h2>Access restricted</h2>
        <p className="subtitle">You don't have access to this page. Ask an admin if you think this is a mistake.</p>
      </Layout>
    );
  }

  return children;
}
