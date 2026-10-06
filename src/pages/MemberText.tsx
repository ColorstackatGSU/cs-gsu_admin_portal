import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { errorMessage, type Member } from '../lib/admin';
import Confirm from '../components/Confirm';

/**
 * Text message composer for members.
 *
 * The same idea as the email composer, with a much shorter list: only members who turned
 * texts on in their settings and have a number on file appear at all. Nobody is opted in
 * to texts by default, so early on this list is small, and that is correct rather than a
 * bug. The backend applies the same rule again at send time.
 *
 * Phone numbers never reach this page. The officer picks people, the server dials.
 */

/** Mirrors TextBlastService.Status. */
type Status = { live: boolean; maxLength: number; optOutLine: string };

/** Mirrors TextBlastService.Result. */
type SendResult = { sent: number; skipped: number; failed: string[] };

const OPENING = 'ColorStack at GSU: ';

export default function MemberText() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Opens with the chapter's name because a text has no From line: the number means
  // nothing to the person receiving it, and carriers expect the sender to say who it is.
  const [body, setBody] = useState(OPENING);
  const [sending, setSending] = useState(false);
  /** A text lands on a lock screen and cannot be recalled, so it is confirmed first. */
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get<Member[]>('/admin/members'), api.get<Status>('/admin/members/text')])
      .then(([rows, s]) => {
        if (cancelled) return;
        setMembers(rows.filter((m) => m.canText));
        setStatus(s);
      })
      .catch((e: unknown) => { if (!cancelled) setLoadError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!members) return [];
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.firstName, m.lastName, m.email, m.majors, m.classYear, m.gradYear?.toString()]
        .filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [members, search]);

  const allShownSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));
  const maxLength = status?.maxLength ?? 280;
  const text = body.trim();
  const ready = selected.size > 0 && text.length > 0 && text !== OPENING.trim();

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) filtered.forEach((m) => next.delete(m.id));
      else filtered.forEach((m) => next.add(m.id));
      return next;
    });
  }

  function onSend(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!ready) return;
    setConfirming(true);
  }

  async function send() {
    setConfirming(false);
    setSending(true);
    try {
      const r = await api.post<SendResult>('/admin/members/text', {
        body: text,
        memberIds: Array.from(selected),
      });
      setResult(r);
      if (r.failed.length === 0) setSelected(new Set());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Text members</h1>
        <p className="page-sub">
          Only members who turned texts on in their portal settings are listed. Keep it for
          things worth a buzz in somebody's pocket: a room change, a deadline tonight.
        </p>
      </div>

      {loadError && <div className="note note-error">{loadError}</div>}
      {status && !status.live && (
        <div className="note note-warn" style={{ marginBottom: 16 }}>
          Texting is not switched on yet, so nothing sent from here reaches a phone. It needs
          the Twilio settings on the API.
        </div>
      )}
      {error && <div className="note note-error" style={{ marginBottom: 16 }}>{error}</div>}
      {result && (
        <div className="note" style={{ marginBottom: 16, background: '#e8f7ea' }}>
          <p style={{ margin: 0 }}>
            <strong>Sent to {result.sent}.</strong>{' '}
            {result.skipped > 0 && <>Skipped {result.skipped} who have texts off. </>}
            {result.failed.length > 0 && (
              <>Failed for {result.failed.length}: {result.failed.slice(0, 5).join(', ')}
                {result.failed.length > 5 ? '…' : ''}</>
            )}
          </p>
        </div>
      )}

      {!members && !loadError && <p>Loading members…</p>}

      {members && (
        <form onSubmit={onSend}>
          <section className="card" style={{ marginBottom: 16 }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>Who</h2>

            <div className="field">
              <label className="label">Search</label>
              <input
                className="input"
                type="search"
                placeholder="Name, email, major, grad year…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 14 }}>
                Showing <strong>{filtered.length}</strong> of {members.length} with texts on.
                Selected <strong>{selected.size}</strong>.
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={toggleAllShown}
                      disabled={filtered.length === 0}>
                {allShownSelected ? 'Deselect all shown' : 'Select all shown'}
              </button>
            </div>

            <div className="card" style={{ padding: 0, marginTop: 12, maxHeight: 360, overflow: 'auto' }}>
              {filtered.length === 0 ? (
                <p className="muted" style={{ padding: 16, margin: 0 }}>
                  {members.length === 0
                    ? 'Nobody has turned texts on yet. Members do that from Settings in their portal.'
                    : 'No members match.'}
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {filtered.map((m) => (
                    <li key={m.id}
                        style={{
                          padding: '8px 14px',
                          borderTop: '1px solid var(--line, #e5e7eb)',
                          display: 'flex',
                          gap: 12,
                          alignItems: 'center',
                        }}>
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={() => toggleOne(m.id)}
                        aria-label={`Select ${m.email}`}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>
                          {[m.firstName, m.lastName].filter(Boolean).join(' ') || m.email}
                        </div>
                        <div className="muted" style={{ fontSize: 12.5 }}>
                          {m.email}
                          {m.majors ? ` · ${m.majors}` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="card" style={{ marginBottom: 16 }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>Message</h2>
            <div className="field">
              <label className="label" htmlFor="text-body">Text</label>
              <textarea
                id="text-body"
                className="input"
                rows={4}
                maxLength={maxLength}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="hint">
                {body.length} of {maxLength}. Say who it is from. {'{'}{'{'}first_name{'}'}{'}'} substitutes
                per recipient.
                {status && <> &ldquo;{status.optOutLine}&rdquo; is added to the end for you.</>}
              </p>
            </div>
          </section>

          {confirming && (
            <Confirm
              style={{ marginBottom: 16 }}
              question={`Text ${selected.size} member${selected.size === 1 ? '' : 's'}?`}
              points={[
                'It goes to the phone number on their profile.',
                'A sent text cannot be recalled.',
              ]}
              confirmLabel={`Text ${selected.size}`}
              busyLabel="Sending…"
              busy={sending}
              onConfirm={() => void send()}
              onCancel={() => setConfirming(false)}
            />
          )}

          <button type="submit" className="btn btn-primary" disabled={sending || confirming || !ready}>
            {sending
              ? 'Sending…'
              : selected.size === 0
                ? 'Select at least one member'
                : `Text ${selected.size} member${selected.size === 1 ? '' : 's'}`}
          </button>
        </form>
      )}
    </div>
  );
}
