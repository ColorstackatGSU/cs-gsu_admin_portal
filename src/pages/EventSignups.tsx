import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  errorMessage,
  type EventSignup,
  type EventSignupResent,
  type EventSignupSummary,
} from '../lib/admin';

/**
 * Who scanned the QR code at a table, and how many of them actually joined.
 *
 * The second half is the reason this screen exists. Attendance on its own is a number
 * officers already half-know by eye ("busy afternoon"); attendance against conversions is
 * the one that decides whether tabling was worth a Saturday, and nothing in the portal
 * could answer it before, because scans and members were the same table or no table.
 *
 * Almost read-only. Rows are written by the public /fair endpoint and a signup is a record
 * of something that happened, so there is nothing here to edit. The one action is resending
 * somebody's email, which exists because the signup only mails the personal address and the
 * two things that actually go wrong at a table are a typo in it and an inbox that ate the
 * mail.
 */

type Filter = 'all' | 'joined' | 'not-joined' | 'not-emailed';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'joined', label: 'Joined' },
  { key: 'not-joined', label: 'Not yet' },
  { key: 'not-emailed', label: 'Never emailed' },
];

/** "Sep 1, 3:42 PM" — the day and the time, because a fair is one afternoon. */
function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export default function EventSignups() {
  const [summary, setSummary] = useState<EventSignupSummary[] | null>(null);
  /**
   * The rows, tagged with the event they were fetched for.
   *
   * Tagged rather than a bare array so switching events does not need a setState in the
   * effect body to blank the table: rows whose tag no longer matches the selection are
   * simply not this event's rows, and "loading" falls out of that comparison. Without it,
   * the previous event's attendees stay on screen under the new event's heading for as
   * long as the fetch takes, which is the one wrong answer this screen can give.
   */
  const [loaded, setLoaded] = useState<{ event: string; rows: EventSignup[] } | null>(null);
  const [event, setEvent] = useState<string>('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** The row a resend is in flight for, so only that row's buttons go quiet. */
  const [resending, setResending] = useState<string | null>(null);
  /** Per-row outcome, shown in place rather than as a banner: an officer doing five of
   *  these in a row needs to see which one worked, not that something did. */
  const [resent, setResent] = useState<Record<string, string>>({});

  // The summary is loaded once: it is what populates the event picker, so refetching it
  // per event would make the picker depend on the thing it selects.
  useEffect(() => {
    let cancelled = false;
    api
      .get<EventSignupSummary[]>('/admin/event-signups/summary')
      .then((rows) => {
        if (cancelled) return;
        setSummary(rows);
        // Default to the most recent event rather than everything at once. Officers come
        // to this screen during or just after a fair, and "all events" would bury today
        // under last year the moment there is more than one.
        if (rows.length > 0) setEvent(rows[0].eventSlug);
      })
      .catch((e: unknown) => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const path = event ? `/admin/event-signups?event=${encodeURIComponent(event)}` : '/admin/event-signups';
    api
      .get<EventSignup[]>(path)
      .then((rows) => { if (!cancelled) setLoaded({ event, rows }); })
      .catch((e: unknown) => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [event]);

  // Null until the rows on hand are the ones for the event actually selected.
  const signups = loaded?.event === event ? loaded.rows : null;
  const current = summary?.find((s) => s.eventSlug === event) ?? null;

  const filtered = useMemo(() => {
    if (!signups) return null;
    const q = query.trim().toLowerCase();
    return signups.filter((s) => {
      if (filter === 'joined' && s.memberStatus === 'none') return false;
      if (filter === 'not-joined' && s.memberStatus !== 'none') return false;
      if (filter === 'not-emailed' && s.emailedAt) return false;
      if (!q) return true;
      const hay = [s.firstName, s.lastName, s.email, s.studentEmail]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [signups, filter, query]);

  /**
   * Resends one person's check-in email to whichever address the officer picks.
   *
   * Both buttons stay available even for somebody already emailed. The one-per-person rule
   * exists to stop a public QR code mailing a stranger repeatedly; an officer answering
   * "I never got it" is the case it was never meant to catch.
   */
  async function resend(signup: EventSignup, to: 'personal' | 'student') {
    setResending(signup.id);
    setResent((prev) => ({ ...prev, [signup.id]: '' }));
    try {
      const result = await api.post<EventSignupResent>(
        `/admin/event-signups/${signup.id}/resend`,
        { to },
      );
      setResent((prev) => ({ ...prev, [signup.id]: `Sent to ${result.sentTo}` }));
      // Reflect the new emailed_at without refetching the whole table, which would lose
      // the officer's scroll position halfway down a list of two hundred.
      setLoaded((prev) => prev && ({
        ...prev,
        rows: prev.rows.map((r) => r.id === signup.id
          ? { ...r, emailedAt: result.emailedAt, emailCount: result.emailCount }
          : r),
      }));
    } catch (e: unknown) {
      setResent((prev) => ({ ...prev, [signup.id]: errorMessage(e) }));
    } finally {
      setResending(null);
    }
  }

  /**
   * The list as a spreadsheet, because the follow-up email after a fair is written in
   * Google Docs by whoever ran the table, not in this portal. Built here rather than
   * server-side so it always matches exactly what is on screen, filters included.
   */
  function copyCsv() {
    if (!filtered) return;
    const rows = [
      ['First name', 'Last name', 'Student email', 'Personal email', 'Signed up', 'Emailed', 'Status'],
      ...filtered.map((s) => [
        s.firstName ?? '', s.lastName ?? '', s.studentEmail, s.email ?? '',
        s.createdAt, s.emailedAt ?? '', s.memberStatus,
      ]),
    ];
    const csv = rows
      // Quote everything and double any inner quote: names contain commas more often
      // than you would think, and one unquoted field shifts every later column.
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    void navigator.clipboard.writeText(csv);
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Involvement fair</h1>
      </div>

      {error && <div className="note note-error">{error}</div>}

      {summary?.length === 0 && (
        <div className="note">
          Nobody has scanned the code yet. It points at the member portal at
          {' '}<code>/involvement-fair</code>.
        </div>
      )}

      {current && (
        <>
          {/* The four numbers that answer "was that worth it?", in the order the funnel
              actually runs. Scans is the headline; the rest are what happened to it. */}
          <div className="stat-row">
            <Stat label="Scanned" value={current.scans} />
            <Stat label="Emailed" value={current.emailed} />
            <Stat
              label="Joined"
              value={current.joined}
              note={current.scans > 0 ? `${Math.round((current.joined / current.scans) * 100)}%` : undefined}
            />
            <Stat label="Account set up" value={current.activated} />
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            {formatWhen(current.firstAt)} to {formatWhen(current.lastAt)}. “Joined” means they
            went on to fill in the membership form; scanning alone does not make anyone a member.
          </p>
        </>
      )}

      {summary && summary.length > 1 && (
        <select
          className="input"
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          style={{ marginBottom: 12, maxWidth: 360 }}
        >
          {summary.map((s) => (
            <option key={s.eventSlug} value={s.eventSlug}>
              {s.eventSlug} ({s.scans})
            </option>
          ))}
        </select>
      )}

      {signups && signups.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={filter === f.key ? 'btn btn-sm' : 'btn btn-sm btn-secondary'}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
            <button type="button" className="btn btn-sm btn-secondary" onClick={copyCsv}>
              Copy as CSV
            </button>
          </div>

          <input
            className="input"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 16 }}
          />
          <p className="muted" style={{ fontSize: 14, marginBottom: 8 }}>
            {filtered?.length ?? 0} of {signups.length}
          </p>
        </>
      )}

      {!signups && !error && <p>Loading signups…</p>}

      {signups && signups.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Student email</th>
                <th>Personal email</th>
                <th>Signed up</th>
                <th>Emailed</th>
                <th>Status</th>
                <th>Resend</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.map((s) => (
                <tr key={s.id}>
                  <td>
                    {/* Once they have joined, their member record is the useful
                        destination — this row stops being the whole story. */}
                    {s.memberId ? (
                      <Link to={`/members/${s.memberId}`} className="link">
                        {[s.firstName, s.lastName].filter(Boolean).join(' ') || '—'}
                      </Link>
                    ) : (
                      [s.firstName, s.lastName].filter(Boolean).join(' ') || '—'
                    )}
                  </td>
                  <td className="muted">{s.studentEmail}</td>
                  <td className="muted">{s.email ?? '—'}</td>
                  <td className="muted">{formatWhen(s.createdAt)}</td>
                  <td className="muted">
                    {s.emailedAt ? formatWhen(s.emailedAt) : '—'}
                    {s.emailCount > 1 && ` (${s.emailCount}×)`}
                  </td>
                  <td>
                    {s.memberStatus === 'activated'
                      ? '✓ member'
                      : s.memberStatus === 'unclaimed'
                        ? 'form filled'
                        : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        disabled={resending === s.id || !s.email}
                        // The signup itself only ever mails the personal address, so this
                        // is the "try again" button rather than the alternative one.
                        title={s.email ?? 'No personal address on this signup'}
                        onClick={() => void resend(s, 'personal')}
                      >
                        Personal
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        disabled={resending === s.id}
                        title={s.studentEmail}
                        onClick={() => void resend(s, 'student')}
                      >
                        School
                      </button>
                    </div>
                    {resent[s.id] && (
                      <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                        {resent[s.id]}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered?.length === 0 && (
            <p className="muted" style={{ padding: 16 }}>No matches.</p>
          )}
        </div>
      )}
    </div>
  );
}

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
