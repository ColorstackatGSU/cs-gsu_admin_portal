import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Sidebar from './Sidebar';

const AUTH_ROUTES = ['/login'];

export default function Layout() {
  const { pathname } = useLocation();
  const isAuth = AUTH_ROUTES.includes(pathname);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  if (isAuth) {
    return (
      <div className="shell shell-auth">
        <main className="auth-wrap">
          <Outlet />
        </main>
        <footer className="auth-foot">
          ColorStack at Georgia State University &middot;{' '}
          <a href="mailto:official@colorstackatgsu.com">official@colorstackatgsu.com</a>
        </footer>
      </div>
    );
  }

  return (
    <div className="shell shell-app side-wrap">
      <Sidebar />
      <main className="side-main">
        <Outlet />
      </main>
    </div>
  );
}
