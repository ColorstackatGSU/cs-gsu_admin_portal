import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Confirm from '../components/Confirm';
import { ErrorNote, Field, Loading, OkNote } from '../components/Form';
import { api } from '../lib/api';
import { errorMessage } from '../lib/admin';
import { formatDate } from '../lib/format';
import {
  REALM_LABEL,
  emailError,
  grantBody,
  techLeagueEmailError,
  type Access as AccessData,
  type ChangeResult,
  type ChapterAdmin,
  type TechLeagueAdmin,
} from '../lib/access';

/**
 * Who can sign in here, and who can sign in to the Tech League's admin page.
 *
 * Both used to be rows somebody added by hand in a Supabase dashboard. That meant routine
 * chapter business needed production database access, it left no record of who did it, and
 * when an officer left e-board there were two systems to remember to remove them from and
 * no screen that showed you had missed one. This screen is that screen.
 *
 * The two halves are deliberately not presented as one list, because they are not the same
 * thing. An admin portal officer can be added before they have an account and picks up
 * access the first time they sign in. A Tech League admin is a flag on a student who must
 * already have a Tech League account, so that side can only promote an existing member and
 * says so rather than failing at the far end.
 *
 * Nothing on this page emails a link that grants anything. Access attaches to an account
 * that already exists and the notices say "sign in the way you normally do", because a link
 * that turns its holder into an admin is a bearer credential for the most privileged thing
 * we have, sitting in an inbox.
 */
export default function Access() {
  const [data, setData] = useState<AccessData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<AccessData>('/admin/access'));
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<AccessData>('/admin/access')
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

  /**
   * Every mutation funnels through here so the two halves cannot drift apart on screen.
   * A change in one system can change the other's list (the same person appearing twice),
   * and reloading both is cheaper to reason about than patching two lists by hand.
   */
  const afterChange = useCallback(
    async (result: ChangeResult, done: string) => {
      setError(null);
      setSaved(
        result.emailed
          ? done
          : `${done} The email did not send: ${result.emailProblem ?? 'unknown error'} Tell them yourself.`,
      );
      await load();
    },
    [load],
  );

  if (error && !data) return <div className="wrap"><ErrorNote message={error} /></div>;
  if (!data) return <div className="wrap"><Loading what="admin access" /></div>;

  return (
    <div className="wrap">
      <header className="page-head">
        <span className="eyebrow eyebrow-coral">Access</span>
        <h1>Who can get in</h1>
        <p className="page-sub">
          Officers who can sign in to this portal, and students who can open the Tech
          League's admin page. Everything here is recorded, and everyone else with access is
          emailed when it changes.
        </p>
      </header>

      <ErrorNote message={error} />
      <OkNote message={saved} />

      <ChapterSection
        admins={data.chapterAdmins}
        onChanged={afterChange}
        onError={setError}
      />

      <TechLeagueSection
        admins={data.techLeagueAdmins}
        configured={data.techLeagueConfigured}
        problem={data.techLeagueProblem}
        onChanged={afterChange}
        onError={setError}
      />

      <HistorySection history={data.history} />
    </div>
  );
}

/* ---------- admin portal officers ---------- */

function ChapterSection({
  admins,
  onChanged,
  onError,
}: {
  admins: ChapterAdmin[];
  onChanged: (r: ChangeResult, done: string) => Promise<void>;
  onError: (m: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const emailProblem = emailError(email);
  const canSubmit = Boolean(email.trim()) && !emailProblem && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setProblem(null);
    onError(null);
    try {
      const result = await api.post<ChangeResult>('/admin/access/chapter', grantBody({ email, note }));
      await onChanged(result, `${email.trim().toLowerCase()} can now sign in to this portal.`);
      setEmail('');
      setNote('');
      setAdding(false);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: string) {
    setBusy(true);
    setProblem(null);
    try {
      const result = await api.delete<ChangeResult>(
        `/admin/access/chapter?email=${encodeURIComponent(target)}`,
      );
      await onChanged(result, `${target} can no longer sign in to this portal.`);
      setRemoving(null);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <div>
          <h2 className="card-title">Admin portal</h2>
          <p className="page-sub" style={{ marginTop: 4 }}>
            Sponsors, invoices, members, Discord, and this page.
          </p>
        </div>
        <button
          type="button"
          className={adding ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
          onClick={() => {
            setAdding((v) => !v);
            setProblem(null);
          }}
          aria-expanded={adding}
          aria-controls="add-officer"
        >
          {adding ? 'Cancel' : '+ Add officer'}
        </button>
      </div>

      {adding && (
        <form id="add-officer" className="card-pad" onSubmit={submit} noValidate>
          <div className="form-grid">
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              type="email"
              required
              error={emailProblem}
              hint="They will get access the first time they sign in with this address."
              autoComplete="off"
            />
            <Field
              label="Note"
              value={note}
              onChange={setNote}
              placeholder="Treasurer"
              hint="Optional. What they do, so the list makes sense later."
            />
          </div>
          {problem && <p className="field-error">{problem}</p>}
          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            {busy ? 'Adding…' : 'Add officer'}
          </button>
        </form>
      )}

      <div className="card" style={{ padding: 0, border: 0, boxShadow: 'none' }}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Note</th>
              <th scope="col">Status</th>
              <th scope="col">Added by</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.email}>
                <td>{a.email}</td>
                <td className="muted">{a.note ?? '—'}</td>
                <td>
                  {a.signedIn ? (
                    <span className="pill pill-active">Active</span>
                  ) : (
                    <span className="pill pill-invited" title="They have access once they sign in">
                      Invited
                    </span>
                  )}
                </td>
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

      {removing && (
        <div className="card-pad">
          <Confirm
            question={`Remove ${removing} from the admin portal?`}
            points={[
              'They lose access to sponsors, invoices, members and Discord immediately.',
              'We email them to say so, and tell the other officers.',
              'Their account still works, it just stops opening the admin screens.',
              'You can add them back at any time.',
            ]}
            confirmLabel="Remove access"
            danger
            busy={busy}
            busyLabel="Removing…"
            problem={problem}
            onConfirm={() => void remove(removing)}
            onCancel={() => {
              setRemoving(null);
              setProblem(null);
            }}
          />
        </div>
      )}
    </section>
  );
}

/* ---------- Tech League admins ---------- */

function TechLeagueSection({
  admins,
  configured,
  problem: outage,
  onChanged,
  onError,
}: {
  admins: TechLeagueAdmin[];
  configured: boolean;
  problem: string | null;
  onChanged: (r: ChangeResult, done: string) => Promise<void>;
  onError: (m: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const emailProblem = techLeagueEmailError(email);
  const canSubmit = Boolean(email.trim()) && !emailProblem && !busy;

  async function set(target: string, grant: boolean) {
    setBusy(true);
    setProblem(null);
    onError(null);
    try {
      const result = await api.post<ChangeResult>('/admin/access/tech-league', {
        email: target.trim().toLowerCase(),
        grant,
      });
      await onChanged(
        result,
        grant
          ? `${target.trim().toLowerCase()} can now open the Tech League admin page.`
          : `${target} can no longer open the Tech League admin page.`,
      );
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

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <div>
          <h2 className="card-title">Tech League</h2>
          <p className="page-sub" style={{ marginTop: 4 }}>
            Application review, decisions and score entry at techleague.colorstackatgsu.com.
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
            Could not reach the Tech League just now, so its admins are not listed. Officers
            above are unaffected. {outage}
          </div>
        </div>
      )}

      {adding && (
        <form
          id="add-tl-admin"
          className="card-pad"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) void set(email, true);
          }}
          noValidate
        >
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
              'We email them, and tell the other officers.',
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
  );
}

/* ---------- history ---------- */

/**
 * The audit trail, both systems in one list.
 *
 * It is here rather than on a page of its own because it is only useful next to the thing
 * it describes: the question it answers is "who gave this person access", and you are
 * asking that while looking at the list they are on.
 */
function HistorySection({ history }: { history: { realm: 'chapter' | 'tech_league'; targetEmail: string; granted: boolean; actorEmail: string; at: string | null }[] }) {
  if (history.length === 0) return null;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Recent changes</h2>
          <p className="page-sub" style={{ marginTop: 4 }}>
            The last {history.length} access changes across both systems.
          </p>
        </div>
      </div>
      <div className="card" style={{ padding: 0, border: 0, boxShadow: 'none' }}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">What</th>
              <th scope="col">Who</th>
              <th scope="col">By</th>
            </tr>
          </thead>
          <tbody>
            {history.map((g, i) => (
              <tr key={`${g.at ?? ''}-${g.targetEmail}-${i}`}>
                <td className="muted faint">{g.at ? formatDate(g.at) : '—'}</td>
                <td>
                  <span className={g.granted ? 'pill pill-active' : 'pill pill-void'}>
                    {g.granted ? 'Granted' : 'Removed'}
                  </span>{' '}
                  <span className="muted">{REALM_LABEL[g.realm]}</span>
                </td>
                <td>{g.targetEmail}</td>
                <td className="muted faint">{g.actorEmail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
