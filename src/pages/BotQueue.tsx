import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { errorMessage, type Member } from '../lib/admin';
import {
  REASON_HELP,
  REASON_LABEL,
  statusPillClass,
  type Attempt,
} from '../lib/discord';
import { refreshBotQueue } from '../hooks/useBotQueueCount';
import { Empty, ErrorNote, Loading, OkNote } from '../components/Form';

/**
 * Everybody who clicked Verify in the Discord server and could not be matched.
 *
 * This screen is the whole reason the bot moved. The old one had a /pending command that
 * listed this queue — except nothing ever wrote to it, so it could only ever print "No
 * pending verifications found." Members who failed verification were told to fill in a
 * form they had usually already filled in, and there was no record anywhere that they had
 * tried.
 *
 * It replaces /approve and /deny outright. Same outcome, but the officer picks the member
 * out of a searchable list instead of retyping somebody's name, email and LinkedIn URL
 * into a slash command and hoping it matches.
 */
export default function BotQueue() {
  const [showResolved, setShowResolved] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  /* Kept with the filter they were fetched for, so "still loading after the
     filter changed" is derived rather than set synchronously in the effect. */
  const [loaded, setLoaded] = useState<{ resolved: boolean; rows: Attempt[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const fetchAll = useCallback(
    () =>
      Promise.all([
        api.get<Attempt[]>(`/admin/discord/queue?status=${showResolved ? 'all' : 'pending'}`),
        // The member list is the search index for linking. It is already the admin
        // members endpoint, so there is no second search API to keep in step.
        api.get<Member[]>('/admin/members'),
      ]),
    [showResolved],
  );

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then(([q, m]) => {
        if (cancelled) return;
        setLoaded({ resolved: showResolved, rows: q });
        setMembers(m);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoaded({ resolved: showResolved, rows: [] });
        setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAll, showResolved]);

  const rows = loaded && loaded.resolved === showResolved ? loaded.rows : null;

  const reload = useCallback(async () => {
    try {
      const [q, m] = await fetchAll();
      setLoaded({ resolved: showResolved, rows: q });
      setMembers(m);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
    void refreshBotQueue();
  }, [fetchAll, showResolved]);

  const loading = rows === null;
  const pending = (rows ?? []).filter((r) => r.status === 'pending');

  return (
    <div className="wrap">
      <header className="page-head">
        <span className="eyebrow eyebrow-violet">Discord</span>
        <h1>Verification queue</h1>
        <p className="page-sub">
          People who clicked <strong>Verify Membership</strong> in the server and could not be
          matched to a member record automatically. Until one is resolved, they are sitting in
          the server with no access and have been told an officer is on it.
        </p>
      </header>

      <ErrorNote message={error} />
      <OkNote message={done} />

      <div className="note note-info" style={{ marginBottom: 22 }}>
        <strong>Linking does three things at once:</strong> it ties the Discord account to
        that member record, grants the chapter roles in the server, and DMs them to say they
        are in. <strong>Rejecting</strong> closes the request with a note and, if you ask it
        to, tells them why. Both are recorded against your name.
      </div>

      <div className="toolbar">
        <label className="toolbar-label" htmlFor="show-resolved">
          <input
            id="show-resolved"
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Include resolved
        </label>
        <span className="toolbar-count">
          {loading ? '—' : `${pending.length} waiting`}
        </span>
      </div>

      <section className="card card-flush card-coral">
        <div className="card-head">
          <span className="card-title">Requests · {loading ? '—' : (rows ?? []).length}</span>
          <Link className="btn btn-secondary btn-sm" to="/bot/links">
            Discord links
          </Link>
        </div>

        {loading ? (
          <Loading what="the queue" />
        ) : (rows ?? []).length === 0 ? (
          <Empty
            title="Nobody is stuck"
            body="Every verification the bot has seen went through on its own. Failed ones land here by themselves — nobody has to report them."
          />
        ) : (
          <div>
            {(rows ?? []).map((attempt) => (
              <AttemptRow
                key={attempt.id}
                attempt={attempt}
                members={members}
                onResolved={async (message) => {
                  setDone(message);
                  await reload();
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AttemptRow({
  attempt,
  members,
  onResolved,
}: {
  attempt: Attempt;
  members: Member[];
  onResolved: (message: string) => Promise<void>;
}) {
  /* Seeded with the Discord handle. For a no_match the handle is often close to
     the person's own name, so the first search an officer would type is already
     on screen. Each row is keyed by attempt id, so a new attempt gets a fresh
     seed without an effect reaching in to reset it. */
  const [query, setQuery] = useState(attempt.discordUsername);
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const [notifyMember, setNotifyMember] = useState(true);
  const [busy, setBusy] = useState<'link' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolved = attempt.status !== 'pending';

  /* Matched on everything an officer might remember, not just the name. */
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return members
      .filter((m) => {
        const hay = [m.firstName, m.lastName, m.email, m.personalEmail, m.discordUsername]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 25);
  }, [members, query]);

  async function link() {
    if (!choice || busy) return;
    setError(null);
    setBusy('link');
    try {
      await api.post(`/admin/discord/queue/${attempt.id}/link`, {
        memberId: choice,
        note: note.trim() || null,
        notifyMember,
      });
      await onResolved(`Linked ${attempt.discordUsername} and granted their roles.`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  async function reject() {
    if (busy) return;
    if (
      !window.confirm(
        `Turn down the verification request from ${attempt.discordUsername}? ` +
          'They stay in the server with no chapter access. They can click Verify again later.',
      )
    ) {
      return;
    }
    setError(null);
    setBusy('reject');
    try {
      await api.post(`/admin/discord/queue/${attempt.id}/reject`, {
        note: note.trim() || null,
        notifyMember,
      });
      await onResolved(`Turned down ${attempt.discordUsername}.`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  const selectId = `link-${attempt.id}`;
  const searchId = `search-${attempt.id}`;
  const noteId = `note-${attempt.id}`;

  return (
    <div className="unmatched">
      <div>
        <p className="unmatched-amount" style={{ fontSize: 20, wordBreak: 'break-all' }}>
          {attempt.discordUsername}
        </p>
        <p style={{ margin: '10px 0 0' }}>
          <span className={statusPillClass(attempt.status)}>{attempt.status}</span>{' '}
          <span className="pill">{REASON_LABEL[attempt.reason]}</span>
        </p>
        <p className="unmatched-meta">
          First tried {new Date(attempt.attemptedAt).toLocaleString()}
          {attempt.attempts > 1 && ` · clicked Verify ${attempt.attempts} times`}
        </p>
        <p className="unmatched-meta">Discord id {attempt.discordUserId}</p>
        {attempt.memberId && (
          <p className="unmatched-meta">
            Linked to{' '}
            <Link className="link" to={`/members/${attempt.memberId}`}>
              {attempt.memberName ?? attempt.memberEmail}
            </Link>
          </p>
        )}
        {attempt.note && <p className="unmatched-meta">Note: {attempt.note}</p>}
      </div>

      <div>
        {error && (
          <div className="note note-error" style={{ marginBottom: 12 }} role="alert">
            {error}
          </div>
        )}

        {resolved ? (
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Resolved {attempt.resolvedAt && new Date(attempt.resolvedAt).toLocaleString()}.
          </p>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              {REASON_HELP[attempt.reason]}
            </p>

            <label className="label" htmlFor={searchId}>
              Find the member
            </label>
            <input
              id={searchId}
              className="input"
              placeholder="Name, email, or the Discord handle on their profile"
              value={query}
              disabled={busy !== null}
              onChange={(e) => {
                setQuery(e.target.value);
                setChoice('');
              }}
            />

            <label className="label" htmlFor={selectId} style={{ marginTop: 12 }}>
              Link to
            </label>
            <select
              id={selectId}
              className="input"
              value={choice}
              disabled={busy !== null || candidates.length === 0}
              onChange={(e) => setChoice(e.target.value)}
            >
              <option value="">
                {query.trim() === ''
                  ? 'Search above'
                  : candidates.length === 0
                    ? 'No member matches that'
                    : `Choose one of ${candidates.length}`}
              </option>
              {candidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {[m.firstName, m.lastName].filter(Boolean).join(' ') || m.email} — {m.email}
                  {m.discordUsername ? ` (Discord: ${m.discordUsername})` : ' (no Discord handle)'}
                  {m.discordUserId ? ' — already verified' : ''}
                </option>
              ))}
            </select>

            {query.trim() !== '' && candidates.length === 0 && (
              <p className="hint">
                Nobody in the member list matches. If they have never filled in the member
                form, that is the right answer — turn the request down with a note saying so,
                and they will be told to fill it in.
              </p>
            )}

            <label className="label" htmlFor={noteId} style={{ marginTop: 12 }}>
              Note
            </label>
            <input
              id={noteId}
              className="input"
              placeholder="Why — kept on the record, and sent to them if you turn them down"
              value={note}
              disabled={busy !== null}
              onChange={(e) => setNote(e.target.value)}
            />

            <label className="toolbar-label" style={{ display: 'block', marginTop: 12 }}>
              <input
                type="checkbox"
                checked={notifyMember}
                disabled={busy !== null}
                onChange={(e) => setNotifyMember(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              DM them the outcome
            </label>

            <div className="unmatched-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!choice || busy !== null}
                onClick={link}
              >
                {busy === 'link' ? 'Linking…' : 'Link and grant roles'}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy !== null}
                onClick={reject}
              >
                {busy === 'reject' ? 'Turning down…' : 'Turn down'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
