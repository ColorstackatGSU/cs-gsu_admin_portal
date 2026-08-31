import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { errorMessage } from '../lib/admin';
import { memberName, type DiscordLink } from '../lib/discord';
import { Empty, ErrorNote, Loading, OkNote } from '../components/Form';

type Filter = 'linked' | 'unlinked' | 'all';

/**
 * Which member holds which Discord account.
 *
 * Three questions this answers that nothing else does: who has never verified, whether a
 * link is pointing at the wrong person, and whether two member records are claiming the
 * same Discord handle — which is the thing that makes verification refuse to guess and
 * puts somebody in the queue.
 */
export default function BotLinks() {
  const [filter, setFilter] = useState<Filter>('linked');
  /* Rows are stored with the filter they were fetched for, rather than being
     cleared to null when the filter changes. Clearing would be a setState in the
     effect body, and this way "still loading" is derived instead of stored. */
  const [loaded, setLoaded] = useState<{ filter: Filter; rows: DiscordLink[] } | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query =
      filter === 'all' ? '' : filter === 'linked' ? '?linked=true' : '?linked=false';
    return api.get<DiscordLink[]>(`/admin/discord/links${query}`);
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((r) => {
        if (!cancelled) setLoaded({ filter, rows: r });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoaded({ filter, rows: [] });
        setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [load, filter]);

  const rows = loaded && loaded.filter === filter ? loaded.rows : null;

  /**
   * Two member records with the same Discord handle cannot both be verified — the bot
   * refuses to pick, and both people end up in the queue. Surfacing it here is the only
   * way anyone finds out before that happens.
   */
  const duplicates = useMemo(() => {
    const seen = new Map<string, number>();
    for (const row of rows ?? []) {
      const handle = row.discordUsername?.trim().toLowerCase();
      if (handle) seen.set(handle, (seen.get(handle) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([h]) => h));
  }, [rows]);

  const filtered = (rows ?? []).filter((r) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return [r.firstName, r.lastName, r.email, r.discordUsername, r.discordUserId]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  async function unlink(row: DiscordLink) {
    if (busy) return;
    if (
      !window.confirm(
        `Unlink ${memberName(row)} from Discord account ${row.discordUserId}?\n\n` +
          'Their chapter roles in the server are removed too. They can click Verify again ' +
          'to get them back, as long as the Discord handle on their profile is right.',
      )
    ) {
      return;
    }
    setBusy(row.memberId);
    setError(null);
    try {
      await api.post(`/admin/discord/links/${row.memberId}/unlink`, { revokeRoles: true });
      setDone(`Unlinked ${memberName(row)} and removed their roles.`);
      setLoaded({ filter, rows: await load() });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function grant(row: DiscordLink) {
    if (busy) return;
    setBusy(row.memberId);
    setError(null);
    try {
      await api.post(`/admin/discord/links/${row.memberId}/grant`);
      setDone(`Re-granted ${memberName(row)}'s chapter roles.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const loading = rows === null;

  return (
    <div className="wrap">
      <header className="page-head">
        <span className="eyebrow eyebrow-violet">Discord</span>
        <h1>Discord links</h1>
        <p className="page-sub">
          Which Discord account each member verified with. The handle is what they typed on
          their profile and is what verification matches on; the account id is what they
          actually proved they hold.
        </p>
      </header>

      <ErrorNote message={error} />
      <OkNote message={done} />

      {duplicates.size > 0 && (
        <div className="note note-warn" style={{ marginBottom: 22 }}>
          <strong>
            {duplicates.size} Discord {duplicates.size === 1 ? 'handle is' : 'handles are'}{' '}
            claimed by more than one member record.
          </strong>{' '}
          Verification refuses to guess between them, so everyone involved ends up in the
          queue. Fix the wrong one on the member's profile — or ask them to.
        </div>
      )}

      <div className="toolbar">
        <span className="toolbar-label">Show</span>
        <select
          className="input"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
        >
          <option value="linked">Verified on Discord</option>
          <option value="unlinked">Never verified</option>
          <option value="all">Everyone</option>
        </select>
        <input
          className="input"
          placeholder="Search by name, email or handle…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="toolbar-count">
          {loading ? '—' : `${filtered.length} of ${(rows ?? []).length}`}
        </span>
      </div>

      <section className="card card-flush card-sky">
        <div className="card-head">
          <span className="card-title">
            {filter === 'unlinked' ? 'Not on Discord' : 'Members'}
          </span>
          <Link className="btn btn-secondary btn-sm" to="/bot/queue">
            Queue
          </Link>
        </div>

        {loading ? (
          <Loading what="Discord links" />
        ) : filtered.length === 0 ? (
          <Empty
            title={filter === 'unlinked' ? 'Everyone has verified' : 'Nothing here'}
            body={
              filter === 'unlinked'
                ? 'Every member record has a Discord account against it.'
                : 'No member matches that search.'
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Handle they typed</th>
                  <th>Verified</th>
                  <th>Roles</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const handle = row.discordUsername?.trim().toLowerCase();
                  const duplicate = handle ? duplicates.has(handle) : false;
                  return (
                    <tr key={row.memberId}>
                      <td>
                        <Link className="link" to={`/members/${row.memberId}`}>
                          {memberName(row)}
                        </Link>
                        <br />
                        <span className="muted" style={{ fontSize: 12.5 }}>
                          {row.email}
                        </span>
                      </td>
                      <td>
                        {row.discordUsername ?? <span className="muted">—</span>}
                        {duplicate && (
                          <>
                            {' '}
                            <span className="pill pill-overdue">Duplicate</span>
                          </>
                        )}
                      </td>
                      <td>
                        {row.discordVerifiedAt ? (
                          <>
                            <span className="pill pill-paid">Verified</span>
                            <br />
                            <span className="muted" style={{ fontSize: 12 }}>
                              {new Date(row.discordVerifiedAt).toLocaleDateString()}
                            </span>
                          </>
                        ) : (
                          <span className="pill pill-invited">Not verified</span>
                        )}
                      </td>
                      <td className="muted">
                        {row.discordUserId
                          ? row.nationalMemberApplied
                            ? 'GSU + National'
                            : 'GSU'
                          : '—'}
                      </td>
                      <td>
                        {row.discordUserId && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busy !== null}
                              onClick={() => void grant(row)}
                              title="Grant the chapter roles again, for somebody who lost them"
                            >
                              Re-grant
                            </button>{' '}
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              disabled={busy !== null}
                              onClick={() => void unlink(row)}
                            >
                              {busy === row.memberId ? '…' : 'Unlink'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
