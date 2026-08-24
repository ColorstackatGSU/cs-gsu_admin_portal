import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/admin';

/**
 * Bulk email composer for members. Filter the audience, write a subject and a
 * (very light) HTML template, preview who will receive it, send.
 *
 * Template placeholders: {{first_name}} and {{last_name}} substituted per
 * recipient. The backend caps total recipients at 2000, sends one message
 * per address so a bounce on one does not sink the batch, and returns the
 * count sent + any failed addresses.
 *
 * Wrapper HTML adds the chapter logo header and a footer with the org email
 * around whatever the officer types, so the mail always looks like it came
 * from us. The officer only writes the body copy — they cannot forget the
 * boilerplate.
 */

type Filter = {
  gradTerm: string;
  gradYear: string;
  classYear: string;
  hasResume: string;   // "" | "true" | "false"
  resumeShared: string;
  activated: string;
};

const EMPTY_FILTER: Filter = {
  gradTerm: '', gradYear: '', classYear: '',
  hasResume: '', resumeShared: '', activated: '',
};

type Preview = { recipientCount: number; sampleEmails: string[] };
type SendResult = { sent: number; failed: string[] };

const CLASS_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior'];
const GRAD_TERMS = ['Spring', 'Summer', 'Fall'];

export default function MemberEmail() {
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('Hi {{first_name}},\n\n\n\nCheers,\nColorStack at GSU');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Serialize filter to a request body. Empty strings drop out so the backend
  // treats "no answer" as "do not filter."
  const requestBody = useMemo(() => ({
    gradTerm: filter.gradTerm || null,
    gradYear: filter.gradYear ? Number(filter.gradYear) : null,
    classYear: filter.classYear || null,
    hasResume: parseBool(filter.hasResume),
    resumeShared: parseBool(filter.resumeShared),
    activated: parseBool(filter.activated),
  }), [filter]);

  // Debounced preview: 400ms after the last edit, ask the backend how many
  // members match. Cheap query, but no need to hammer it on every keystroke.
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      api
        .post<Preview>('/admin/members/email/preview', requestBody)
        .then((p) => { if (!cancelled) setPreview(p); })
        .catch((e: unknown) => { if (!cancelled) setPreviewError(errorMessage(e)); });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [requestBody]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!preview || preview.recipientCount === 0) return;
    const confirmed = window.confirm(
      `Send to ${preview.recipientCount} member${preview.recipientCount === 1 ? '' : 's'}?`
    );
    if (!confirmed) return;

    setSending(true);
    try {
      const r = await api.post<SendResult>('/admin/members/email', {
        subject: subject.trim(),
        htmlBody: wrapTemplate(body),
        filter: requestBody,
      });
      setResult(r);
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
          Filter by anything on a member's profile, write once, and send to
          everyone who matches. {'{'}{'{'} first_name {'}'}{'}'} and {'{'}{'{'} last_name {'}'}{'}'} substitute
          per recipient.
        </p>
      </div>

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

      <form onSubmit={onSend}>
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>Who</h2>

          <div className="form-grid">
            <Select label="Class year" value={filter.classYear}
                    onChange={(v) => setFilter({ ...filter, classYear: v })}>
              <option value="">Any</option>
              {CLASS_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
            <Select label="Grad term" value={filter.gradTerm}
                    onChange={(v) => setFilter({ ...filter, gradTerm: v })}>
              <option value="">Any</option>
              {GRAD_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <div className="field">
              <label className="label">Grad year</label>
              <input className="input" type="number" min={2020} max={2100}
                     placeholder="e.g. 2027"
                     value={filter.gradYear}
                     onChange={(e) => setFilter({ ...filter, gradYear: e.target.value })} />
            </div>
            <Select label="Resume uploaded" value={filter.hasResume}
                    onChange={(v) => setFilter({ ...filter, hasResume: v })}>
              <option value="">Any</option>
              <option value="true">On file</option>
              <option value="false">Missing</option>
            </Select>
            <Select label="Resume sharing" value={filter.resumeShared}
                    onChange={(v) => setFilter({ ...filter, resumeShared: v })}>
              <option value="">Any</option>
              <option value="true">Opted in</option>
              <option value="false">Opted out</option>
            </Select>
            <Select label="Sign-in status" value={filter.activated}
                    onChange={(v) => setFilter({ ...filter, activated: v })}>
              <option value="">Any</option>
              <option value="true">Has signed in</option>
              <option value="false">Never signed in</option>
            </Select>
          </div>

          <div style={{ marginTop: 14, fontSize: 14 }}>
            {previewError ? (
              <span style={{ color: 'var(--bad, #b00020)' }}>Preview failed: {previewError}</span>
            ) : preview ? (
              <>
                <strong>{preview.recipientCount}</strong> member{preview.recipientCount === 1 ? '' : 's'} match.
                {preview.sampleEmails.length > 0 && (
                  <span className="muted"> Sample: {preview.sampleEmails.slice(0, 5).join(', ')}
                    {preview.sampleEmails.length > 5 ? '…' : ''}</span>
                )}
              </>
            ) : (
              <span className="muted">Counting…</span>
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
              the recipient's first name. The chapter logo and footer are added
              automatically around whatever you write.
            </p>
          </div>
        </section>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={sending || !preview || preview.recipientCount === 0 || !subject.trim() || !body.trim()}
        >
          {sending
            ? 'Sending…'
            : preview
              ? `Send to ${preview.recipientCount} member${preview.recipientCount === 1 ? '' : 's'}`
              : 'Send'}
        </button>
      </form>
    </div>
  );
}

function Select({
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

function parseBool(v: string): boolean | null {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

/**
 * Wraps the officer's body with the chapter header (logo + name) and a
 * footer with contact info. Plain-text line breaks become <br>, blank lines
 * become paragraph breaks — so the officer can write natural prose without
 * touching HTML.
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
