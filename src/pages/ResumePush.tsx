import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  errorMessage,
  PUSH_SEGMENT_HELP,
  PUSH_SEGMENT_LABELS,
  type ResumePushPreview,
  type ResumePushReport,
  type ResumePushSendResult,
} from '../lib/admin';
import { formatDate } from '../lib/format';

/**
 * The resume push: one email to every member with no resume, and whether it worked.
 *
 * A bulk send is the one action in this portal that cannot be undone, so the screen shows
 * exactly who gets which version before anything leaves. The preview is the real query the
 * send uses, not an estimate of it.
 *
 * Results sit below it and read as a funnel: emailed, clicked, uploaded. Clicks are the
 * rough one. Mail scanners open links too, and the filter for them is good but not perfect,
 * so the click column is for spotting where people stall rather than for quoting.
 */
export default function ResumePush() {
  const [preview, setPreview] = useState<ResumePushPreview | null>(null);
  const [report, setReport] = useState<ResumePushReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ResumePushSendResult | null>(null);

  function load() {
    api
      .get<ResumePushPreview>('/admin/resume-push')
      .then(setPreview)
      .catch((e: unknown) => setError(errorMessage(e)));
    api
      .get<ResumePushReport>('/admin/resume-push/results')
      .then(setReport)
      .catch((e: unknown) => setError(errorMessage(e)));
  }

  useEffect(load, []);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const sent = await api.post<ResumePushSendResult>('/admin/resume-push/send');
      setResult(sent);
      setConfirming(false);
      // Reload rather than patch: the counts have all moved, and this screen being wrong
      // about who has already been written to is how somebody gets a second email.
      load();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  const batch = preview ? Math.min(preview.toSend, preview.maxPerRun) : 0;
  const overall = report?.results.find((r) => r.segment === 'all');

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Resume push</h1>
      </div>

      {error && <div className="note note-error">{error}</div>}

      {!preview && !error && <p>Working out who is missing a resume…</p>}

      {preview && (
        <>
          <div className="note" style={{ marginBottom: 18 }}>
            Every member with no resume on file, activated or not. <strong>One email
            each</strong>, sent to both their school and personal addresses. Subject:{' '}
            <em>{preview.subject}</em>
          </div>

          <div className="stat-row">
            <Stat label="Missing a resume" value={preview.people} />
            <Stat label="Already sent" value={preview.alreadySent} />
            <Stat label="To send" value={preview.toSend} />
            <Stat label="Emails" value={preview.recipients} note="both addresses" />
          </div>

          <div className="card card-flush" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <h2 className="card-title">Who gets what</h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Where the button goes</th>
                    <th>People</th>
                    <th>Already sent</th>
                    <th>To send</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.segments.map((s) => (
                    <tr key={s.segment}>
                      <td><strong>{PUSH_SEGMENT_LABELS[s.segment] ?? s.segment}</strong></td>
                      <td className="muted">{PUSH_SEGMENT_HELP[s.segment] ?? ''}</td>
                      <td>{s.people}</td>
                      <td className="muted">{s.alreadySent}</td>
                      <td>{s.toSend}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {preview.toSend > preview.maxPerRun && (
            <div className="note" style={{ marginBottom: 14 }}>
              This run will send to the first {preview.maxPerRun} and stop. Mail providers
              cap a day's sending. Press the button again to carry on with the rest: nobody
              is written to twice.
            </div>
          )}

          {result && (
            <div className="note" style={{ marginBottom: 14 }}>
              Sent {result.sent}. {result.skipped > 0 && `Skipped ${result.skipped} already done. `}
              {result.remaining > 0 && `${result.remaining} still to go. `}
              {result.failed.length > 0 && (
                <>
                  <strong>{result.failed.length} failed</strong> and can be retried by
                  pressing the button again: {result.failed.slice(0, 8).join(', ')}
                  {result.failed.length > 8 && `, and ${result.failed.length - 8} more`}.
                </>
              )}
            </div>
          )}

          {preview.toSend === 0 ? (
            <p className="muted">
              Everybody missing a resume has had this email. To run another push, change
              RESUME_PUSH_CAMPAIGN and redeploy.
            </p>
          ) : confirming ? (
            <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ flex: 1, minWidth: 220 }}>
                Send {batch} email{batch === 1 ? '' : 's'}? This cannot be undone.
              </strong>
              <button type="button" className="btn" disabled={sending} onClick={() => void send()}>
                {sending ? 'Sending…' : 'Yes, send them'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={sending}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirming(true)}>
              Send resume push
            </button>
          )}
        </>
      )}

      {report && overall && overall.emailed > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 36 }}>Results</h2>

          <div className="stat-row">
            <Stat label="Emailed" value={overall.emailed} />
            <Stat label="Clicked" value={overall.clicked} note={percent(overall.clicked, overall.emailed)} />
            <Stat label="Uploaded since" value={overall.uploaded} note={percent(overall.uploaded, overall.emailed)} />
            <Stat label="Still missing" value={overall.stillMissing} />
          </div>

          <div className="card card-flush" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <h2 className="card-title">By group</h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Emailed</th>
                    <th>Clicked</th>
                    <th>Activated</th>
                    <th>Uploaded</th>
                    <th>Stuck</th>
                    <th>Missing</th>
                    <th>Median wait</th>
                  </tr>
                </thead>
                <tbody>
                  {report.results.map((r) => (
                    <tr key={r.segment}>
                      <td style={{ whiteSpace: 'nowrap' }}><strong>{PUSH_SEGMENT_LABELS[r.segment] ?? r.segment}</strong></td>
                      <td>{r.emailed}</td>
                      <td>{r.clicked} <span className="muted">{percent(r.clicked, r.emailed)}</span></td>
                      <td>{r.segment === 'activated' ? <span className="muted">n/a</span> : r.activatedSince}</td>
                      <td>{r.uploaded} <span className="muted">{percent(r.uploaded, r.emailed)}</span></td>
                      <td>{r.clickedNotUploaded}</td>
                      <td>{r.stillMissing}</td>
                      <td>{duration(r.medianHoursToUpload)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
            Activated and uploaded count only what happened after their email, whether or not
            they opened it. Stuck means clicked but still no resume. Median wait is email to
            upload. Clicks skip the first minute after sending and anything that looks like a
            mail scanner, so they are close but not exact.
          </p>

          {report.stuck.length > 0 && (
            <div className="card card-flush">
              <div className="card-head">
                <h2 className="card-title">Clicked, still no resume ({report.stuck.length})</h2>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Where they are</th>
                      <th>First clicked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.stuck.map((s) => (
                      <tr key={s.email}>
                        <td>{s.name ?? <span className="muted">No name</span>}</td>
                        <td>{s.email}</td>
                        <td className="muted">
                          {s.activatedNow ? 'Activated, did not upload' : 'Never activated'}
                        </td>
                        <td>{formatDate(s.firstClickAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function percent(part: number, whole: number): string {
  return whole === 0 ? '' : `${Math.round((part / whole) * 100)}%`;
}

function duration(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} hr`;
  return `${Math.round(hours / 24)} days`;
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
