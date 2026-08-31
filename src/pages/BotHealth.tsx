import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/admin';
import type { BotHealth as Health } from '../lib/discord';
import { ErrorNote, Loading } from '../components/Form';

/**
 * Is the Discord integration actually wired up.
 *
 * Every check here resolves against the live guild rather than against the config file,
 * because the failure worth catching is a role id that is a perfectly plausible snowflake
 * pointing at nothing. Nothing complains about that until a member clicks Verify and the
 * grant 404s, by which point they are in the queue and nobody knows why.
 *
 * The role ids live in environment variables rather than in the database. That was the
 * simpler choice, and this screen is the price of it: it cannot fix a wrong id, but it
 * will tell you exactly which one is wrong, which is the part that used to take an hour.
 */
export default function BotHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Health>('/admin/discord/health')
      .then((h) => {
        if (!cancelled) setHealth(h);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="wrap">
      <header className="page-head">
        <span className="eyebrow eyebrow-violet">Discord</span>
        <h1>Bot health</h1>
        <p className="page-sub">
          Whether Discord can reach this server, and whether the ids it has been given point
          at anything real.
        </p>
      </header>

      <ErrorNote message={error} />
      {!health && !error && <Loading what="health checks" />}

      {health && (
        <>
          {!health.configured && (
            <div className="note note-error" style={{ marginBottom: 22 }} role="alert">
              <strong>Verification is switched off.</strong> These environment variables are
              missing on the API: <code>{health.missingSettings.join(', ')}</code>. Until they
              are set, clicking Verify tells the member to find an officer.
            </div>
          )}

          <section className="card card-flush card-mint" style={{ marginBottom: 22 }}>
            <div className="card-head">
              <span className="card-title">Checks</span>
            </div>
            <div className="table-scroll">
              <table className="table">
                <tbody>
                  <Check
                    ok={health.configured}
                    label="Settings present"
                    detail={
                      health.configured
                        ? 'Bot token, application, guild and both role ids are set.'
                        : `Missing: ${health.missingSettings.join(', ')}`
                    }
                  />
                  <Check
                    ok={health.guildReachable}
                    label="Guild reachable"
                    detail={
                      health.guildReachable
                        ? 'The bot token works and the bot is in the server.'
                        : (health.guildError ??
                          'Discord did not answer. Usually a wrong bot token, or the bot was removed from the server.')
                    }
                  />
                  <Check
                    ok={health.gsuRoleResolves}
                    label="GSU role id resolves"
                    detail={
                      health.gsuRoleResolves
                        ? `Points at “${health.gsuRoleName}”.`
                        : 'No role in the server has that id. Every verification will fail at the grant.'
                    }
                  />
                  <Check
                    ok={health.nationalRoleResolves}
                    label="National role id resolves"
                    detail={
                      health.nationalRoleResolves
                        ? `Points at “${health.nationalRoleName}”.`
                        : 'No role in the server has that id. National members will be verified without their National role.'
                    }
                  />
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" style={{ marginBottom: 22 }}>
            <h2 className="card-title" style={{ marginTop: 0 }}>
              Interactions endpoint
            </h2>
            <p className="page-sub" style={{ marginTop: 8 }}>
              This has to match the <strong>Interactions Endpoint URL</strong> field in
              Discord's developer portal, under General Information. That one field is the
              entire switch between this server and the old bot — changing it takes effect
              immediately, and pasting the old URL back rolls it out again.
            </p>
            <p className="input input-mono" style={{ margin: 0, wordBreak: 'break-all' }}>
              {health.interactionsUrl || 'Not set — DISCORD_INTERACTIONS_URL is for display only'}
            </p>
          </section>

          <section className="card">
            <h2 className="card-title" style={{ marginTop: 0 }}>
              Signs of life
            </h2>
            <Row
              label="Last interaction handled"
              value={
                health.lastInteractionAt
                  ? new Date(health.lastInteractionAt).toLocaleString()
                  : 'Never'
              }
              hint="Nothing here after a welcome post means Discord is not reaching this server at all."
            />
            <Row
              label="Last member verified"
              value={
                health.lastVerificationAt
                  ? new Date(health.lastVerificationAt).toLocaleString()
                  : 'Never'
              }
            />
          </section>
        </>
      )}
    </div>
  );
}

/** Colour never carries it alone: every row spells out pass or fail in words. */
function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <tr>
      <td style={{ width: 120 }}>
        <span className={ok ? 'pill pill-paid' : 'pill pill-overdue'}>{ok ? 'OK' : 'Problem'}</span>
      </td>
      <td style={{ fontWeight: 700 }}>{label}</td>
      <td className="muted" style={{ textAlign: 'left' }}>
        {detail}
      </td>
    </tr>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ padding: '8px 0', fontSize: 14 }}>
      <span className="muted" style={{ display: 'inline-block', minWidth: 200 }}>
        {label}
      </span>
      <span style={{ fontWeight: 600 }}>{value}</span>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
