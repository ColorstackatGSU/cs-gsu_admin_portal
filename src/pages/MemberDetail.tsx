import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { errorMessage, type Member } from '../lib/admin';
import VerifiedBadge from '../components/VerifiedBadge';

/**
 * Read-only officer view of one member. All fields visible, plus a "View
 * resume" button that fetches a fresh short-lived signed URL. No editing:
 * members own their own profile in the member portal, and an admin edit path
 * that overwrites their answers would erode that trust. If a field needs
 * correcting, the officer walks it back through the member.
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

  return (
    <div className="wrap">
      <Link to="/members" className="link">← Members</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <h1>{name}</h1>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>Contact</h2>
        <Field label="School email" value={member.email} />
        <Field label="Personal email" value={member.personalEmail} />
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
            ? `On file. ${member.resumeShared ? 'Shared with eligible sponsors.' : 'Private to this member.'}`
            : 'No resume uploaded yet.'}
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
  /** Rendered after the value. Used for the Discord verified badge. */
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
