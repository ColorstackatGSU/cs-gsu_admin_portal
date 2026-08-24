import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, type CodeSent } from '../auth/AuthProvider';

const DEV_EMAIL = 'official@colorstackatgsu.com';

export default function Login() {
  const { user, requestCode, verifyCode, devLogin } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/sponsors';

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={from} replace />;

  async function onDevLogin() {
    setError(null);
    setSubmitting(true);
    try {
      await devLogin(DEV_EMAIL);
      nav(from, { replace: true });
    } catch (err) {
      setError(messageOf(err, 'Dev login failed.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await requestCode(email.trim().toLowerCase());
      setSent(result);
      setCode('');
    } catch (err) {
      setError(messageOf(err, 'We could not send you a code just now.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await verifyCode(email.trim().toLowerCase(), code.trim());
      nav(from, { replace: true });
    } catch (err) {
      setError(messageOf(err, 'That code did not work.'));
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setSent(null);
    setCode('');
    setError(null);
  }

  return (
    <div className="wrap-narrow">
      <form className="card" onSubmit={sent ? onVerify : onRequest} noValidate>
        <h1 style={{ fontSize: 18, marginBottom: 4 }}>Admin sign in</h1>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
          {sent
            ? `We sent a six-digit code to ${sent.sentTo}. Enter it below to sign in.`
            : 'Enter your officer email and we will send you a six-digit sign-in code.'}
        </p>

        {error && (
          <div className="note note-error" style={{ marginBottom: 14 }} role="alert">
            {error}
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="email">Officer email</label>
          <input
            id="email"
            type="email"
            className="input"
            placeholder="you@colorstackatgsu.com"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting || sent !== null}
          />
        </div>

        {sent && (
          <div className="field">
            <label className="label" htmlFor="code">Six-digit code</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              className="input"
              placeholder="123456"
              autoComplete="one-time-code"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              disabled={submitting}
            />
            <p className="hint" style={{ marginTop: 6 }}>
              The code expires in 10 minutes.
            </p>
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={submitting || !email || (sent !== null && code.length !== 6)}
        >
          {submitting
            ? sent ? 'Signing in…' : 'Sending code…'
            : sent ? 'Sign in' : 'Email me a code'}
        </button>

        {sent && (
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ marginTop: 10 }}
            onClick={reset}
            disabled={submitting}
          >
            Use a different email
          </button>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-block"
          style={{ marginTop: 10 }}
          onClick={onDevLogin}
          disabled={submitting}
        >
          Dev sign in ({DEV_EMAIL})
        </button>

        <p className="hint" style={{ marginTop: 14 }}>
          Admin accounts are created by officers.
        </p>
      </form>
    </div>
  );
}

function messageOf(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'body' in err) {
    const body = (err as { body: unknown }).body;
    if (body && typeof body === 'object' && 'detail' in body && typeof (body as { detail: unknown }).detail === 'string') {
      return (body as { detail: string }).detail;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
