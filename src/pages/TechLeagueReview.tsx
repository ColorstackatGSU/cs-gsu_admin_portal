import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Confirm from '../components/Confirm';
import TechLeagueNav from '../components/TechLeagueNav';
import { ErrorNote, Empty, Loading, OkNote } from '../components/Form';
import { api } from '../lib/api';
import { claim } from '../lib/prefetch';
import { errorMessage } from '../lib/admin';
import { formatDate } from '../lib/format';
import {
  COMMITMENT_LABELS,
  DECISIONS,
  DECISION_ORDER,
  FILTERS,
  SORTS,
  TEAM_PREF_LABELS,
  emailTarget,
  exportCsv,
  needsEmail,
  statusOf,
  waitingDays,
  type Application,
  type Decision,
  type DecisionResult,
  type FilterKey,
  type ReopenResult,
  type SortKey,
} from '../lib/techleague';

/**
 * The application review queue: the screen an officer sits in front of for an
 * hour in September and works until it is empty.
 *
 * Everything here is arranged around that one session rather than around the
 * data. The queue is oldest first because it is worked, not browsed. The list
 * and the application sit side by side so reading one does not lose your place
 * in the other, and the position indicator says where in the run you are. A
 * decision advances to the next application by itself, because the alternative
 * is a click back to a list you have already read.
 *
 * Two things are deliberately slow. A decision emails a student the moment it
 * lands, so the button arms and a second click confirms, and the confirmation
 * names the exact address and says why that address and not the other one.
 * Reopening is slower still: it once turned two finished applications back into
 * drafts with one click each and neither applicant was told, so it sits behind
 * a confirmation that enumerates what it undoes.
 *
 * Every action here is checked again by the API against the signed-in officer.
 * Reaching this page is not what grants anything.
 */

export default function TechLeagueReview() {
  // null means loading, [] means loaded and empty. Same as every other page here.
  const [items, setItems] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterKey>('review');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('oldest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

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

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, all.filter(f.match).length])) as Record<FilterKey, number>,
    [all],
  );

  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter(active.match)
      .filter(
        (a) =>
          !q ||
          [a.fullName, a.email, a.personalEmail, a.major, a.secondMajor, a.interest].some((v) =>
            v?.toLowerCase().includes(q),
          ),
      )
      .sort(SORTS[sort].fn);
  }, [all, active, query, sort]);

  const index = shown.findIndex((a) => a.userId === selectedId);
  /**
   * Looked up in the whole list rather than in `shown`, so an application stays
   * on screen after a decision moves it out of the current filter. The officer
   * sees what they just did until they choose to move on.
   */
  const selected = all.find((a) => a.userId === selectedId) ?? null;

  const handleChange = useCallback(
    (updated: Application, outcome: { ok: boolean; message: string }, advance: boolean) => {
      // Worked out against the list as it was, before this one left the filter.
      // Reading it afterwards would pick whatever slid into the vacated index.
      const next = advance ? (shown[index + 1] ?? shown[index - 1] ?? null) : null;
      setItems((prev) => prev?.map((a) => (a.userId === updated.userId ? updated : a)) ?? prev);
      if (outcome.ok) {
        setSaved(outcome.message);
        setError(null);
      } else {
        setSaved(null);
        setError(outcome.message);
      }
      if (advance && outcome.ok && !active.match(updated)) {
        setSelectedId(next?.userId ?? null);
      }
    },
    [shown, index, active],
  );

  const unsent = counts.unsent ?? 0;

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
        <Loading what="applications" />
      </div>
    );
  }

  return (
    <div className="wrap">
      <Link to="/tech-league" className="link">← Tech League</Link>

      <header className="page-head" style={{ marginTop: 8 }}>
        <span className="eyebrow eyebrow-mint">Tech League</span>
        <h1>Review</h1>
        <p className="page-sub">
          Applications oldest first. A decision emails the applicant, so each one asks twice.
        </p>
      </header>

      <TechLeagueNav count={counts.review} />

      <ErrorNote message={error} />
      <OkNote message={saved} />

      <div className="stat-row">
        <Stat label="Waiting for review" value={counts.review} note={oldestNote(all)} />
        <Stat label="Accepted" value={counts.accepted} />
        <Stat label="Waitlisted" value={counts.waitlisted} />
        <Stat label="Drafts in progress" value={counts.drafts} />
      </div>

      {unsent > 0 && (
        <div className="note note-warn" style={{ marginBottom: 16 }}>
          <strong>
            {unsent} decision email{unsent === 1 ? '' : 's'} did not send.
          </strong>{' '}
          The {unsent === 1 ? 'decision stands' : 'decisions stand'}, but nobody has been told.{' '}
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ marginLeft: 6 }}
            onClick={() => setFilter('unsent')}
          >
            Show them
          </button>
        </div>
      )}

      <div className="tl-chips">
        {FILTERS.filter((f) => f.key !== 'unsent' || unsent > 0).map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary'}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <span className="tl-chip-count">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="tl-toolbar">
        <input
          className="input"
          type="search"
          aria-label="Search applications"
          placeholder="Search name, email, major…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: '1 1 240px', marginBottom: 0 }}
        />
        <select
          className="input"
          aria-label="Sort applications"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          style={{ flex: '0 1 180px', marginBottom: 0 }}
        >
          {(Object.keys(SORTS) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORTS[key].label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={shown.length === 0}
          onClick={() => exportCsv(shown, active.label)}
        >
          Export CSV
        </button>
      </div>

      <div className="tl-split">
        <div className="card tl-list-card">
          {shown.length === 0 ? (
            <Empty
              title="Nothing here"
              body={
                query
                  ? 'No applications match that search.'
                  : filter === 'review'
                    ? 'Nothing waiting. The queue is clear.'
                    : 'No applications in this filter.'
              }
            />
          ) : (
            <ul className="tl-list">
              {shown.map((a) => {
                const state = statusOf(a);
                return (
                  <li key={a.userId}>
                    <button
                      type="button"
                      className={a.userId === selectedId ? 'tl-item is-selected' : 'tl-item'}
                      aria-current={a.userId === selectedId ? 'true' : undefined}
                      onClick={() => setSelectedId(a.userId)}
                    >
                      <span className="tl-item-main">
                        <span className="tl-item-name">{a.fullName || a.email}</span>
                        <span className="tl-item-sub">
                          {[a.year, a.major].filter(Boolean).join(' · ') || a.email}
                        </span>
                      </span>
                      <span className="tl-item-side">
                        <span className={state.pillClass}>{state.label}</span>
                        <span className="tl-item-flags faint">
                          {needsEmail(a) && <span className="tl-flag-warn">Email not sent</span>}
                          {a.resume && <span>PDF</span>}
                          <span>{a.submittedAt ? formatDate(a.submittedAt) : 'Draft'}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="tl-pane">
          {selected ? (
            <Detail
              key={selected.userId}
              application={selected}
              position={index >= 0 ? `${index + 1} of ${shown.length}` : 'Moved out of this filter'}
              onPrev={index > 0 ? () => setSelectedId(shown[index - 1].userId) : null}
              onNext={index >= 0 && index < shown.length - 1 ? () => setSelectedId(shown[index + 1].userId) : null}
              onChange={handleChange}
            />
          ) : (
            <div className="card">
              <Empty
                title="Pick an application"
                body={
                  <>
                    Choose one on the left to read it. <kbd className="tl-kbd">J</kbd> and{' '}
                    <kbd className="tl-kbd">K</kbd> move through the list, <kbd className="tl-kbd">A</kbd>{' '}
                    <kbd className="tl-kbd">W</kbd> <kbd className="tl-kbd">D</kbd> arm accept, waitlist and
                    deny.
                  </>
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Oldest 14 days" under the review count, or nothing when the queue is clear. */
function oldestNote(items: Application[]): string | undefined {
  const waiting = items.filter((a) => a.status === 'submitted' && !a.decision);
  if (waiting.length === 0) return 'Queue is clear';
  const oldest = waiting.reduce((max, a) => Math.max(max, waitingDays(a.submittedAt)), 0);
  return `Oldest ${oldest} day${oldest === 1 ? '' : 's'}`;
}

/** Same block the members and resume-push screens use, so the numbers read alike. */
function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {note && <span className="stat-note">{note}</span>}
      </span>
    </div>
  );
}

/* ============================================================================
   ONE APPLICATION
   ==========================================================================*/

type Outcome = { ok: boolean; message: string };

function Detail({
  application: a,
  position,
  onPrev,
  onNext,
  onChange,
}: {
  application: Application;
  position: string;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onChange: (updated: Application, outcome: Outcome, advance: boolean) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** Which decision is armed, waiting for its second click. */
  const [arming, setArming] = useState<Decision | null>(null);
  const [reopening, setReopening] = useState(false);

  const name = a.fullName || a.email;
  const state = statusOf(a);
  const target = emailTarget(a);

  /* A new application arrives disarmed, because the parent gives this component
     key={userId} and React discards the whole thing when the selection moves.
     That is load-bearing, not incidental: carrying an armed Deny across a J
     press would put the confirmation for one person above the application of
     another, and the second click would land on the wrong student. */

  const act = useCallback(
    async (key: string, run: () => Promise<DecisionResult | ReopenResult>, done: string, advance: boolean) => {
      setBusy(key);
      setProblem(null);
      try {
        const result = await run();
        setArming(null);
        setReopening(false);
        // An unsent email is not a failed decision. Saying "that did not work"
        // here is how an officer ends up pressing Accept a second time.
        const outcome: Outcome =
          'emailed' in result && !result.emailed
            ? {
                ok: false,
                message:
                  `${name}: the decision was saved but the email did not send. ` +
                  `${result.emailProblem ?? 'No reason given.'} Use "Send it now" to try again.`,
              }
            : { ok: true, message: done };
        onChange(result.application, outcome, advance);
      } catch (e) {
        setProblem(errorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [name, onChange],
  );

  /**
   * Keyboard review. J and K move, A, W and D arm a decision, Escape disarms.
   *
   * The handler this was ported from excluded only `input, textarea, select`,
   * which meant pressing D while any button held focus armed a Deny, and the
   * button that most often holds focus on this screen is the one that just
   * armed something. Three further exclusions:
   *
   *   - any modifier held, so Ctrl+D bookmarks and Alt+D reaches the address bar
   *   - contenteditable, which is a text box that is not an <input>
   *   - anything inside a confirmation, so the second half of a two-step
   *     decision cannot be typed over by a shortcut that starts a third one
   *
   * Escape is handled before the exclusions, on purpose: backing out of a
   * confirmation has to work from inside it.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.defaultPrevented) return;
      const key = event.key.toLowerCase();

      if (key === 'escape') {
        setArming(null);
        setReopening(false);
        return;
      }

      const target = event.target as Element | null;
      if (
        target?.closest?.(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [aria-modal="true"], .note-warn',
        )
      ) {
        return;
      }

      if (key === 'j') {
        onNext?.();
        return;
      }
      if (key === 'k') {
        onPrev?.();
        return;
      }
      if (a.status !== 'submitted') return;
      const armed = DECISION_ORDER.find((d) => DECISIONS[d].key === key && a.decision !== d);
      if (armed) {
        event.preventDefault();
        setArming(armed);
        setReopening(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [a.status, a.decision, onNext, onPrev]);

  const facts: [string, string | null][] = [
    ['Year', a.year],
    ['Major', a.major],
    ...(a.secondMajor ? ([['Second major', a.secondMajor]] as [string, string][]) : []),
    ['Graduating', a.gradTerm],
    ['Interest', a.interest],
    ['Teammates', a.teamPref ? (TEAM_PREF_LABELS[a.teamPref] ?? a.teamPref) : null],
    ['Time', a.commitment ? (COMMITMENT_LABELS[a.commitment] ?? a.commitment) : null],
    ['Race / ethnicity', a.raceEthnicity.length ? a.raceEthnicity.join(', ') : null],
  ];

  return (
    <article className="card tl-detail" aria-labelledby="tl-detail-name">
      <div className="tl-detail-nav">
        <span className="muted faint num">{position}</span>
        <div className="tl-detail-arrows">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => onPrev?.()}
            disabled={!onPrev}
            aria-label="Previous application (K)"
          >
            ←
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => onNext?.()}
            disabled={!onNext}
            aria-label="Next application (J)"
          >
            →
          </button>
        </div>
      </div>

      <header className="tl-detail-head">
        <div>
          <h2 id="tl-detail-name" className="tl-wrap">{a.fullName || 'No name yet'}</h2>
          <p className="page-sub" style={{ marginTop: 4 }}>
            {a.submittedAt
              ? `Submitted ${formatDate(a.submittedAt)}${
                  !a.decision
                    ? ` · waiting ${waitingDays(a.submittedAt)} day${waitingDays(a.submittedAt) === 1 ? '' : 's'}`
                    : ''
                }`
              : `Draft · last edited ${formatDate(a.updatedAt)}`}
          </p>
        </div>
        <span className={state.pillClass}>{state.label}</span>
      </header>

      {a.status === 'submitted' && (
        <section className="tl-decide" aria-label="Decision">
          {arming ? (
            <Confirm
              question={`${DECISIONS[arming].verb} ${name}?`}
              points={[
                <>
                  We email <strong className="tl-wrap">{target.address}</strong> ({target.note}) straight away.
                </>,
                ...(a.decision === 'accepted' && arming !== 'accepted'
                  ? ['They also come off their team.']
                  : []),
                ...(a.decision
                  ? [
                      <>
                        This replaces their current decision, <strong>{a.decision}</strong>.
                      </>,
                    ]
                  : []),
              ]}
              confirmLabel={`${DECISIONS[arming].verb} and send email`}
              busy={busy === arming}
              busyLabel="Sending…"
              danger={DECISIONS[arming].danger}
              problem={problem}
              style={{ maxWidth: 'none' }}
              onConfirm={() =>
                void act(
                  arming,
                  () =>
                    api.post<DecisionResult>(`/admin/tech-league/applications/${a.userId}/decision`, {
                      decision: arming,
                    }),
                  `${DECISIONS[arming].past} ${name} and emailed them.`,
                  true,
                )
              }
              onCancel={() => {
                setArming(null);
                setProblem(null);
              }}
            />
          ) : (
            <>
              <div className="tl-decide-buttons">
                {DECISION_ORDER.filter((d) => a.decision !== d).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={DECISIONS[d].danger ? 'btn btn-danger' : 'btn btn-primary'}
                    onClick={() => setArming(d)}
                  >
                    {a.decision ? `Change to ${DECISIONS[d].verb.toLowerCase()}` : DECISIONS[d].verb}
                    <kbd className="tl-kbd" aria-hidden="true">
                      {DECISIONS[d].key.toUpperCase()}
                    </kbd>
                  </button>
                ))}
              </div>
              <p className="hint" style={{ marginTop: 10 }}>
                Decision email goes to <strong className="tl-wrap">{target.address}</strong> ({target.note}).
              </p>
            </>
          )}

          {needsEmail(a) && !arming && (
            <div className="note note-warn tl-unsent">
              <span>
                The <strong>{a.decision}</strong> email has not been sent. The decision stands; they have not
                been told.
              </span>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={busy === 'email'}
                onClick={() =>
                  void act(
                    'email',
                    () => api.post<DecisionResult>(`/admin/tech-league/applications/${a.userId}/email`),
                    `Emailed ${name} their decision.`,
                    false,
                  )
                }
              >
                {busy === 'email' ? 'Sending…' : 'Send it now'}
              </button>
            </div>
          )}

          {a.decision && a.decisionEmailedAt && !arming && (
            <p className="hint" style={{ marginTop: 10 }}>
              {state.label} {formatDate(a.decidedAt)}, emailed {formatDate(a.decisionEmailedAt)}.
            </p>
          )}
        </section>
      )}

      {problem && !arming && !reopening && <p className="field-error">{problem}</p>}

      <h3 className="tl-block-title">At a glance</h3>
      <dl className="tl-facts">
        <div className="is-wide">
          <dt>School email</dt>
          <dd className="tl-wrap">{a.email}</dd>
        </div>
        <div className="is-wide">
          <dt>Personal email</dt>
          <dd className="tl-wrap">
            {a.personalEmail || '—'}{' '}
            {a.personalEmail && (
              <span className={a.personalEmailVerified ? 'pill pill-tl-accepted' : 'pill pill-tl-waitlisted'}>
                {a.personalEmailVerified ? 'Confirmed' : 'Not confirmed'}
              </span>
            )}
          </dd>
        </div>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="tl-wrap">{value || '—'}</dd>
          </div>
        ))}
      </dl>

      <h3 className="tl-block-title">Resume</h3>
      {a.resume ? (
        <Resume userId={a.userId} name={a.resume.name} />
      ) : (
        <p className="muted">No resume on file.</p>
      )}

      <h3 className="tl-block-title">In their words</h3>
      {(
        [
          ['Why they want to join', a.whyJoin],
          ['What they want out of the semester', a.goals],
          ['Experience so far', a.experience],
        ] as [string, string | null][]
      ).map(([label, value]) => (
        <div key={label} className="tl-answer">
          <h4>{label}</h4>
          {value ? <blockquote className="tl-wrap">{value}</blockquote> : <p className="muted">Not answered.</p>}
        </div>
      ))}

      {/* Kept away from the decision buttons and behind its own confirmation, because
          it undoes more than it looks like it does. */}
      {a.status === 'submitted' && (
        <div className="tl-reopen">
          {reopening ? (
            <Confirm
              question={`Reopen ${name}'s application?`}
              points={[
                'It goes back to a draft, and they have to submit it again.',
                a.decision ? (
                  <>
                    Their decision (<strong>{a.decision}</strong>) is cleared.
                  </>
                ) : (
                  'There is no decision on it to clear.'
                ),
                a.decision === 'accepted'
                  ? 'They come off their team until they are accepted again.'
                  : 'Their team membership is unaffected.',
                'They are not emailed. Tell them yourself if they need to act.',
              ]}
              confirmLabel="Yes, reopen it"
              danger
              busy={busy === 'reopen'}
              busyLabel="Reopening…"
              problem={problem}
              style={{ maxWidth: 'none' }}
              onConfirm={() =>
                void act(
                  'reopen',
                  () => api.post<ReopenResult>(`/admin/tech-league/applications/${a.userId}/reopen`),
                  `Reopened ${name}'s application. It is a draft again.`,
                  false,
                )
              }
              onCancel={() => {
                setReopening(false);
                setProblem(null);
              }}
            />
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReopening(true)}>
              Reopen this application for edits…
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * The resume, fetched as bytes and opened in a tab.
 *
 * Not a plain link: the API wants the officer's bearer token and the browser's
 * own navigation would arrive without it, so the link would open a 401 page.
 */
function Resume({ userId, name }: { userId: string; name: string }) {
  const [opening, setOpening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function open() {
    if (opening) return;
    setOpening(true);
    setProblem(null);
    try {
      const file = await api.blob(`/admin/tech-league/applications/${userId}/resume`);
      const url = URL.createObjectURL(file);
      window.open(url, '_blank', 'noopener,noreferrer');
      // Revoked on a delay rather than immediately: the new tab has to have
      // started loading from the URL before it stops resolving.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="tl-resume">
      <span className="tl-wrap">{name}</span>
      <button type="button" className="btn btn-sm btn-secondary" onClick={() => void open()} disabled={opening}>
        {opening ? 'Opening…' : 'Open'}
      </button>
      {problem && <p className="field-error" style={{ flexBasis: '100%' }}>{problem}</p>}
    </div>
  );
}
