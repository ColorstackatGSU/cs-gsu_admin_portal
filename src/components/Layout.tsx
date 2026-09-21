import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Sidebar from './Sidebar';
import PixelTransition from './PixelTransition';
import { isTechLeaguePath } from '../lib/access';
import Footer from './Footer';

/**
 * Two distinct shells share the same routes, matching the sponsor portal:
 *
 *   Signed-in pages get the sidebar. `.side-main` handles the outer padding so
 *   pages inside it need no wrap of their own beyond `.wrap`.
 *
 *   Signed-out pages get a two-panel split: a loud brand panel that says what
 *   this is, and the form beside it. Below 920px the panel drops out and the
 *   compact brand bar above the form takes over.
 *
 * The panel copy is deliberately different from the sponsor portal's. Whoever
 * lands here should be able to tell in one glance whether they have opened the
 * officer tool or the sponsor one, because both are signed into with the same
 * kind of email and the same six-digit code.
 */
const AUTH_ROUTES = ['/login'];

export default function Layout() {
  const { pathname } = useLocation();
  const isAuth = AUTH_ROUTES.includes(pathname);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  /**
   * The Tech League's scheme is applied to <body>, not to the app shell.
   *
   * It has to be an ancestor of everything for the whole chrome to change, and body is
   * also where the page's own background colour is set, so redefining --canvas here is
   * what stops a band of cream showing below short content. A class on the shell left the
   * sidebar themed and the page under it cream.
   */
  useEffect(() => {
    const scoped = isTechLeaguePath(pathname);
    document.body.classList.toggle('tl-scope', scoped);
    return () => document.body.classList.remove('tl-scope');
  }, [pathname]);

  if (isAuth) {
    return (
      <div className="shell shell-auth">
        <main className="auth-split">
          <aside className="auth-panel">
            <div className="auth-panel-brand">
              <img src="/images/colorstack-gsu-logo.png" alt="" />
              <span>
                ColorStack
                <br />
                at GSU
              </span>
            </div>

            <div className="auth-chips">
              <span className="auth-chip">Sponsors</span>
              <span className="auth-chip">Contacts</span>
              <span className="auth-chip">Invoices</span>
              <span className="auth-chip">Payments</span>
            </div>

            <h2 className="auth-panel-title">
              Officer
              <br />
              <em>admin</em>
            </h2>
            <p className="auth-panel-copy">
              The back office behind the sponsor portal. Add companies, invite their
              contacts, raise invoices, and reconcile what Zeffy could not match on
              its own.
            </p>
          </aside>

          <div className="auth-pane">
            <div className="auth-pane-inner">
              <div className="auth-mini">
                <img src="/images/colorstack-gsu-logo.png" alt="" />
                <span>
                  ColorStack at GSU
                  <br />
                  Officer admin
                </span>
              </div>
              <Outlet />
              <Footer />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="shell shell-app side-wrap">
      <Sidebar />
      <main className="side-main">
        <Outlet />
      </main>
      {/* Mounted once, here, rather than per page: it has to outlive the route change it
          is covering, and a page that unmounts mid-navigation cannot do that. */}
      <PixelTransition />
    </div>
  );
}
