import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Confirm from '../components/Confirm';
import { ErrorNote, Field, Loading, OkNote } from '../components/Form';
import { pixelateToUrl } from '../lib/pixelate';
import { api } from '../lib/api';
import { errorMessage } from '../lib/admin';
import { formatDate } from '../lib/format';
import { TECH_LEAGUE_SITE, techLeagueEmailError, type Access, type ChangeResult } from '../lib/access';

/**
 * The Tech League's corner of this portal.
 *
 * It is rendered inside .tl-scope, which redefines the design tokens to the Tech League's
 * own scheme, so the cards, buttons and tables on this page are the same components as
 * everywhere else in the portal and simply come out dark and neon. Getting here plays a
 * pixel dissolve, because arriving in a different colour scheme with no transition reads
 * as a broken stylesheet rather than a deliberate move.
 *
 * This page manages who can open the Tech League's admin tools, and is the way in to the
 * three screens that are those tools: /tech-league/review, /pool and /scores. They used
 * to be three tabs on the Tech League's own admin page and now live here, so an officer
 * signs in once instead of holding two accounts to do one job.
 */
export default function TechLeague() {
  const [data, setData] = useState<Access | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(await api.get<Access>('/admin/access'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Access>('/admin/access')
      .then((rows) => {
        if (!cancelled) setData(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const emailProblem = techLeagueEmailError(email);
  const canSubmit = Boolean(email.trim()) && !emailProblem && !busy;

  async function set(target: string, grant: boolean) {
    setBusy(true);
    setProblem(null);
    setError(null);
    try {
      const result = await api.post<ChangeResult>('/admin/access/tech-league', {
        email: target.trim().toLowerCase(),
        grant,
      });
      const who = target.trim().toLowerCase();
      const done = grant
        ? `${who} can now open the Tech League admin page.`
        : `${who} can no longer open the Tech League admin page.`;
      setSaved(
        result.emailed
          ? done
          : `${done} The email did not send: ${result.emailProblem ?? 'unknown error'} Tell them yourself.`,
      );
      await load();
      if (grant) {
        setEmail('');
        setAdding(false);
      } else {
        setRemoving(null);
      }
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (canSubmit) void set(email, true);
  }

  if (error && !data) {
    return (
      <div className="wrap">
        <ErrorNote message={error} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="wrap">
        <Loading what="the Tech League" />
      </div>
    );
  }

  const { techLeagueAdmins: admins, techLeagueConfigured: configured, techLeagueProblem: outage } = data;

  return (
    <div className="wrap">
        <header className="page-head">
          <span className="eyebrow eyebrow-mint">ColorStack @ GSU</span>
          <h1>Tech League</h1>
          <p className="page-sub">
            A semester-long, team-based competition at Georgia State. This page manages who
            can open its admin tools.
          </p>
        </header>

        <ErrorNote message={error} />
        <OkNote message={saved} />

        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div>
              <h2 className="card-title">Admins</h2>
              <p className="page-sub" style={{ marginTop: 4 }}>
                Application review, decisions and score entry.
              </p>
            </div>
            {configured && !outage && (
              <button
                type="button"
                className={adding ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
                onClick={() => {
                  setAdding((v) => !v);
                  setProblem(null);
                }}
                aria-expanded={adding}
                aria-controls="add-tl-admin"
              >
                {adding ? 'Cancel' : '+ Add admin'}
              </button>
            )}
          </div>

          {!configured && (
            <div className="card-pad">
              <div className="note note-info">
                The Tech League connection is not set up, so this half is read only. Set
                <code> TECH_LEAGUE_API_URL </code> and <code> TECH_LEAGUE_SERVICE_TOKEN </code>
                on the API, matching <code> ADMIN_PORTAL_TOKEN </code> on the Tech League.
              </div>
            </div>
          )}

          {configured && outage && (
            <div className="card-pad">
              <div className="note note-warn">
                Could not reach the Tech League just now, so its admins are not listed.
                Officers in the portal are unaffected. {outage}
              </div>
            </div>
          )}

          {adding && (
            <form id="add-tl-admin" className="card-pad" onSubmit={submit} noValidate>
              <div className="form-grid">
                <Field
                  label="Student email"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  required
                  wide
                  error={emailProblem}
                  hint="They need a Tech League account already. Nobody can be made an admin before they sign up there."
                  autoComplete="off"
                />
              </div>
              {problem && <p className="field-error">{problem}</p>}
              <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
                {busy ? 'Adding…' : 'Make admin'}
              </button>
            </form>
          )}

          {configured && !outage && admins.length === 0 && (
            <div className="card-pad">
              <p className="muted">No Tech League admins yet.</p>
            </div>
          )}

          {admins.length > 0 && (
            <div className="card" style={{ padding: 0, border: 0, boxShadow: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Name</th>
                    <th scope="col">Since</th>
                    <th scope="col">Added by</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {admins.map((a) => (
                    <tr key={a.email}>
                      <td>{a.email}</td>
                      <td className="muted">{a.fullName ?? '—'}</td>
                      <td className="muted faint">{a.grantedAt ? formatDate(a.grantedAt) : '—'}</td>
                      <td className="muted faint">{a.grantedBy ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setRemoving(a.email);
                            setProblem(null);
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {removing && (
            <div className="card-pad">
              <Confirm
                question={`Remove ${removing} from the Tech League admin page?`}
                points={[
                  'They lose application review, decisions and score entry immediately.',
                  'Their Tech League account and their own application are untouched.',
                  'We email them. No other officer is emailed.',
                  'The Tech League refuses this if they are the last admin left.',
                ]}
                confirmLabel="Remove access"
                danger
                busy={busy}
                busyLabel="Removing…"
                problem={problem}
                onConfirm={() => void set(removing, false)}
                onCancel={() => {
                  setRemoving(null);
                  setProblem(null);
                }}
              />
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Run the season</h2>
              <p className="page-sub" style={{ marginTop: 4 }}>
                Application review, decisions and score entry, moved here from the Tech
                League's own admin page. Same work, same shortcuts, one sign-in.
              </p>
            </div>
          </div>
          <div className="card-pad" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/tech-league/review" className="btn btn-primary">Review applications</Link>
            <Link to="/tech-league/pool" className="btn btn-secondary">Applicant pool</Link>
            <Link to="/tech-league/scores" className="btn btn-secondary">Scores</Link>
            {/* The Tech League's own admin page is still live and still works. Kept as a
                way out until the port has been through a real review cycle and the page
                over there is deleted. */}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                pixelateToUrl(`${TECH_LEAGUE_SITE}/admin`, 'Opening the Tech League')
              }
            >
              Open the old page →
            </button>
          </div>
        </section>
    </div>
  );
}
