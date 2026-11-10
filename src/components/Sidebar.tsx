import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useUnmatchedCount } from '../hooks/useUnmatchedCount';
import { useBotQueueCount } from '../hooks/useBotQueueCount';
import { ORG } from '../data/org';
import { isTechLeaguePath } from '../lib/access';
import { pixelateThen } from '../lib/pixelate';
import { warmRoute } from '../lib/prefetch';
import { guardNavigation } from '../lib/unsaved';

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
type Badge = 'none' | 'unmatched' | 'bot';
type Item = { to: string; label: string; icon: () => React.JSX.Element; badge: Badge };
type Group = { key: string; label: string; items: Item[] };

/*
 * Grouped, because a flat list of eleven framed blocks was taller than a laptop
 * screen and every item had the same weight. Each group folds, so the column
 * shows the section you are working in and a header for each of the others.
 *
 * Ordered by how often officers actually open them: members and events every week,
 * sponsors and invoices a few times a semester. Sponsors used to be first only
 * because the portal was built for billing before it was built for anything else.
 */
const GROUPS: Group[] = [
  {
    key: 'members',
    label: 'Members',
    items: [
      { to: '/members', label: 'Members', icon: IconPeople, badge: 'none' },
      { to: '/events', label: 'Events', icon: IconCalendar, badge: 'none' },
      { to: '/members/email', label: 'Email members', icon: IconMail, badge: 'none' },
      { to: '/members/text', label: 'Text members', icon: IconChat, badge: 'none' },
    ],
  },
  {
    key: 'community',
    label: 'Community',
    items: [
      { to: '/bot', label: 'Discord', icon: IconDiscord, badge: 'bot' },
      // A prefix, like /bot: the Tech League screens carry their own section nav
      // across the top, so listing the rest of them here again only made this column
      // taller. One row in, the sub-nav is the first thing on the page.
      { to: '/tech-league', label: 'Tech League', icon: IconTrophy, badge: 'none' },
    ],
  },
  {
    key: 'resumes',
    label: 'Resumes',
    items: [
      { to: '/resume-push', label: 'Resume push', icon: IconSend, badge: 'none' },
      { to: '/resume-book', label: 'Resume book', icon: IconBook, badge: 'none' },
    ],
  },
  {
    key: 'sponsors',
    label: 'Sponsors and billing',
    items: [
      { to: '/sponsors', label: 'Sponsors', icon: IconBuilding, badge: 'none' },
      { to: '/invoices', label: 'Invoices', icon: IconReceipt, badge: 'none' },
      { to: '/unmatched', label: 'Unmatched', icon: IconAlert, badge: 'unmatched' },
    ],
  },
];

// On its own, last on purpose: this is the screen that hands out every other screen.
const ACCESS: Item = { to: '/access', label: 'Access', icon: IconKey, badge: 'none' };

/**
 * Whether `path` belongs to the item at `to`: the screen itself or anything under it,
 * so a sponsor's own page keeps Sponsors lit. Members is the one exception, because
 * Email and Text live under /members but are items of their own.
 */
const OWN_ITEMS = ['/members/email', '/members/text'];
const matches = (path: string, to: string) =>
  path === to ||
  (path.startsWith(to + '/') && !(to === '/members' && OWN_ITEMS.includes(path)));

const FOLD_KEY = 'admin.sidebar.folds';

function readFolds(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { signOut } = useAuth();
  const unmatched = useUnmatchedCount();
  const botQueue = useBotQueueCount();
  const nav = useNavigate();
  // Only groups the officer has opened or closed by hand are stored. Any other group
  // is open exactly when it holds the current screen.
  const [folds, setFolds] = useState<Record<string, boolean>>(readFolds);

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

  // True when a destination is on the other side of the design boundary from
  // where we are now. Symmetric on purpose: leaving the Tech League is as much
  // a scheme change as entering it, so it gets the same dissolve.
  const here = useLocation().pathname;
  const crosses = (to: string) => isTechLeaguePath(here) !== isTechLeaguePath(to);

  const countFor = (badge: Badge) =>
    badge === 'unmatched' ? unmatched : badge === 'bot' ? botQueue : null;

  function toggle(key: string, isOpen: boolean) {
    const next = { ...folds, [key]: !isOpen };
    setFolds(next);
    try {
      localStorage.setItem(FOLD_KEY, JSON.stringify(next));
    } catch {
      // Private windows can refuse storage; the fold still works for this visit.
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

  function renderItem(item: Item, sub: boolean) {
    const { to, label, icon: Icon } = item;
    const count = countFor(item.badge);
    return (
      <Link
        key={to}
        to={to}
        // Lit by matches() rather than NavLink's own rule, which cannot tell that
        // /members/email is not part of Members.
        className={`side-link${sub ? ' side-link-sub' : ''}${matches(here, to) ? ' active' : ''}`}
        aria-current={matches(here, to) ? 'page' : undefined}
        onClick={(e) => {
          setOpen(false);

          // Every navigation from here is taken over, so a screen holding
          // unsaved work gets asked about first. The link's own navigation
          // has to be cancelled either way: it would race the question.
          e.preventDefault();

          // Start the destination's request now rather than when it mounts.
          // What follows is up to 620ms of dissolve, and previously none of
          // it was spent fetching. Fired before the unsaved-work guard on
          // purpose: if a question appears, the request runs while it is
          // being read, and a GET nobody ends up needing is thrown away.
          warmRoute(to);

          // A click that crosses between the portal's scheme and the Tech
          // League's gets the pixel dissolve, in whichever direction it
          // crosses. Moving within one scheme navigates normally: the
          // effect marks the change of world, and firing it on every nav
          // would make it furniture.
          const go = crosses(to)
            ? () =>
                pixelateThen(
                  () => nav(to),
                  isTechLeaguePath(to) ? 'Entering the Tech League' : 'Back to the portal',
                  isTechLeaguePath(to) ? 'to-tech-league' : 'to-portal',
                )
            : () => nav(to);

          // Blocked means a question is now on screen, and starting the
          // dissolve would cover it.
          guardNavigation(go);
        }}
      >
        <Icon />
        {label}
        {count != null && count > 0 && (
          <span className="side-count" aria-label={`${count} waiting`}>
            {count}
          </span>
        )}
      </Link>
    );
  }

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
          {GROUPS.map((g) => {
            const holdsHere = g.items.some((i) => matches(here, i.to));
            const isOpen = folds[g.key] ?? holdsHere;
            // A folded group still says when something inside it is waiting.
            const waiting = g.items.reduce((n, i) => n + (countFor(i.badge) ?? 0), 0);
            const panel = `side-group-${g.key}`;
            return (
              <div key={g.key} className="side-group">
                <button
                  type="button"
                  className={`side-group-head${holdsHere ? ' here' : ''}`}
                  aria-expanded={isOpen}
                  aria-controls={panel}
                  onClick={() => toggle(g.key, isOpen)}
                >
                  <IconChevron open={isOpen} />
                  {g.label}
                  {!isOpen && waiting > 0 && (
                    <span className="side-count" aria-label={`${waiting} waiting`}>
                      {waiting}
                    </span>
                  )}
                </button>
                {isOpen && (
                  <div id={panel} className="side-group-items">
                    {g.items.map((i) => renderItem(i, true))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="side-group-solo">{renderItem(ACCESS, false)}</div>
        </nav>

        <div className="side-foot">
          {/* The sponsor-facing side of the same data. Officers check it often
              enough ("what does this actually look like to them?") that hunting
              for the URL every time is friction worth removing. */}
          <a
            className="side-ext"
            href={ORG.sponsorPortal}
            target="_blank"
            rel="noopener noreferrer"
          >
            Sponsor view ↗
          </a>

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

function IconTrophy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3" />
      <path d="M17 6h3v1a3 3 0 0 1-3 3" />
      <path d="M12 14v3" />
      <path d="M8.5 20h7" />
      <path d="M10 17h4l1 3H9l1-3Z" />
    </svg>
  );
}


function IconKey() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="4.5" />
      <path d="M11.5 11.5 20 20" />
      <path d="M17 17l2.5-2.5" />
    </svg>
  );
}

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

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
      <path d="M8 10h8M8 13h5" />
    </svg>
  );
}

/* A paper plane, for the one screen that sends a batch of mail. Drawn as an
   outline rather than a solid so it sits at the same weight as its neighbours. */
function IconSend() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3l-6.5 18-4-8.5L2 8.5 21 3z" />
    </svg>
  );
}

/* The fold marker on a group header: points right when closed, down when open. */
function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease' }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/* A calendar page, for the events members see on their portal. */
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="1" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

/* A closed book with a ribbon, for the resume book export. */
function IconBook() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4a1 1 0 0 1 1-1h13v15H6.5A1.5 1.5 0 0 0 5 19.5V4z" />
      <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19" />
      <path d="M10 3v7l2.5-2 2.5 2V3" />
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
