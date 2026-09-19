import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  // On first load, check whether the browser already has a valid session
  // cookie (e.g. the person refreshed the page).
  useEffect(() => {
    api
      .get('/auth/me')
      .then((res) => setEmployee(res.data))
      .catch(() => setEmployee(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    setEmployee(res.data);
    return res.data;
  }

  async function logout() {
    await api.post('/auth/logout');
    setEmployee(null);
  }

  // Admin always has every page — mirrors the same rule the backend
  // enforces (see requirePage), so there's no way to configure an admin
  // out of a page from the permissions matrix.
  function hasPermission(pageKey) {
    if (!employee) return false;
    if (employee.role === 'admin') return true;
    return (employee.permissions || []).includes(pageKey);
  }

  return (
    <AuthContext.Provider value={{ employee, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
