import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import {
  canCorrectEmail,
  errorMessage,
  type CorrectEmailResult,
  type EmailField,
  type Member,
} from '../lib/admin';
import VerifiedBadge from '../components/VerifiedBadge';

/**
 * Officer view of one member. All fields visible, plus a "View resume" button that fetches
 * a fresh short-lived signed URL.
 *
 * The one thing an officer can change is an address mistyped on the membership form, and
 * only before the account is claimed. Everything else stays read-only: members own their
 * profile in the member portal, and an admin edit path that overwrites their answers would
 * erode that trust. A typo is different because it is the thing locking them out of the
 * portal where they would fix it themselves.
 */
export default function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .get<Member>(`/admin/members/${id}`)
      .then((m) => { if (!cancelled) setMember(m); })
      .catch((e: unknown) => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [id]);

  async function openResume() {
    if (!id || opening) return;
    setOpening(true);
    setError(null);
    try {
      const { url } = await api.get<{ url: string }>(`/admin/members/${id}/resume-url`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOpening(false);
    }
  }

  if (error) {
    return (
      <div className="wrap">
        <Link to="/members" className="link">← Members</Link>
        <div className="note note-error" style={{ marginTop: 16 }}>{error}</div>
      </div>
    );
  }
  if (!member) return <div className="wrap"><p>Loading…</p></div>;

  const name = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email;
  const fixable = canCorrectEmail(member);

  return (
    <div className="wrap">
      <Link to="/members" className="link">← Members</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <h1>{name}</h1>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>Contact</h2>
        <EmailRow
          label="School email"
          field="SCHOOL"
          member={member}
          fixable={fixable}
          onFixed={setMember}
        />
        <EmailRow
          label="Personal email"
          field="PERSONAL"
          member={member}
          fixable={fixable && member.personalEmail != null}
          onFixed={setMember}
        />
        {!fixable && (
          <p className="hint" style={{ marginLeft: 156 }}>
            Their account is set up, so these cannot be fixed here. The school address is their
            login, and they can change their personal one from their profile.
          </p>
        )}
        <Field label="Pronouns" value={member.pronouns} />
        <Field label="LinkedIn" value={member.linkedinUrl} link />
        <Field label="GitHub" value={member.githubUrl} link />
        <Field
          label="Discord"
          value={member.discordUsername}
          badge={<VerifiedBadge verifiedAt={member.discordVerifiedAt} />}
        />
        {member.discordUsername && !member.discordVerifiedAt && (
          <p className="hint" style={{ marginLeft: 156 }}>
            They typed this handle but have never clicked Verify in the server, so nothing
            confirms the account is theirs.
          </p>
        )}
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>Academics</h2>
        <Field label="Majors" value={member.majors} />
        <Field label="Class year" value={member.classYear} />
        <Field
          label="Graduating"
          value={[member.gradTerm, member.gradYear].filter(Boolean).join(' ') || null}
        />
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>Resume</h2>
        <p className="muted" style={{ fontSize: 14 }}>
          {member.hasResume
            ? 'On file, and in the book eligible sponsors can see. Every member’s is.'
            : 'No resume uploaded yet, so there is nothing in the book for them.'}
        </p>
        {member.hasResume && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={openResume}
            disabled={opening}
          >
            {opening ? 'Opening…' : 'View resume ↗'}
          </button>
        )}
      </section>

      <section className="card">
        <h2 className="section-title" style={{ marginTop: 0 }}>Account</h2>
        <Field label="Activated" value={member.activatedAt ? new Date(member.activatedAt).toLocaleString() : 'Never'} />
        <Field label="Signed up" value={new Date(member.createdAt).toLocaleString()} />
        <Field label="Auth user id" value={member.userId ?? 'Not linked yet'} mono />
      </section>
    </div>
  );
}

/**
 * One address, with a "Fix typo" button that opens an inline form.
 *
 * Saving changes the address and emails the member at the corrected one with a fresh
 * activation code, since their welcome email went to the typo. The typo itself is never
 * written to: whoever owns that address is not the member.
 */
function EmailRow({
  label,
  field,
  member,
  fixable,
  onFixed,
}: {
  label: string;
  field: EmailField;
  member: Member;
  fixable: boolean;
  onFixed: (member: Member) => void;
}) {
  const current = field === 'SCHOOL' ? member.email : member.personalEmail;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);

  function open() {
    setDraft(current ?? '');
    setProblem(null);
    setDone(null);
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = draft.trim().toLowerCase();
    if (!next || saving) return;
    if (next === current) {
      setProblem('That is already the address on file.');
      return;
    }
    if (
      !window.confirm(
        `Change ${current} to ${next}?\n\n` +
          `We will email ${next} to say the address was fixed, with a code to set up their account.`,
      )
    ) {
      return;
    }

    setSaving(true);
    setProblem(null);
    try {
      const result = await api.post<CorrectEmailResult>(
        `/admin/members/${member.id}/correct-email`,
        { field, newEmail: next },
      );
      onFixed(result.member);
      setEditing(false);
      setDone(
        result.emailed
          ? { ok: true, text: `Fixed. We emailed ${next} with a code to set up their account.` }
          : {
              ok: false,
              text:
                `Fixed, but the email did not send: ${result.emailProblem ?? 'unknown error'} ` +
                'They can still request a code on the activation page with the corrected address.',
            },
      );
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Field
        label={label}
        value={current}
        badge={
          fixable && !editing ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={open}>
              Fix typo
            </button>
          ) : undefined
        }
      />
      {editing && (
        <form onSubmit={save} style={{ marginLeft: 156, marginBottom: 12, maxWidth: 420 }}>
          <label className="field" style={{ marginBottom: 8 }}>
            <span className="label">Correct {label.toLowerCase()}</span>
            <input
              className={`input${problem ? ' input-bad' : ''}`}
              type="email"
              required
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving}
            />
            {problem && <div className="field-error">{problem}</div>}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save and email them'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {done && (
        <div
          className={`note ${done.ok ? 'note-ok' : 'note-warn'}`}
          style={{ marginLeft: 156, marginBottom: 12 }}
        >
          {done.text}
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  link,
  mono,
  badge,
}: {
  label: string;
  value: string | null;
  link?: boolean;
  mono?: boolean;
  /** Rendered after the value. The Discord verified badge, or the Fix typo button. */
  badge?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '6px 0', fontSize: 14 }}>
      <span className="muted" style={{ minWidth: 140 }}>{label}</span>
      <span
        style={{
          fontFamily: mono ? 'ui-monospace, monospace' : undefined,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {value ? (
          link ? (
            <a href={value} target="_blank" rel="noopener noreferrer" className="link">{value}</a>
          ) : (
            value
          )
        ) : (
          <span className="muted">—</span>
        )}
        {badge}
      </span>
    </div>
  );
}
