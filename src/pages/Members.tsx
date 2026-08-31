import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { errorMessage, type Member } from '../lib/admin';
import VerifiedBadge from '../components/VerifiedBadge';

/**
 * Every member the intake form has produced, newest first. Admin-only, so no
 * tier gate and no opt-in filter — an officer needs to see the whole picture
 * when troubleshooting an account or checking a resume.
 */
export default function Members() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get<Member[]>('/admin/members')
      .then((rows) => { if (!cancelled) setMembers(rows); })
      .catch((e: unknown) => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, []);

  const filtered = members?.filter((m) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const hay = [
      m.email, m.personalEmail, m.firstName, m.lastName,
      m.majors, m.classYear, m.gradTerm, m.gradYear?.toString(), m.discordUsername,
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Members</h1>
      </div>
      {error && <div className="note note-error">{error}</div>}
      {!members && !error && <p>Loading members…</p>}
      {members && (
        <>
          <input
            className="input"
            placeholder="Search by name, email, major, grad year…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 16 }}
          />
          <p className="muted" style={{ fontSize: 14, marginBottom: 8 }}>
            {filtered?.length ?? 0} of {members.length}
          </p>
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Grad</th>
                  <th>Discord</th>
                  <th>Resume</th>
                  <th>Activated</th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link to={`/members/${m.id}`} className="link">
                        {[m.firstName, m.lastName].filter(Boolean).join(' ') || '—'}
                      </Link>
                    </td>
                    <td className="muted">{m.email}</td>
                    <td className="muted">
                      {[m.gradTerm, m.gradYear].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td>
                      {m.discordVerifiedAt ? (
                        <VerifiedBadge verifiedAt={m.discordVerifiedAt} />
                      ) : m.discordUsername ? (
                        <span className="muted">{m.discordUsername}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{m.hasResume ? (m.resumeShared ? '✓ shared' : '✓ private') : '—'}</td>
                    <td>{m.activatedAt ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered?.length === 0 && (
              <p className="muted" style={{ padding: 16 }}>No matches.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
