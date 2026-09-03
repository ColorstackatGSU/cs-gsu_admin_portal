import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  errorMessage,
  type FollowUpPreview,
  type FollowUpSendResult,
  SEGMENT_LABELS,
  SEGMENT_HELP,
} from '../lib/admin';

/**
 * The follow-up campaign, as one button with the arithmetic shown first.
 *
 * A bulk send is the one action in this portal that cannot be undone, so the screen is
 * built around seeing exactly who gets what before anything leaves. The preview is the
 * real query the send uses, not an estimate of it.
 *
 * Everyone gets exactly one email, chosen by the most blocking thing they have not done,
 * so somebody who came to the fair and never activated is asked to activate rather than
 * being thanked and nudged separately. That ranking lives in SQL, in follow_up_audience().
 */
export default function FollowUp() {
  const [preview, setPreview] = useState<FollowUpPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<FollowUpSendResult | null>(null);

  function load() {
    api
      .get<FollowUpPreview>('/admin/follow-up')
      .then(setPreview)
      .catch((e: unknown) => setError(errorMessage(e)));
  }

  useEffect(load, []);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const sent = await api.post<FollowUpSendResult>('/admin/follow-up/send');
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

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Follow-up</h1>
      </div>

      {error && <div className="note note-error">{error}</div>}

      {!preview && !error && <p>Working out who needs what…</p>}

      {preview && (
        <>
          <div className="note" style={{ marginBottom: 18 }}>
            Everyone who has ever filled the membership form, plus everyone who scanned at
            the fair and never filled it. <strong>One email each</strong>, picked by the most
            blocking thing they have not done, sent to both their school and personal
            addresses.
          </div>

          <div className="stat-row">
            <Stat label="People" value={preview.people} />
            <Stat label="Already sent" value={preview.alreadySent} />
            <Stat label="To send" value={preview.toSend} />
            <Stat label="Emails" value={preview.recipients} note="both addresses" />
          </div>

          <div className="card card-flush" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <h2 className="card-title">Who gets what</h2>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>What the email asks for</th>
                  <th>People</th>
                  <th>Already sent</th>
                  <th>To send</th>
                </tr>
              </thead>
              <tbody>
                {preview.segments.map((s) => (
                  <tr key={s.segment}>
                    <td><strong>{SEGMENT_LABELS[s.segment] ?? s.segment}</strong></td>
                    <td className="muted">{SEGMENT_HELP[s.segment] ?? ''}</td>
                    <td>{s.people}</td>
                    <td className="muted">{s.alreadySent}</td>
                    <td>{s.toSend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.toSend > preview.maxPerRun && (
            <div className="note" style={{ marginBottom: 14 }}>
              This run will send to the first {preview.maxPerRun} and stop. Mail providers
              cap a day's sending, and every person here costs two addresses. Press the
              button again to carry on with the rest: nobody is written to twice.
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
              Everybody in this campaign has had their email. To run another, change
              FOLLOWUP_CAMPAIGN and redeploy.
            </p>
          ) : confirming ? (
            <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ flex: 1, minWidth: 220 }}>
                Send {Math.min(preview.toSend, preview.maxPerRun)} emails to{' '}
                {Math.min(preview.toSend, preview.maxPerRun) * 2} addresses? This cannot be undone.
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
              Send follow-up emails
            </button>
          )}
        </>
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
