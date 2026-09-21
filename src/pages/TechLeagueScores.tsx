import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Confirm from '../components/Confirm';
import TechLeagueNav from '../components/TechLeagueNav';
import { Empty, ErrorNote, Loading, OkNote } from '../components/Form';
import { api } from '../lib/api';
import { claim } from '../lib/prefetch';
import { errorMessage } from '../lib/admin';
import {
  currentUnsaved,
  proceedAnyway,
  setUnsaved,
  stayHere,
  subscribeUnsaved,
} from '../lib/unsaved';
import {
  TEAM_MIN_MEMBERS,
  scoreKey,
  scoreProblem,
  scoreText,
  type ScoreEvent,
  type ScoreTeam,
  type Scores,
} from '../lib/techleague';

/**
 * Score entry for the season's events.
 *
 * Typing in this table stages a change and nothing more. Scores go live on every
 * open leaderboard within seconds of being written, and a leaderboard that moves
 * because somebody tabbed through the wrong row is a leaderboard nobody trusts
 * again, so a save happens only after the officer has read a list of exactly what
 * is about to change and confirmed it.
 *
 * Staged edits live in this component and nowhere else, which means closing the
 * tab loses them. The browser is asked to warn about that rather than the work
 * being silently thrown away.
 */

export default function TechLeagueScores() {
  const [data, setData] = useState<Scores | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Typed values keyed by team:event. A draft equal to the saved value is not a change. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** Per-cell failures from the last save, keyed the same way. */
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    claim<Scores>('/admin/tech-league/scores')
      .then((rows) => {
        if (!cancelled) setData(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changes = useMemo(() => {
    if (!data) return [];
    const list: {
      key: string;
      team: ScoreTeam;
      event: ScoreEvent;
      before: string;
      after: string;
      problem: string | null;
    }[] = [];
    for (const team of data.teams) {
      for (const event of data.events) {
        const key = scoreKey(team.id, event.id);
        if (!(key in drafts)) continue;
        const before = scoreText(team.scores[event.id]);
        const after = drafts[key].trim();
        if (after === before) continue;
        list.push({ key, team, event, before, after, problem: scoreProblem(after, event) });
      }
    }
    return list;
  }, [data, drafts]);

  const invalid = changes.filter((c) => c.problem).length;
  const showReview = reviewing && changes.length > 0 && invalid === 0;

  /**
   * Leaving the page drops staged scores, so the browser asks first. Only while
   * there is something to lose: an unconditional handler makes every navigation
   * off a read-only table pop a dialog, and people learn to dismiss it.
   */
  useEffect(() => {
    if (changes.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes.length]);

  /**
   * beforeunload above covers closing the tab. It does not fire for a client side route
   * change, which is what every link in this app does, so clicking Applicant pool used to
   * throw staged scores away without a word. This registers what would be lost; the nav
   * asks before it moves, and the question renders below.
   *
   * Cleared on unmount as well as when the edits go, or a screen that is no longer here
   * would block navigation from everywhere else.
   */
  useEffect(() => {
    setUnsaved(
      changes.length === 0
        ? null
        : `${changes.length} score ${changes.length === 1 ? 'change' : 'changes'} not saved yet`,
    );
    return () => setUnsaved(null);
  }, [changes.length]);

  const [leaving, setLeaving] = useState(currentUnsaved().pending !== null);
  useEffect(() => subscribeUnsaved((u) => setLeaving(u.pending !== null)), []);

  function edit(key: string, value: string) {
    setSaved(null);
    setFailures((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDrafts((prev) => ({ ...prev, [key]: value }));
  }

  function discard() {
    setDrafts({});
    setFailures({});
    setReviewing(false);
  }

  async function saveAll() {
    if (!data) return;
    setSaving(true);
    setError(null);
    const failed: Record<string, string> = {};
    const landed = new Map<string, number | null>();

    // One request per change rather than one batch: a rejected score is then
    // attributable to its own cell, and the rest of the evening's work still
    // lands instead of being rolled back with it.
    for (const change of changes) {
      const points = change.after === '' ? null : Number(change.after);
      try {
        await api.put<{ ok: boolean }>('/admin/tech-league/scores', {
          teamId: change.team.id,
          eventId: change.event.id,
          points,
        });
        landed.set(change.key, points);
      } catch (e) {
        failed[change.key] = errorMessage(e);
      }
    }

    setData((prev) =>
      prev
        ? {
            ...prev,
            teams: prev.teams.map((team) => {
              const scores = { ...team.scores };
              for (const event of prev.events) {
                const key = scoreKey(team.id, event.id);
                if (!landed.has(key)) continue;
                const points = landed.get(key) ?? null;
                if (points === null) delete scores[event.id];
                else scores[event.id] = points;
              }
              return { ...team, scores };
            }),
          }
        : prev,
    );
    setDrafts((prev) => {
      const next = { ...prev };
      for (const key of landed.keys()) delete next[key];
      return next;
    });
    setFailures(failed);
    setReviewing(false);
    setSaving(false);

    const ok = landed.size;
    const bad = Object.keys(failed).length;
    if (ok > 0) {
      setSaved(
        `Saved ${ok} ${ok === 1 ? 'score' : 'scores'}. The leaderboard has ${ok === 1 ? 'it' : 'them'} now.` +
          (bad > 0
            ? ` ${bad} ${bad === 1 ? 'change' : 'changes'} did not save and ${bad === 1 ? 'is' : 'are'} still marked below.`
            : ''),
      );
    }
    if (ok === 0 && bad > 0) {
      setError(`Nothing saved. ${bad} ${bad === 1 ? 'change is' : 'changes are'} marked below with the reason.`);
    }
  }

  if (error && !data) {
    return (
      <div className="wrap">
        <Link to="/tech-league" className="link">← Tech League</Link>
        <ErrorNote message={error} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="wrap">
        <Link to="/tech-league" className="link">← Tech League</Link>
        <Loading what="teams and events" />
      </div>
    );
  }

  const { events, teams } = data;

  return (
    <div className="wrap">
      <Link to="/tech-league" className="link">← Tech League</Link>

      <header className="page-head" style={{ marginTop: 8 }}>
        <span className="eyebrow eyebrow-mint">Tech League</span>
        <h1>Scores</h1>
        <p className="page-sub">
          Raw points against each event's rubric. Type as many as you like, then review and save them
          together. Empty a box to clear a score.
        </p>
      </header>

      <TechLeagueNav />

      <ErrorNote message={error} />
      <OkNote message={saved} />

      {teams.length === 0 ? (
        <div className="card">
          <Empty
            title="No teams yet"
            body={`Teams appear here once accepted members form them. A team under ${TEAM_MIN_MEMBERS} members stays off the leaderboard even once it is scored.`}
          />
        </div>
      ) : (
        <>
          {leaving && (
            <section className="tl-staged" aria-label="Leaving with unsaved changes">
              <Confirm
                question={`Leave with ${changes.length} unsaved score ${changes.length === 1 ? 'change' : 'changes'}?`}
                points={[
                  'Nothing has been sent to the leaderboard yet, so nothing changes for anyone.',
                  'The numbers you typed are lost and you would have to enter them again.',
                  'Staying keeps them, and you can carry on where you left off.',
                ]}
                confirmLabel="Discard and leave"
                danger
                onConfirm={proceedAnyway}
                onCancel={stayHere}
              />
            </section>
          )}

          {changes.length > 0 && !leaving && (
            <section className="tl-staged" aria-label="Unsaved score changes">
              {showReview ? (
                <Confirm
                  question={`Save ${changes.length} score ${changes.length === 1 ? 'change' : 'changes'}?`}
                  points={[
                    // The consequence, last, where the eye lands before the button.
                    ...changes.map((c) => (
                    <span key={c.key}>
                      <strong className="tl-wrap">{c.team.name}</strong>
                      <span className="muted"> · {c.event.name}: </span>
                      {c.before === '' ? (
                        <>
                          new score of <strong>{c.after}</strong>
                        </>
                      ) : c.after === '' ? (
                        <>
                          <strong>{c.before}</strong> cleared
                        </>
                      ) : (
                        <>
                          {c.before} → <strong>{c.after}</strong>
                        </>
                      )}
                    </span>
                    )),
                    <strong>Every open leaderboard picks these up within a few seconds.</strong>,
                  ]}
                  confirmLabel={changes.length === 1 ? 'Save it' : `Save all ${changes.length}`}
                  busy={saving}
                  busyLabel="Saving…"
                  style={{ maxWidth: 'none' }}
                  onConfirm={() => void saveAll()}
                  onCancel={() => setReviewing(false)}
                />
              ) : (
                <div className="note note-warn tl-staged-bar">
                  <span>
                    <strong>
                      {changes.length} score {changes.length === 1 ? 'change' : 'changes'} not saved yet.
                    </strong>
                    {invalid > 0 && ` Fix the ${invalid === 1 ? 'one' : invalid} marked in red first.`}{' '}
                    Every open leaderboard picks these up within a few seconds of saving.
                  </span>
                  <span className="tl-staged-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={invalid > 0}
                      onClick={() => setReviewing(true)}
                    >
                      Review and save
                    </button>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={discard}>
                      Discard
                    </button>
                  </span>
                </div>
              )}
            </section>
          )}

          {/* Said out loud, because a table that scrolls inside its own frame gives
              no hint that it does, and on a phone the first event column is all
              you can see. Hidden on anything wide enough to show the whole rubric. */}
          <p className="hint tl-scroll-hint">Scroll the table sideways to reach the other events.</p>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-scroll">
              <table className="table tl-scores">
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    {events.map((event) => (
                      <th key={event.id} scope="col">
                        {event.name}
                        <span className="tl-th-sub">
                          out of {event.max} · {event.weight}%
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.id}>
                      <th scope="row">
                        <span className="tl-wrap">{team.name}</span>
                        <span className="tl-th-sub">
                          {team.members} of {team.capacity} members
                          {team.members < TEAM_MIN_MEMBERS && ' · off the leaderboard'}
                        </span>
                      </th>
                      {events.map((event) => {
                        const key = scoreKey(team.id, event.id);
                        const stored = scoreText(team.scores[event.id]);
                        return (
                          <ScoreCell
                            key={event.id}
                            team={team}
                            event={event}
                            value={key in drafts ? drafts[key] : stored}
                            stored={stored}
                            failure={failures[key] ?? null}
                            onChange={(value) => edit(key, value)}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One score box, which has to say three things at once: what is in it, whether
 * that differs from what is saved, and what it used to be. The "was" line is the
 * part that matters, because the common mistake is typing into the row below the
 * one you meant.
 */
function ScoreCell({
  team,
  event,
  value,
  stored,
  failure,
  onChange,
}: {
  team: ScoreTeam;
  event: ScoreEvent;
  value: string;
  stored: string;
  failure: string | null;
  onChange: (value: string) => void;
}) {
  const pending = value.trim() !== stored;
  const problem = (pending ? scoreProblem(value, event) : null) ?? failure;

  return (
    <td className={problem ? 'tl-cell is-bad' : pending ? 'tl-cell is-pending' : 'tl-cell'}>
      <label className="sr-only" htmlFor={`score-${team.id}-${event.id}`}>
        {team.name}, {event.name}, out of {event.max}
        {pending ? ', not saved yet' : ''}
      </label>
      <input
        id={`score-${team.id}-${event.id}`}
        className={problem ? 'input input-bad tl-cell-input' : 'input tl-cell-input'}
        type="number"
        inputMode="decimal"
        min="0"
        max={event.max}
        step="0.5"
        placeholder="—"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-invalid={problem ? true : undefined}
      />
      {pending && !problem && (
        <span className="tl-cell-was faint">was {stored === '' ? '—' : stored}</span>
      )}
      {problem && (
        <span className="field-error" role="alert">
          {problem}
        </span>
      )}
    </td>
  );
}
