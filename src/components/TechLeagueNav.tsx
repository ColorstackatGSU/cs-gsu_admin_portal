import { NavLink, useNavigate } from 'react-router-dom';
import { guardNavigation } from '../lib/unsaved';
import { warmRoute } from '../lib/prefetch';

/**
 * Moving between the Tech League's screens without going back to the sidebar.
 *
 * Deliberately plain links, not a tablist. The page this was ported from drew its
 * three sections as role="tablist" / role="tab" with no ids, no aria-controls, no
 * aria-labelledby on the panel and no arrow-key roving tabindex, which promises a
 * screen reader a widget that is not there: it announces "tab, 1 of 3" and then
 * the arrow keys do nothing. These are separate routes with their own URLs, so a
 * link is what they actually are. aria-current="page" is the whole accessibility
 * contract and the browser gives it to us for free.
 */

const LINKS = [
  { to: '/tech-league', label: 'Admins', end: true },
  { to: '/tech-league/review', label: 'Review', end: false },
  { to: '/tech-league/pool', label: 'Applicant pool', end: false },
  { to: '/tech-league/scores', label: 'Scores', end: false },
  { to: '/tech-league/email', label: 'Email', end: false },
];

export default function TechLeagueNav({ count }: { count?: number | null }) {
  const nav = useNavigate();

  return (
    <nav className="tl-nav" aria-label="Tech League sections">
      {LINKS.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            isActive ? 'btn btn-sm btn-primary tl-nav-link' : 'btn btn-sm btn-secondary tl-nav-link'
          }
          onClick={(e) => {
            // Scores stages its edits and Email holds a draft, and these are separate
            // routes, so leaving one unmounts what it is holding.
            e.preventDefault();

            // No dissolve between these, so this buys little on its own. It pays
            // when Scores or Email is holding work: the request runs while the
            // officer reads the question about losing it.
            warmRoute(to);
            guardNavigation(() => nav(to));
          }}
        >
          {label}
          {to === '/tech-league/review' && count != null && count > 0 && (
            <span className="tl-nav-count">{count}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
