import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Confirm from '../components/Confirm';
import RichTextEditor from '../components/RichTextEditor';
import TechLeagueNav from '../components/TechLeagueNav';
import { Empty, ErrorNote, Field, Loading } from '../components/Form';
import { api } from '../lib/api';
import { claim } from '../lib/prefetch';
import { errorMessage } from '../lib/admin';
import { wrapTemplate } from '../lib/memberEmailTemplate';
import {
  currentUnsaved,
  proceedAnyway,
  setUnsaved,
  stayHere,
  subscribeUnsaved,
} from '../lib/unsaved';
import {
  FILTERS,
  SORTS,
  leagueAddresses,
  type Application,
  type LeagueEmailResult,
} from '../lib/techleague';

/**
 * The email blast, for the Tech League: updates to everyone who got in.
 *
 * Only accepted applicants are ever listed, and everyone listed starts checked,
 * because "tell the league" is the common case and unchecking a few is quicker
 * than checking sixty. The list is the officer's view of who is in; the server
 * checks acceptance again when it sends, so somebody reopened by another officer
 * while this one was writing does not get the email anyway.
 *
 * Same composer and same template as Email members, with its own footer line:
 * plenty of the league are not on the member roster, and the member footer would
 * tell them they are.
 */

const STARTER = '<p>Hi {{first_name}},</p><p><br></p><p><br></p><p>Cheers,<br>ColorStack Tech League</p>';

const WHY = 'You are getting this because you were accepted into the ColorStack Tech League.';

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

type Outcome = LeagueEmailResult & { subject: string };

export default function TechLeagueEmail() {
  const [items, setItems] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(STARTER);

  /** A send reaches inboxes and cannot be recalled, so it is confirmed above the button. */
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    let cancelled = false;
    claim<Application[]>('/admin/tech-league/applications')
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        setSelected(new Set(rows.filter((a) => a.decision === 'accepted').map((a) => a.userId)));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const all = useMemo(() => items ?? [], [items]);
  const reviewCount = useMemo(() => all.filter(FILTERS[0].match).length, [all]);
  const accepted = useMemo(
    () => all.filter((a) => a.decision === 'accepted').sort(SORTS.name.fn),
    [all],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accepted;
    return accepted.filter((a) =>
      [a.fullName, a.email, a.personalEmail, a.major, a.year]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [accepted, search]);

  const checked = accepted.filter((a) => selected.has(a.userId));
  const allShownChecked = shown.length > 0 && shown.every((a) => selected.has(a.userId));

  /**
   * A written message is work, and the Tech League nav moves between routes, so
   * clicking Scores would unmount the draft without a word. Registered the same
   * way score entry registers staged scores; the question renders below.
   */
  const drafted = subject.trim() !== '' || body !== STARTER;

  useEffect(() => {
    setUnsaved(drafted ? 'an unsent email' : null);
    return () => setUnsaved(null);
  }, [drafted]);

  useEffect(() => {
    if (!drafted) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [drafted]);

  const [leaving, setLeaving] = useState(currentUnsaved().pending !== null);
  useEffect(() => subscribeUnsaved((u) => setLeaving(u.pending !== null)), []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const a of shown) {
        if (allShownChecked) next.delete(a.userId);
        else next.add(a.userId);
      }
      return next;
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (checked.length === 0) return;
    setOutcome(null);
    setProblem(null);
    setConfirming(true);
  }

  async function send() {
    setSending(true);
    setProblem(null);
    const cleanSubject = subject.trim();
    try {
      const result = await api.post<LeagueEmailResult>('/admin/tech-league/accepted/email', {
        subject: cleanSubject,
        htmlBody: wrapTemplate(body, cleanSubject, WHY),
        userIds: checked.map((a) => a.userId),
      });
      setOutcome({ ...result, subject: cleanSubject });
      setConfirming(false);

      if (result.failed.length === 0) {
        // Sent is done. Clearing the composer is what stops the same email going
        // out twice to a double click, and it releases the leave guard.
        setSubject('');
        setBody(STARTER);
      } else {
        // Keep the draft and narrow the checks to the people it did not reach, so
        // pressing send again is a retry for them and not a second copy for everyone.
        const failed = new Set(result.failed.map((s) => s.toLowerCase()));
        setSelected(new Set(accepted.filter((a) => failed.has(a.email.toLowerCase())).map((a) => a.userId)));
      }
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

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
        <Loading what="the accepted list" />
      </div>
    );
  }

  const bodyWritten = body !== STARTER && body.replace(/<[^>]+>/g, '').trim() !== '';

  return (
    <div className="wrap">
      <Link to="/tech-league" className="link">← Tech League</Link>

      <header className="page-head" style={{ marginTop: 8 }}>
        <span className="eyebrow eyebrow-mint">Tech League</span>
        <h1>Email the league</h1>
        <p className="page-sub">
          Updates for everyone accepted into the Tech League. Nobody else is on this list, and
          acceptance is checked again at the moment you send.
        </p>
      </header>

      <TechLeagueNav count={reviewCount} />

      {leaving && (
        <section className="tl-staged" aria-label="Leaving with an unsent email">
          <Confirm
            question="Leave without sending this email?"
            points={[
              'Nothing has been sent, so nobody in the league has seen it.',
              'The subject and message you wrote are lost.',
              'Staying keeps them, and you can carry on where you left off.',
            ]}
            confirmLabel="Discard and leave"
            danger
            onConfirm={proceedAnyway}
            onCancel={stayHere}
          />
        </section>
      )}

      {accepted.length === 0 ? (
        <div className="card">
          <Empty
            title="Nobody accepted yet"
            body="The league shows up here once applicants are accepted. Until then there is nobody to email."
          >
            <Link to="/tech-league/review" className="btn btn-primary btn-sm">Go to review</Link>
          </Empty>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <div>
                <h2 className="card-title">Who</h2>
                <p className="page-sub" style={{ marginTop: 4 }}>
                  <strong>{checked.length}</strong> of {accepted.length} accepted checked.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={toggleShown}
                disabled={shown.length === 0}
              >
                {allShownChecked
                  ? search.trim() ? 'Uncheck these' : 'Uncheck everyone'
                  : search.trim() ? 'Check these' : 'Check everyone'}
              </button>
            </div>

            <input
              className="input"
              type="search"
              placeholder="Search name, email, major…"
              aria-label="Search the accepted list"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {shown.length === 0 ? (
              <p className="muted" style={{ margin: '14px 0 0' }}>Nobody accepted matches that search.</p>
            ) : (
              <ul className="tl-recipients">
                {shown.map((a) => {
                  const on = selected.has(a.userId);
                  return (
                    <li key={a.userId}>
                      <label className={on ? 'tl-recipient is-on' : 'tl-recipient'}>
                        <input type="checkbox" checked={on} onChange={() => toggle(a.userId)} />
                        <span className="tl-item-main">
                          <span className="tl-item-name">{a.fullName || a.email}</span>
                          <span className="tl-item-sub">
                            {[a.year, a.major].filter(Boolean).join(' · ') || 'No year or major given'}
                          </span>
                        </span>
                        <span className="tl-recipient-to tl-wrap">{leagueAddresses(a).join(', ')}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <h2 className="card-title">Message</h2>
            </div>

            <Field
              label="Subject"
              required
              value={subject}
              onChange={setSubject}
              maxLength={200}
              placeholder="Team formation opens Friday"
            />

            <div className="field" style={{ marginBottom: 0 }}>
              <span className="label">
                Message<span className="label-req">Required</span>
              </span>
              <RichTextEditor
                value={body}
                onChange={setBody}
                placeholder="Write your update. Use {{first_name}} for their first name."
              />
              <p className="hint">
                {'{{first_name}}'} and {'{{last_name}}'} fill in from the name on each person's
                application. The chapter header and footer wrap around your message, and the footer
                says they are getting it because they were accepted into the Tech League.
              </p>
            </div>
          </section>

          {outcome && <OutcomeNote outcome={outcome} />}

          {confirming && (
            <Confirm
              style={{ marginBottom: 16 }}
              question={`Send “${subject.trim()}” to ${people(checked.length)}?`}
              points={[
                'Each person gets their own copy at their school address, and at their personal address too if they confirmed it.',
                'Anyone no longer accepted when this runs is left out.',
                'Sent mail cannot be recalled.',
              ]}
              confirmLabel={`Send to ${checked.length}`}
              busyLabel="Sending…"
              busy={sending}
              problem={problem}
              onConfirm={() => void send()}
              onCancel={() => {
                setConfirming(false);
                setProblem(null);
              }}
            />
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={sending || confirming || checked.length === 0 || !subject.trim() || !bodyWritten}
          >
            {sending
              ? 'Sending…'
              : checked.length === 0
                ? 'Check at least one person'
                : !subject.trim()
                  ? 'Add a subject'
                  : !bodyWritten
                    ? 'Write your message'
                    : `Send to ${people(checked.length)}`}
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * What the send did, next to the button that did it rather than at the top of a
 * long page, where the officer who just pressed send would not be looking.
 */
function OutcomeNote({ outcome }: { outcome: Outcome }) {
  const { sent, failed, skipped, subject } = outcome;
  const skippedLine =
    skipped > 0
      ? ` ${people(skipped)} ${skipped === 1 ? 'was' : 'were'} left out because they are no longer accepted.`
      : '';

  if (failed.length === 0) {
    return (
      <div className="note note-ok" style={{ marginBottom: 16 }} role="status">
        Sent “{subject}” to {people(sent)}.{skippedLine}
      </div>
    );
  }

  return (
    <div className="note note-warn" style={{ marginBottom: 16 }} role="alert">
      Sent “{subject}” to {people(sent)}, but it did not reach {people(failed.length)}:{' '}
      <span className="tl-wrap">
        {failed.slice(0, 5).join(', ')}
        {failed.length > 5 ? ` and ${failed.length - 5} more` : ''}
      </span>
      . Only they are still checked, so sending again goes to them alone.{skippedLine}
    </div>
  );
}
