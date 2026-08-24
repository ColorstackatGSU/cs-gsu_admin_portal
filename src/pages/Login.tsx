import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, type CodeSent } from '../auth/AuthProvider';
import { errorMessage } from '../lib/admin';
import { ORG } from '../data/org';

/**
 * Passwordless officer sign-in. Two steps in one page:
 *
 *   1. Enter your officer email. We POST /auth/admin/request-code and, if the
 *      address belongs to an admin, a six-digit code lands in the inbox.
 *   2. Enter the code. We POST /auth/admin/verify-code, get a GoTrue magic-link
 *      token hash, and finish it locally with verifyOtp, which stores a real
 *      Supabase session in localStorage.
 *
 * The step count is on screen because you have to leave the page to fetch the
 * code, and a form that has changed under you when you come back needs to have
 * said it would.
 *
 * Dev sign-in only renders in a dev build. The endpoint itself is gated by
 * `app.admin.dev-auto-login` on the backend and 404s when that is off, but a
 * one-click "sign in as the chapter's main account" button has no business
 * being painted onto a production login screen at all.
 */
const DEV_EMAIL = 'official@colorstackatgsu.com';
const SHOW_DEV_LOGIN = import.meta.env.DEV;

export default function Login() {
  const { user, requestCode, verifyCode, devLogin } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [search] = useSearchParams();
  // Two paths land here: the ProtectedRoute redirect (carries `from` in router
  // state) and the 401 handler in api.ts (window.location.assign, carries
  // `?from=`). Prefer the state value when both are present.
  const from =
    (location.state as { from?: string } | null)?.from ?? search.get('from') ?? '/sponsors';

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already-signed-in visitors are bounced straight through: landing on /login
  // is almost always a stale back-button, and rendering the form would let
  // someone sign in as a second account without signing out of the first.
  if (user) return <Navigate to={from} replace />;

  async function onDevLogin() {
    setError(null);
    setSubmitting(true);
    try {
      await devLogin(DEV_EMAIL);
      nav(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
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
      setError(errorMessage(err));
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
      setError(errorMessage(err));
      // Clear the code but keep the email and the step: a mistyped digit should
      // cost one retype, not the whole flow.
      setCode('');
      setSubmitting(false);
    }
  }

  /** Re-send to the same address. Same endpoint; the backend replaces the code. */
  async function onResend() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await requestCode(email.trim().toLowerCase());
      setSent(result);
      setCode('');
    } catch (err) {
      setError(errorMessage(err));
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
    <div>
      <header className="auth-head">
        <span className={sent ? 'eyebrow eyebrow-mint' : 'eyebrow'}>
          {sent ? 'Step 2 of 2' : 'Step 1 of 2'}
        </span>
        <h1>{sent ? 'Enter your code' : 'Officer sign in'}</h1>
        <p className="page-sub">
          {sent
            ? `We sent a six-digit code to ${sent.sentTo}. It expires in 10 minutes.`
            : 'Enter your officer email and we will send you a six-digit sign-in code. No password to remember.'}
        </p>
      </header>

      <form className="card" onSubmit={sent ? onVerify : onRequest} noValidate>
        {error && (
          <div className="note note-error" style={{ marginBottom: 18 }} role="alert">
            {error}
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="email">
            Officer email
          </label>
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
            <label className="label" htmlFor="code">
              Six-digit code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              className="input input-code"
              placeholder="000000"
              autoComplete="one-time-code"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              disabled={submitting}
            />
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={submitting || !email || (sent !== null && code.length !== 6)}
        >
          {submitting
            ? sent
              ? 'Signing in…'
              : 'Sending code…'
            : sent
              ? 'Sign in'
              : 'Email me a code'}
        </button>

        {sent && (
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={onResend}
              disabled={submitting}
            >
              Resend code
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={reset}
              disabled={submitting}
            >
              Change email
            </button>
          </div>
        )}

        {SHOW_DEV_LOGIN && (
          <>
            <hr className="meta-rule" />
            <p className="meta-key">Local development only</p>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={onDevLogin}
              disabled={submitting}
            >
              Skip the code, sign in as {DEV_EMAIL}
            </button>
            <p className="hint">
              Calls <code className="num">/auth/admin/dev-login</code>, which 404s unless the
              backend has <code className="num">app.admin.dev-auto-login</code> on. This button
              is not built into production bundles.
            </p>
          </>
        )}
      </form>

      <p className="hint" style={{ marginTop: 16 }}>
        Admin accounts are created by officers directly in the database. If you need
        access, ask in the officer channel or email{' '}
        <a className="link" href={`mailto:${ORG.billingEmail}`}>
          {ORG.billingEmail}
        </a>
        .
      </p>
    </div>
  );
}
