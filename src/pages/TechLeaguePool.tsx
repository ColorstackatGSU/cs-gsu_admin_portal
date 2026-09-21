import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TechLeagueNav from '../components/TechLeagueNav';
import { Empty, ErrorNote, Loading } from '../components/Form';
import { claim } from '../lib/prefetch';
import { errorMessage } from '../lib/admin';
import {
  COMMITMENT_LABELS,
  FILTERS,
  TEAM_PREF_LABELS,
  tally,
  type Application,
} from '../lib/techleague';

/**
 * Who applied, in aggregate.
 *
 * This is the screen that answers the questions a chapter gets asked in
 * December: how many people applied, what years were they, what did they want
 * to build, how many of them got in. It is read-only on purpose. Nothing here
 * is a row anybody can act on, and putting an action next to a demographic
 * total is how a total stops being a total.
 *
 * Race and ethnicity are shown here and nowhere else, as counts, with the reason
 * written next to them. They are collected for chapter reporting and they never
 * enter a decision, which is why the review screen shows them as one line of
 * text among the facts and the CSV export leaves them out entirely.
 */

type Scope = 'submitted' | 'accepted';

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'submitted', label: 'Everyone who submitted' },
  { key: 'accepted', label: 'Accepted only' },
];

export default function TechLeaguePool() {
  const [items, setItems] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('submitted');

  useEffect(() => {
    let cancelled = false;
    claim<Application[]>('/admin/tech-league/applications')
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const all = useMemo(() => items ?? [], [items]);
  const pool = useMemo(
    () => all.filter((a) => (scope === 'accepted' ? a.decision === 'accepted' : a.status === 'submitted')),
    [all, scope],
  );

  const reviewCount = useMemo(() => all.filter(FILTERS[0].match).length, [all]);

  if (error && !items) {
    return (
      <div className="wrap">
        <Link to="/tech-league" className="link">← Tech League</Link>
        <ErrorNote message={error} />
      </div>
    );
  }

  if (!items) {
    return (
      <div className="wrap">
        <Link to="/tech-league" className="link">← Tech League</Link>
        <Loading what="the applicant pool" />
      </div>
    );
  }

  const anySubmitted = all.some((a) => a.status === 'submitted');
  const total = pool.length;
  const withResume = pool.filter((a) => a.resume).length;
  const confirmed = pool.filter((a) => a.personalEmailVerified).length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="wrap">
      <Link to="/tech-league" className="link">← Tech League</Link>

      <header className="page-head" style={{ marginTop: 8 }}>
        <span className="eyebrow eyebrow-mint">Tech League</span>
        <h1>Applicant pool</h1>
        <p className="page-sub">Totals for the season, for chapter reporting. Nothing here is actionable.</p>
      </header>

      <TechLeagueNav count={reviewCount} />

      {!anySubmitted ? (
        <div className="card">
          <Empty
            title="No submitted applications yet"
            body="The breakdown appears once applications start coming in. Drafts are not counted: people edit them for weeks."
          />
        </div>
      ) : (
        <>
          <div className="tl-chips">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                className={scope === s.key ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary'}
                aria-pressed={scope === s.key}
                onClick={() => setScope(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="stat-row">
            <div className="card stat">
              <span className="stat-label">Applicants</span>
              <span className="stat-value">{total}</span>
            </div>
            <div className="card stat">
              <span className="stat-label">Have a resume</span>
              <span className="stat-value">
                {pct(withResume)}%<span className="stat-note">{withResume} of {total}</span>
              </span>
            </div>
            <div className="card stat">
              <span className="stat-label">Confirmed personal email</span>
              <span className="stat-value">
                {pct(confirmed)}%<span className="stat-note">{confirmed} of {total}</span>
              </span>
            </div>
          </div>

          <div className="note note-info" style={{ marginBottom: 18 }}>
            Race and ethnicity are shown here only as totals, for chapter reporting. They never affect a
            decision, and they are left out of the CSV export on the review screen.
          </div>

          {total === 0 ? (
            <div className="card">
              <Empty title="Nobody in this group yet" body="Switch back to everyone who submitted." />
            </div>
          ) : (
            <div className="tl-breakdowns">
              <Breakdown title="Year" rows={tally(pool, (a) => a.year)} total={total} />
              <Breakdown title="Major" rows={tally(pool, (a) => a.major)} total={total} />
              <Breakdown title="Area of interest" rows={tally(pool, (a) => a.interest)} total={total} />
              <Breakdown
                title="Time per week"
                rows={tally(pool, (a) => (a.commitment ? (COMMITMENT_LABELS[a.commitment] ?? a.commitment) : null))}
                total={total}
              />
              <Breakdown
                title="Teammates"
                rows={tally(pool, (a) => (a.teamPref ? (TEAM_PREF_LABELS[a.teamPref] ?? a.teamPref) : null))}
                total={total}
              />
              <Breakdown
                title="Race / ethnicity"
                note="Select all that apply, so these add up to more than the number of applicants."
                rows={tally(pool, (a) => a.raceEthnicity)}
                total={total}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One set of counts as bars.
 *
 * Bars are scaled against the largest row, not against the total, so a field
 * where the top answer is 14% still shows a shape. The number and the
 * percentage are both printed, because the bar is the shape and the number is
 * the answer.
 */
function Breakdown({
  title,
  rows,
  total,
  note,
}: {
  title: string;
  rows: [string, number][];
  total: number;
  note?: string;
}) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <section className="card tl-breakdown">
      <h3 className="tl-block-title" style={{ marginTop: 0 }}>{title}</h3>
      {note && <p className="hint" style={{ marginTop: 0 }}>{note}</p>}
      {rows.length === 0 ? (
        <p className="muted">Nobody answered this.</p>
      ) : (
        <ul className="tl-bars">
          {rows.map(([label, n]) => (
            <li key={label}>
              <span className="tl-bars-label tl-wrap">{label}</span>
              <span className="tl-bars-track" aria-hidden="true">
                <span className="tl-bars-fill" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="tl-bars-value num">
                {n}
                <span className="faint"> · {total ? Math.round((n / total) * 100) : 0}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
