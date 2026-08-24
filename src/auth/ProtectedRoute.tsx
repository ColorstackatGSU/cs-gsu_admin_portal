import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';

/**
 * Signed-in gate. While the initial session check is in flight, we render a
 * blank placeholder rather than either children or a redirect: rendering
 * children would flash protected content, and redirecting to /login would send
 * a signed-in user to the login page on every refresh.
 *
 * On redirect we stash the intended path in navigation state so the login page
 * can send them back where they were going.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div style={{ minHeight: '100vh' }} aria-hidden="true" />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
