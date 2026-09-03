import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { errorMessage, type Member } from '../lib/admin';
import RichTextEditor from '../components/RichTextEditor';

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
  activated: string;
};

const EMPTY_FILTER: Filter = {
  gradTerm: '', gradYear: '', classYear: '',
  hasResume: '', activated: '',
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
  const [body, setBody] = useState(
    '<p>Hi {{first_name}},</p><p><br></p><p><br></p><p>Cheers,<br>ColorStack at GSU</p>'
  );
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
        htmlBody: wrapTemplate(body, subject.trim()),
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
              <label className="label">Body</label>
              <RichTextEditor
                value={body}
                onChange={setBody}
                placeholder="Write your message. Use {{first_name}} for the recipient's first name."
              />
              <p className="hint">
                Formatting toolbar covers size, bold, italic, headings, lists and links.
                {'{'}{'{'} first_name {'}'}{'}'} and {'{'}{'{'} last_name {'}'}{'}'} substitute per
                recipient. The chapter logo header and footer wrap around your message.
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
 * Wraps the officer's rich HTML body with a chapter header + footer, in the
 * table-based layout every serious transactional email uses. Reasons for
 * table layout: Outlook (still ~20% of inbox reads) renders divs
 * unpredictably; nested tables render everywhere identically. Inline styles
 * only, because Gmail strips &lt;style&gt;. Fixed 600px width because that
 * fits in every mail-client preview pane.
 *
 * Logo is a real hosted asset — the chapter logo served by the sponsor
 * portal's public static folder — not a broken relative path. Alt text
 * survives the "images blocked by default" case that Outlook still ships.
 *
 * Preheader is the hidden first-line the inbox shows next to the subject;
 * pulled from the first stripped-tag chunk of the body so it always reads
 * as a preview of the actual message, not the fixed footer.
 */
function wrapTemplate(bodyHtml: string, subject: string): string {
  const preheader = escapeHtml(
    bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140),
  );
  const safeSubject = escapeHtml(subject || 'ColorStack at GSU');

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;font-size:1px;color:#f4f4f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f7;padding:32px 12px;">
<tr>
<td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(20,17,13,0.08);">

<tr>
<td style="padding:36px 32px 28px;background:#0039A6;text-align:center;">
<img src="https://sponsors.colorstackatgsu.com/images/colorstack-gsu-logo.png"
     alt="ColorStack at GSU"
     width="64" height="64"
     style="display:block;margin:0 auto 14px;border:0;border-radius:50%;background:#ffffff;padding:6px;">
<div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.01em;">ColorStack at GSU</div>
</td>
</tr>

<tr>
<td style="padding:36px 40px 28px;color:#091024;font-size:16px;line-height:1.6;">
${bodyHtml}
</td>
</tr>

<tr>
<td style="padding:24px 40px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#5b6478;font-size:13px;line-height:1.6;text-align:center;">
<p style="margin:0 0 6px;font-weight:600;color:#091024;">ColorStack at Georgia State University</p>
<p style="margin:0;">
<a href="https://colorstackatgsu.com" style="color:#0039A6;text-decoration:none;">colorstackatgsu.com</a>
&nbsp;·&nbsp;
<a href="mailto:official@colorstackatgsu.com" style="color:#0039A6;text-decoration:none;">official@colorstackatgsu.com</a>
</p>
<p style="margin:14px 0 0;font-size:12px;color:#9ca3af;">
You are getting this because you signed up as a ColorStack at GSU member.
</p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
