import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { errorMessage, type Member } from '../lib/admin';
import VerifiedBadge from '../components/VerifiedBadge';

/**
 * Every member the intake form has produced, newest first. Admin-only, so no
 * tier gate and no opt-in filter — an officer needs to see the whole picture
 * when troubleshooting an account or checking a resume.
 *
 * What this page had to fix:
 *   - The only thing on screen saying how many members there are was a "N of M"
 *     line above a table you had to scroll to the bottom of to believe. When the
 *     number is the thing being doubted, the table has to count out loud: the
 *     first column is now each member's position in the list, so the last row
 *     carries the total and any single row can be pointed at.
 *   - Every member rendered at once, which is fine at two hundred rows and not
 *     at two thousand. Pages of 50 by default, with an "All on one page" for the
 *     officer who would rather scroll or Ctrl+F the whole thing.
 *   - Search matched free text and nothing else, so the questions the roster is
 *     actually asked — how many activated, how many verified in Discord, how
 *     many have a resume on file — meant counting by eye. Those are chips now,
 *     and they compose with the search box and the grad-year picker.
 *
 * Numbering follows the filtered list, not the underlying roster: the whole
 * point of a number beside a row is that it agrees with the count above it.
 */

type Filter = 'all' | 'activated' | 'not-activated' | 'discord-verified' | 'has-resume';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'activated', label: 'Account set up' },
  { key: 'not-activated', label: 'Never signed in' },
  { key: 'discord-verified', label: 'Discord verified' },
  { key: 'has-resume', label: 'Has resume' },
];

/** 0 means "all on one page", kept as a number so the maths below stays uniform. */
const PAGE_SIZES = [25, 50, 100, 0];

export default function Members() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [gradYear, setGradYear] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  /**
   * Narrowing the list always starts it over at the first page. Done in the
   * handlers rather than an effect on the filter state: an effect would render
   * page 7 of a two-page result once before correcting itself, and the whole
   * job of this screen is to never show a count nobody can reproduce.
   */
  function narrow(apply: () => void) {
    apply();
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;
    api
      .get<Member[]>('/admin/members')
      .then((rows) => { if (!cancelled) setMembers(rows); })
      .catch((e: unknown) => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, []);

  /** Only the years somebody actually graduates in, soonest first. */
  const gradYears = useMemo(() => {
    const years = new Set<number>();
    for (const m of members ?? []) if (m.gradYear) years.add(m.gradYear);
    return [...years].sort((a, b) => a - b);
  }, [members]);

  const filtered = useMemo(() => {
    if (!members) return null;
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (filter === 'activated' && !m.activatedAt) return false;
      if (filter === 'not-activated' && m.activatedAt) return false;
      if (filter === 'discord-verified' && !m.discordVerifiedAt) return false;
      if (filter === 'has-resume' && !m.hasResume) return false;
      if (gradYear && String(m.gradYear ?? '') !== gradYear) return false;
      if (!q) return true;
      const hay = [
        m.email, m.personalEmail, m.firstName, m.lastName,
        m.majors, m.classYear, m.gradTerm, m.gradYear?.toString(), m.discordUsername,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [members, query, filter, gradYear]);

  const total = filtered?.length ?? 0;
  const perPage = pageSize === 0 ? Math.max(total, 1) : pageSize;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  // Clamped on read rather than corrected in state, so a filter that shrinks the
  // list renders the last real page instead of flashing an empty one first.
  const current = Math.min(page, pageCount);
  const start = (current - 1) * perPage;
  const visible = filtered?.slice(start, start + perPage) ?? [];

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Members</h1>
      </div>
      {error && <div className="note note-error">{error}</div>}
      {!members && !error && <p>Loading members…</p>}
      {members && (
        <>
          {/* The headline number, stated once, where a number belongs. Everything
              below it is a way of narrowing that number down. */}
          <div className="stat-row">
            <Stat label="Members" value={members.length} />
            <Stat label="Account set up" value={members.filter((m) => m.activatedAt).length} />
            <Stat label="Discord verified" value={members.filter((m) => m.discordVerifiedAt).length} />
            <Stat label="Resume on file" value={members.filter((m) => m.hasResume).length} />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={filter === f.key ? 'btn btn-sm' : 'btn btn-sm btn-secondary'}
                onClick={() => narrow(() => setFilter(f.key))}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <input
              className="input"
              placeholder="Search by name, email, major, grad year…"
              value={query}
              onChange={(e) => narrow(() => setQuery(e.target.value))}
              style={{ flex: '1 1 260px', marginBottom: 0 }}
            />
            {gradYears.length > 0 && (
              <select
                className="input"
                value={gradYear}
                onChange={(e) => narrow(() => setGradYear(e.target.value))}
                style={{ flex: '0 1 170px', marginBottom: 0 }}
              >
                <option value="">All grad years</option>
                {gradYears.map((y) => (
                  <option key={y} value={String(y)}>Class of {y}</option>
                ))}
              </select>
            )}
            <select
              className="input"
              value={String(pageSize)}
              onChange={(e) => narrow(() => setPageSize(Number(e.target.value)))}
              style={{ flex: '0 1 160px', marginBottom: 0 }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={String(n)}>
                  {n === 0 ? 'All on one page' : `${n} per page`}
                </option>
              ))}
            </select>
          </div>

          <p className="muted" style={{ fontSize: 14, marginBottom: 8 }}>
            {total === 0 ? (
              `No matches out of ${members.length} members`
            ) : (
              <>
                Showing <span className="num">{start + 1}–{start + visible.length}</span>
                {' of '}<span className="num">{total}</span>
                {total === members.length
                  ? ' members'
                  : <> matching, out of <span className="num">{members.length}</span> members</>}
              </>
            )}
          </p>

          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Grad</th>
                  <th>Discord</th>
                  <th>Resume</th>
                  <th>Activated</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m, i) => (
                  <tr key={m.id}>
                    {/* Position in the filtered list, so it keeps counting across
                        pages rather than restarting at 1 on each one. */}
                    <td className="num faint">{start + i + 1}</td>
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
                    <td>{m.hasResume ? '✓' : '—'}</td>
                    <td>{m.activatedAt ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {total === 0 && (
              <p className="muted" style={{ padding: 16 }}>No matches.</p>
            )}
          </div>

          {pageCount > 1 && (
            <div className="pager">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setPage(current - 1)}
                disabled={current === 1}
              >
                ← Previous
              </button>
              <span className="muted" style={{ fontSize: 13 }}>
                Page <span className="num">{current}</span> of <span className="num">{pageCount}</span>
              </span>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setPage(current + 1)}
                disabled={current === pageCount}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Same shape as the resume push numbers, so the screens read alike. */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
