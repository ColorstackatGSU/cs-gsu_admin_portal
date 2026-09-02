import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useUnmatchedCount } from '../hooks/useUnmatchedCount';
import { useBotQueueCount } from '../hooks/useBotQueueCount';
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
 * Two items carry a count badge, and they are the two genuine queues in the
 * portal: money that arrived and has not been tied to an invoice, and people who
 * clicked Verify in Discord and could not be matched. Nobody goes looking at
 * either page unless something says to, so the number rides in the nav on every
 * screen rather than only on the page that would clear it.
 *
 * Icons are inline SVG rather than a dependency. Drawn at stroke 2.25 so they
 * hold up next to the uppercase labels.
 */
const NAV = [
  { to: '/sponsors', label: 'Sponsors', icon: IconBuilding, badge: 'none' },
  { to: '/invoices', label: 'Invoices', icon: IconReceipt, badge: 'none' },
  { to: '/members', label: 'Members', icon: IconPeople, badge: 'none' },
  { to: '/members/email', label: 'Email members', icon: IconMail, badge: 'none' },
  { to: '/fair', label: 'Involvement fair', icon: IconQr, badge: 'none' },
  { to: '/unmatched', label: 'Unmatched', icon: IconAlert, badge: 'unmatched' },
  { to: '/bot', label: 'Discord', icon: IconDiscord, badge: 'bot' },
] as const;

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { signOut } = useAuth();
  const unmatched = useUnmatchedCount();
  const botQueue = useBotQueueCount();
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
          {NAV.map(({ to, label, icon: Icon, badge }) => {
            const count =
              badge === 'unmatched' ? unmatched : badge === 'bot' ? botQueue : null;
            return (
              <NavLink
                key={to}
                to={to}
                // /bot is a prefix for four screens, so it stays lit on all of
                // them; every other item is its own exact page.
                end={to === '/bot' ? false : undefined}
                className={({ isActive }) => (isActive ? 'side-link active' : 'side-link')}
                onClick={() => setOpen(false)}
              >
                <Icon />
                {label}
                {count != null && count > 0 && (
                  <span className="side-count" aria-label={`${count} waiting`}>
                    {count}
                  </span>
                )}
              </NavLink>
            );
          })}
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

/* A QR code, abbreviated to the three finder squares and a couple of modules.
   Drawing a real one at 20px is mud; the three corners are what makes the shape
   readable as a QR code at any size, so they are all that is here. */
function IconQr() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3M20 14h1M14 17v4M17 20h4M20 17v0" />
    </svg>
  );
}

/* Discord's own mark, simplified to a single filled path at the same optical
   weight as the stroked icons beside it. */
function IconDiscord() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.3 5.4A16.8 16.8 0 0 0 15.1 4l-.3.6a12.5 12.5 0 0 1 3.7 1.9 15.9 15.9 0 0 0-12.9 0 12.6 12.6 0 0 1 3.7-1.9L9 4a16.8 16.8 0 0 0-4.2 1.4C2.1 9.4 1.4 13.2 1.7 17a16.9 16.9 0 0 0 5.1 2.6l1.1-1.7c-.9-.3-1.8-.8-2.6-1.3l.5-.4a12.1 12.1 0 0 0 10.4 0l.5.4c-.8.5-1.7 1-2.6 1.3l1.1 1.7A16.9 16.9 0 0 0 22.3 17c.4-4.4-.7-8.2-3-11.6zM8.6 14.8c-1 0-1.8-.9-1.8-2.1 0-1.1.8-2.1 1.8-2.1s1.9.9 1.8 2.1c0 1.2-.8 2.1-1.8 2.1zm6.8 0c-1 0-1.8-.9-1.8-2.1 0-1.1.8-2.1 1.8-2.1s1.9.9 1.8 2.1c0 1.2-.8 2.1-1.8 2.1z" />
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
