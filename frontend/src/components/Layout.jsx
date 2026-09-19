import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PAGES } from '../pages';
import AlertsBell from './AlertsBell';

export default function Layout({ children }) {
  const { employee, logout, hasPermission } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-brand">
            Insurance<span>CRM</span>
          </div>
          <nav className="topbar-nav">
            {PAGES.filter((p) => hasPermission(p.key)).map((p) => (
              <NavLink
                key={p.key}
                to={p.path}
                end={p.path === '/'}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {p.label}
              </NavLink>
            ))}
            <NavLink to="/chat" className={({ isActive }) => (isActive ? 'active' : '')}>
              Chat
            </NavLink>
            {employee?.role === 'admin' && (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
                Admin
              </NavLink>
            )}
          </nav>
        </div>
        <div className="topbar-user">
          <AlertsBell />
          <span>{employee?.name}</span>
          <button className="btn-link" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>

      <main className="dashboard-main">{children}</main>
    </div>
  );
}
