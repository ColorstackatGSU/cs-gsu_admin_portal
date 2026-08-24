import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useUnmatchedCount } from '../hooks/useUnmatchedCount';
import { ORG } from '../data/org';

/**
 * The signed-in shell's left column: a fixed 248px sidebar with the wordmark at
 * the top, the nav stacked in the middle, and a link to the sponsor-facing
 * portal plus Sign Out pinned to the bottom. Every nav item is its own framed
 * block that presses into its shadow on hover; the active one is filled with
 * GSU blue.
 *
 * Below 900px the sidebar drops out of flow and becomes a slide-in drawer
 * behind a top bar with a hamburger. The scrim closes it on click, and Escape
 * closes it too, since a stuck drawer with no visible dismiss is disorienting.
 *
 * Unmatched payments carry a count badge. It is the only screen in the portal
 * with a genuine queue behind it — money that arrived and has not been tied to
 * an invoice — and nobody goes looking for it unless something says to.
 *
 * Icons are inline SVG rather than a dependency. It is five icons, drawn at
 * stroke 2.25 so they hold up next to the uppercase labels.
 */
const NAV = [
  { to: '/sponsors', label: 'Sponsors', icon: IconBuilding, badge: false },
  { to: '/invoices', label: 'Invoices', icon: IconReceipt, badge: false },
  { to: '/members', label: 'Members', icon: IconPeople, badge: false },
  { to: '/members/email', label: 'Email members', icon: IconMail, badge: false },
  { to: '/unmatched', label: 'Unmatched', icon: IconAlert, badge: true },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { signOut } = useAuth();
  const unmatched = useUnmatchedCount();
  const nav = useNavigate();

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      nav('/login', { replace: true });
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  }

  // Close on Escape. Without this a drawer opened by accident on a small screen
  // has no dismiss other than the scrim, which is not obvious.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Mobile top bar. Hidden on desktop by CSS. */}
      <div className="side-top">
        <div className="side-top-brand">
          <img src="/images/colorstack-gsu-logo.png" alt="" />
          <span>
            ColorStack at GSU
            <br />
            Officer admin
          </span>
        </div>
        <button
          type="button"
          className="side-burger"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <IconMenu />
        </button>
      </div>

      <div
        className={open ? 'scrim open' : 'scrim'}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside className={open ? 'side open' : 'side'}>
        <div className="side-brand">
          <img src="/images/colorstack-gsu-logo.png" alt="" />
          <span className="side-brand-text">
            ColorStack
            <br />
            at GSU
            <span className="side-brand-sub">Officer admin</span>
          </span>
        </div>

        <nav className="side-nav" aria-label="Primary">
          {NAV.map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (isActive ? 'side-link active' : 'side-link')}
              onClick={() => setOpen(false)}
            >
              <Icon />
              {label}
              {badge && unmatched != null && unmatched > 0 && (
                <span className="side-count" aria-label={`${unmatched} waiting`}>
                  {unmatched}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="side-foot">
          {/* The sponsor-facing side of the same data. Officers check it often
              enough ("what does this actually look like to them?") that hunting
              for the URL every time is friction worth removing. */}
          <div className="side-help">
            <span className="side-help-title">Sponsor view</span>
            <a href={ORG.sponsorPortal} target="_blank" rel="noopener noreferrer">
              {ORG.sponsorPortal.replace(/^https?:\/\//, '')}
            </a>
          </div>

          <button
            type="button"
            className="side-link side-signout"
            onClick={handleSignOut}
            disabled={signingOut}
            style={{ width: '100%', textAlign: 'left', cursor: signingOut ? 'wait' : 'pointer' }}
          >
            <IconLogout />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>
    </>
  );
}

/* ============ ICONS ============ */
/* All 20x20, stroke 2.25, currentColor. Heavier than the usual feather weight so
   they carry the same visual mass as the 3px frames around them. */

function IconBuilding() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17" />
      <path d="M15 9h4a1 1 0 0 1 1 1v11" />
      <path d="M2 21h20" />
      <path d="M8 7h3M8 11h3M8 15h3" />
    </svg>
  );
}

function IconReceipt() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4.5" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20c1-3 3.5-4.5 6-4.5s5 1.5 6 4.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 15c2.5 0 4.5 1.5 5.5 4" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h11" />
    </svg>
  );
}
