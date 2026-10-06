import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/admin';
import Confirm from './Confirm';

/**
 * The notice that the terms changed, on the page where the rest of the mail is sent.
 *
 * The terms promise members an email when they change, so this is the one send that is
 * owed rather than chosen. It goes to every member once, including anyone who opted out
 * of chapter email, because it is about their account and not about an event. The backend
 * records each send, so pressing the button again only reaches whoever is left.
 *
 * A card rather than a screen of its own: it is pressed once per change to the terms, and
 * once everybody has it the card shrinks to a single line saying so.
 */

/** Mirrors TermsNoticeService.Preview. */
type Preview = {
  campaign: string;
  subject: string;
  people: number;
  alreadySent: number;
  toSend: number;
  /** Addresses, not people. Most members have a school and a personal one. */
  recipients: number;
  maxPerRun: number;
};

/** Mirrors TermsNoticeService.SendResult. */
type SendResult = { sent: number; skipped: number; failed: string[]; remaining: number };

export default function TermsNotice() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<Preview>('/admin/terms-notice')
      .then(setPreview)
      .catch((e: unknown) => setError(errorMessage(e)));
  }

  useEffect(load, []);

  async function send() {
    setConfirming(false);
    setSending(true);
    setError(null);
    try {
      setResult(await api.post<SendResult>('/admin/terms-notice/send'));
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  if (!preview) {
    return error ? <div className="note note-error" style={{ marginBottom: 16 }}>{error}</div> : null;
  }

  const thisRun = Math.min(preview.toSend, preview.maxPerRun);

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>Terms update notice</h2>

      {error && <div className="note note-error" style={{ marginBottom: 12 }}>{error}</div>}
      {result && (
        <div className="note" style={{ marginBottom: 12, background: '#e8f7ea' }}>
          <strong>Sent to {result.sent}.</strong>{' '}
          {result.failed.length > 0 && (
            <>Failed for {result.failed.length}: {result.failed.slice(0, 5).join(', ')}
              {result.failed.length > 5 ? '…' : ''}. </>
          )}
          {result.remaining > 0 && <>{result.remaining} still to go. Press send again.</>}
        </div>
      )}

      {preview.toSend === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          All {preview.people} members have been told about the October 5 terms change.
        </p>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            The terms changed on October 5: members can now opt out of chapter email, and add a
            phone number to get texts. The terms promise an email when they change, and{' '}
            <strong>{preview.toSend}</strong> of {preview.people} members have not had it.
          </p>
          <p className="muted" style={{ fontSize: 14 }}>
            Subject: &ldquo;{preview.subject}&rdquo;
          </p>

          {confirming && (
            <Confirm
              style={{ marginBottom: 12 }}
              question={`Send the terms notice to ${thisRun} member${thisRun === 1 ? '' : 's'}?`}
              points={[
                'Each gets one copy, at their school address and their personal one if we have it.',
                'It goes to everyone, including members who opted out of chapter email.',
                'Nobody gets it twice, so this is safe to press again if it stops half way.',
                'Sent mail cannot be recalled.',
              ]}
              confirmLabel={`Send to ${thisRun}`}
              busyLabel="Sending…"
              busy={sending}
              onConfirm={() => void send()}
              onCancel={() => setConfirming(false)}
            />
          )}

          <button type="button" className="btn btn-primary" disabled={sending || confirming}
                  onClick={() => setConfirming(true)}>
            {sending ? 'Sending…' : `Send to ${thisRun} member${thisRun === 1 ? '' : 's'}`}
          </button>
        </>
      )}
    </section>
  );
}
