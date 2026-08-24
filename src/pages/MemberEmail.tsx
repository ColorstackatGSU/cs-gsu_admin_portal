import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { errorMessage, type Member } from '../lib/admin';

/**
 * Bulk email composer for members.
 *
 * Load every member once, narrow the list with filters + a search box, then
 * check the specific people to send to. Send goes by explicit member ids —
 * the officer sees exactly who receives each mail.
 *
 * Body wraps in a chapter-branded header + footer server-side (well, per
 * the wrapTemplate below), so the officer only writes the copy.
 * {{first_name}} and {{last_name}} substitute per recipient.
 */

type Filter = {
  gradTerm: string;
  gradYear: string;
  classYear: string;
  hasResume: string;
  resumeShared: string;
  activated: string;
};

const EMPTY_FILTER: Filter = {
  gradTerm: '', gradYear: '', classYear: '',
  hasResume: '', resumeShared: '', activated: '',
};

type SendResult = { sent: number; failed: string[] };

const CLASS_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior'];
const GRAD_TERMS = ['Spring', 'Summer', 'Fall'];

export default function MemberEmail() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState("Hi {{first_name}},\n\n\n\nCheers,\nColorStack at GSU");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Member[]>('/admin/members')
      .then((rows) => { if (!cancelled) setMembers(rows); })
      .catch((e: unknown) => { if (!cancelled) setLoadError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, []);

  // Apply the filter + search text to the loaded list. All client-side —
  // the chapter is small, and having every row locally lets selection
  // survive filter changes without extra round-trips.
  const filtered = useMemo(() => {
    if (!members) return [];
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (filter.classYear && m.classYear !== filter.classYear) return false;
      if (filter.gradTerm && m.gradTerm !== filter.gradTerm) return false;
      if (filter.gradYear && String(m.gradYear ?? '') !== filter.gradYear) return false;
      if (filter.hasResume === 'true' && !m.hasResume) return false;
      if (filter.hasResume === 'false' && m.hasResume) return false;
      if (filter.resumeShared === 'true' && !m.resumeShared) return false;
      if (filter.resumeShared === 'false' && m.resumeShared) return false;
      if (filter.activated === 'true' && !m.activatedAt) return false;
      if (filter.activated === 'false' && m.activatedAt) return false;
      if (q) {
        const hay = [
          m.firstName, m.lastName, m.email, m.personalEmail,
          m.majors, m.classYear, m.gradTerm, m.gradYear?.toString(),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, filter, search]);

  const allShownSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));

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
      if (allShownSelected) {
        filtered.forEach((m) => next.delete(m.id));
      } else {
        filtered.forEach((m) => next.add(m.id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (selected.size === 0) return;

    const confirmed = window.confirm(
      `Send to ${selected.size} member${selected.size === 1 ? '' : 's'}?`
    );
    if (!confirmed) return;

    setSending(true);
    try {
      const r = await api.post<SendResult>('/admin/members/email', {
        subject: subject.trim(),
        htmlBody: wrapTemplate(body),
        memberIds: Array.from(selected),
      });
      setResult(r);
      if (r.failed.length === 0) clearSelection();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Email members</h1>
        <p className="page-sub">
          Filter, search, check the people you want to send to. Body wraps in a chapter
          header and footer automatically. {'{'}{'{'} first_name {'}'}{'}'} and {'{'}{'{'} last_name {'}'}{'}'}
          substitute per recipient.
        </p>
      </div>

      {loadError && <div className="note note-error">{loadError}</div>}
      {error && <div className="note note-error" style={{ marginBottom: 16 }}>{error}</div>}
      {result && (
        <div className="note" style={{ marginBottom: 16, background: '#e8f7ea' }}>
          <p style={{ margin: 0 }}>
            <strong>Sent to {result.sent}.</strong>{' '}
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

            <div className="form-grid">
              <FilterSelect label="Class year" value={filter.classYear}
                            onChange={(v) => setFilter({ ...filter, classYear: v })}>
                <option value="">Any</option>
                {CLASS_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </FilterSelect>
              <FilterSelect label="Grad term" value={filter.gradTerm}
                            onChange={(v) => setFilter({ ...filter, gradTerm: v })}>
                <option value="">Any</option>
                {GRAD_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </FilterSelect>
              <div className="field">
                <label className="label">Grad year</label>
                <input className="input" type="number" min={2020} max={2100}
                       placeholder="e.g. 2027"
                       value={filter.gradYear}
                       onChange={(e) => setFilter({ ...filter, gradYear: e.target.value })} />
              </div>
              <FilterSelect label="Resume uploaded" value={filter.hasResume}
                            onChange={(v) => setFilter({ ...filter, hasResume: v })}>
                <option value="">Any</option>
                <option value="true">On file</option>
                <option value="false">Missing</option>
              </FilterSelect>
              <FilterSelect label="Resume sharing" value={filter.resumeShared}
                            onChange={(v) => setFilter({ ...filter, resumeShared: v })}>
                <option value="">Any</option>
                <option value="true">Opted in</option>
                <option value="false">Opted out</option>
              </FilterSelect>
              <FilterSelect label="Sign-in status" value={filter.activated}
                            onChange={(v) => setFilter({ ...filter, activated: v })}>
                <option value="">Any</option>
                <option value="true">Has signed in</option>
                <option value="false">Never signed in</option>
              </FilterSelect>
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 14 }}>
                Showing <strong>{filtered.length}</strong> of {members.length}.
                Selected <strong>{selected.size}</strong>.
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={toggleAllShown}
                      disabled={filtered.length === 0}>
                {allShownSelected ? 'Deselect all shown' : 'Select all shown'}
              </button>
              {selected.size > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearSelection}>
                  Clear selection
                </button>
              )}
            </div>

            <div className="card" style={{ padding: 0, marginTop: 12, maxHeight: 360, overflow: 'auto' }}>
              {filtered.length === 0 ? (
                <p className="muted" style={{ padding: 16, margin: 0 }}>No members match.</p>
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
                          {m.gradTerm || m.gradYear
                            ? ` · ${[m.gradTerm, m.gradYear].filter(Boolean).join(' ')}`
                            : ''}
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
              <label className="label" htmlFor="subject">Subject</label>
              <input id="subject" className="input" required maxLength={200}
                     value={subject} onChange={(e) => setSubject(e.target.value)}
                     placeholder="Weekend workshop reminder" />
            </div>
            <div className="field">
              <label className="label" htmlFor="body">Body</label>
              <textarea id="body" className="input" rows={12}
                        value={body} onChange={(e) => setBody(e.target.value)}
                        style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13.5 }} />
              <p className="hint">
                Plain text with line breaks becomes paragraphs. Use {'{'}{'{'} first_name {'}'}{'}'} for
                the recipient's first name. The chapter logo and footer wrap around your text.
              </p>
            </div>
          </section>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={sending || selected.size === 0 || !subject.trim() || !body.trim()}
          >
            {sending
              ? 'Sending…'
              : selected.size === 0
                ? 'Select at least one member'
                : `Send to ${selected.size} member${selected.size === 1 ? '' : 's'}`}
          </button>
        </form>
      )}
    </div>
  );
}

function FilterSelect({
  label, value, onChange, children,
}: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

/**
 * Wraps the officer's body with a chapter header + footer so the mail always
 * looks like it came from us. Plain-text line breaks become <br>, blank lines
 * become paragraph breaks — the officer writes natural prose without touching
 * HTML.
 */
function wrapTemplate(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `
<div style="font-family: Helvetica, Arial, sans-serif; font-size: 16px; color: #091024; max-width: 560px; margin: 0 auto;">
  <div style="padding: 18px 0 12px; border-bottom: 3px solid #0039A6; margin-bottom: 22px;">
    <div style="font-size: 20px; font-weight: 700; letter-spacing: -0.01em;">ColorStack at GSU</div>
  </div>
  ${paragraphs}
  <div style="margin-top: 32px; padding-top: 18px; border-top: 1px solid #e5e7eb; color: #5b6478; font-size: 13px;">
    <p style="margin: 0;">ColorStack at Georgia State University</p>
    <p style="margin: 4px 0 0;">
      <a href="https://colorstackatgsu.com" style="color: #0039A6;">colorstackatgsu.com</a>
      &middot;
      <a href="mailto:official@colorstackatgsu.com" style="color: #0039A6;">official@colorstackatgsu.com</a>
    </p>
  </div>
</div>
`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
