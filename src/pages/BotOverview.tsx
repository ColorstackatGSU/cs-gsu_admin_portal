import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { errorMessage } from '../lib/admin';
import { ACTION_LABEL, type BotOverview as Overview } from '../lib/discord';
import { ErrorNote, Empty, Loading } from '../components/Form';

/**
 * The Discord screen an officer lands on: is anything stuck, and is anything happening.
 *
 * Four numbers and a thirty-day shape. The shape matters more than it looks — verification
 * is bursty (a wave after every /setup post, nothing for a fortnight) and a flat line where
 * there should be a wave is the first sign the endpoint is not receiving anything at all,
 * which is otherwise silent.
 */
export default function BotOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Overview>('/admin/discord/overview')
      .then((d) => {
        if (!cancelled) setData(d);
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
        <h1>Bot overview</h1>
        <p className="page-sub">
          Verification runs inside this API now — Discord posts every button click straight
          to it, and members are matched against their member record rather than a
          spreadsheet. Anything it could not resolve on its own lands in the queue.
        </p>
      </header>

      <ErrorNote message={error} />

      {!data && !error && <Loading what="Discord activity" />}

      {data && (
        <>
          {data.pending > 0 && (
            <div className="note note-warn" style={{ marginBottom: 22 }}>
              <strong>
                {data.pending} {data.pending === 1 ? 'person is' : 'people are'} waiting to be
                verified.
              </strong>{' '}
              Each one clicked Verify in the server and could not be matched automatically.{' '}
              <Link className="link" to="/bot/queue">
                Work through the queue →
              </Link>
            </div>
          )}

          <div className="summary-grid" style={{ marginBottom: 22 }}>
            <div>
              <p className="summary-key">Waiting on you</p>
              <p className="summary-val summary-val-big">{data.pending}</p>
            </div>
            <div>
              <p className="summary-key">Discord linked</p>
              <p className="summary-val summary-val-big">{data.linked}</p>
            </div>
            <div>
              <p className="summary-key">Never verified</p>
              <p className="summary-val summary-val-big">{data.unlinked}</p>
            </div>
            <div>
              <p className="summary-key">Verified this week</p>
              <p className="summary-val summary-val-big">{data.verifiedLast7Days}</p>
            </div>
          </div>

          <section className="card card-flush card-violet" style={{ marginBottom: 22 }}>
            <div className="card-head">
              <span className="card-title">Verifications · last 30 days</span>
            </div>
            <div className="card-pad">
              <Sparkbars data={data.verificationsByDay} />
            </div>
          </section>

          <section className="card card-flush card-sky">
            <div className="card-head">
              <span className="card-title">Recent activity</span>
              <Link className="btn btn-secondary btn-sm" to="/bot/links">
                Discord links
              </Link>
            </div>
            {data.recentActions.length === 0 ? (
              <Empty
                title="Nothing yet"
                body="Every role grant and every officer decision shows up here, with who made it. It fills up the first time somebody clicks Verify."
              />
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Who</th>
                      <th>What</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentActions.map((a) => (
                      <tr key={a.id}>
                        <td className="muted">{new Date(a.at).toLocaleString()}</td>
                        <td>
                          {a.memberId ? (
                            <Link className="link" to={`/members/${a.memberId}`}>
                              {a.memberName ?? 'Member'}
                            </Link>
                          ) : (
                            <span className="muted">
                              {a.discordUserId ? `Discord ${a.discordUserId}` : '—'}
                            </span>
                          )}
                        </td>
                        <td>{ACTION_LABEL[a.action] ?? a.action}</td>
                        {/* 'system' means the member did it themselves with nobody in
                            the loop, which is the outcome we want most of the time. */}
                        <td className="muted">
                          {a.actor === 'system' ? 'the bot' : a.actor}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Thirty bars, one per day, zero-filled by the backend so a quiet day is a flat bar
 * rather than a gap the eye reads as a spike either side of it.
 *
 * Inline rather than a charting dependency: it is one series of thirty integers, and the
 * only question being asked of it is "is this shape roughly what I expected".
 */
function Sparkbars({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        No verifications in the last 30 days. That is normal outside the start of a
        semester — but if you have just posted the welcome message, check{' '}
        <Link className="link" to="/bot/health">
          Bot health
        </Link>{' '}
        to make sure Discord is actually reaching this server.
      </p>
    );
  }

  return (
    <>
      <div className="sparkbars" role="img" aria-label={`${total} verifications over 30 days`}>
        {data.map((d) => (
          <div
            key={d.day}
            className="sparkbar"
            style={{ height: `${Math.round((d.count / max) * 100)}%` }}
            title={`${d.day}: ${d.count}`}
          />
        ))}
      </div>
      <div className="sparkbars-axis">
        <span>{data[0]?.day}</span>
        <span className="num">{total} total</span>
        <span>{data[data.length - 1]?.day}</span>
      </div>
    </>
  );
}
