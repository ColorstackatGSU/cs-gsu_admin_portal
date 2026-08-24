import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { errorMessage, type Invoice, type InvoiceStatus } from '../lib/admin';
import { displayStatus, formatDate, formatMoney, statusLabel } from '../lib/format';
import StatusPill from '../components/StatusPill';
import { Empty, ErrorNote, Loading } from '../components/Form';

/**
 * Every invoice, newest first.
 *
 * What this page had to fix:
 *
 *   - The status filter was a bare select floated to the right of the table
 *     with the raw enum values as its options ("processing"), reading as
 *     unrelated chrome rather than as the control for the list below it. It is
 *     now a left-aligned toolbar with spelled-out labels and a result count,
 *     and the choice is kept in the URL so a filtered list can be pasted to
 *     another officer.
 *   - Rows only responded to a click landing exactly on the title. The whole
 *     row now navigates, with an OPEN marker that says so.
 *   - Nothing was totalled. There is now a line saying what is outstanding,
 *     which is the number anyone opening this page actually came for.
 *
 * `?status=` is passed through to GET /admin/invoices, which filters on the
 * stored column. "Overdue" is deliberately not offered: it is not a stored
 * status, it is an issued invoice past its due date, so filtering on it
 * server-side is not something the API can do.
 */
const STATUSES: InvoiceStatus[] = ['draft', 'issued', 'processing', 'paid', 'void'];

/** The result of one fetch, tagged with the filter it was fetched for. Keeping
 *  the tag means a stale response for a filter we have moved on from is simply
 *  ignored, and we never have to blank the list synchronously to show a spinner. */
type Loaded = { key: string; rows: Invoice[]; error: string | null };

export default function Invoices() {
  const nav = useNavigate();
  const [search, setSearch] = useSearchParams();
  const status = search.get('status') ?? '';

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get<Invoice[]>(`/admin/invoices${status ? `?status=${encodeURIComponent(status)}` : ''}`)
      .then((rows) => {
        if (!cancelled) setLoaded({ key: status, rows, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoaded({ key: status, rows: [], error: errorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const fresh = loaded && loaded.key === status ? loaded : null;
  const rows = fresh?.rows ?? null;
  const error = fresh?.error ?? null;
  const loading = rows === null;

  const visible = useMemo(() => {
    const list = rows ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.sponsorName.toLowerCase().includes(q) ||
        (i.tierName ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  // What is actually owed us: issued, which includes overdue. Drafts were never
  // sent, processing has already been paid and is only settling, and void does
  // not count at all.
  const awaiting = (rows ?? []).filter((i) => i.status === 'issued');
  const outstanding = awaiting.reduce((sum, i) => sum + i.amountCents, 0);

  function setStatus(next: string) {
    const params = new URLSearchParams(search);
    if (next) params.set('status', next);
    else params.delete('status');
    setSearch(params, { replace: true });
  }

  return (
    <div className="wrap">
      <header className="page-head">
        <div className="page-head-row">
          <div>
            <span className="eyebrow eyebrow-sky">Billing</span>
            <h1>Invoices</h1>
            <p className="page-sub">
              Every invoice we have raised, newest first. Drafts are invisible to the
              sponsor until you issue them.
            </p>
          </div>
          <Link className="btn btn-primary" to="/invoices/new">
            + New invoice
          </Link>
        </div>
      </header>

      <ErrorNote message={error} />

      {!loading && !status && outstanding > 0 && (
        <div className="note note-warn" style={{ marginBottom: 22 }}>
          <strong className="num">{formatMoney(outstanding)}</strong> issued and not yet
          paid, across {awaiting.length} invoice{awaiting.length === 1 ? '' : 's'}.
        </div>
      )}

      <div className="toolbar">
        <label className="toolbar-label" htmlFor="invoice-q">
          Find
        </label>
        <input
          id="invoice-q"
          className="input"
          type="search"
          placeholder="Invoice or sponsor"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="toolbar-label" htmlFor="invoice-status">
          Status
        </label>
        <select
          id="invoice-status"
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        {!loading && <span className="toolbar-count">{visible.length} shown</span>}
      </div>

      <section className="card card-flush">
        <div className="card-head">
          <span className="card-title">
            {status ? `${statusLabel(status as InvoiceStatus)} invoices` : 'All invoices'}
          </span>
          <span className="hint" style={{ margin: 0 }}>
            Click a row to issue, void or open in Zeffy
          </span>
        </div>

        {loading ? (
          <Loading what="invoices" />
        ) : visible.length === 0 ? (
          <Empty
            title={status || query ? 'Nothing matches' : 'No invoices yet'}
            body={
              status || query
                ? 'No invoice matches that search and filter.'
                : 'Raise one from a sponsor with a tier assigned. It starts as a draft, so nothing reaches the sponsor until you issue it.'
            }
          >
            {status || query ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setQuery('');
                  setStatus('');
                }}
              >
                Clear filters
              </button>
            ) : (
              <Link className="btn btn-primary" to="/invoices/new">
                + New invoice
              </Link>
            )}
          </Empty>
        ) : (
          <>
            <div className="table-scroll">
              <table className="table only-wide">
                <thead>
                  <tr>
                    <th scope="col">Invoice</th>
                    <th scope="col">Sponsor</th>
                    <th scope="col">Status</th>
                    <th scope="col">Due</th>
                    <th scope="col">Paid</th>
                    <th scope="col">Amount</th>
                    <th scope="col">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((i) => (
                    <tr
                      key={i.id}
                      className="row-link"
                      onClick={() => nav(`/invoices/${i.id}`)}
                      title={`Open ${i.title}`}
                    >
                      <td>
                        <Link
                          className="link"
                          to={`/invoices/${i.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {i.title}
                        </Link>
                        {i.tierName && (
                          <div className="faint" style={{ fontSize: 12 }}>
                            {i.tierName}
                          </div>
                        )}
                      </td>
                      <td>
                        <Link
                          className="link"
                          to={`/sponsors/${i.sponsorId}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {i.sponsorName}
                        </Link>
                      </td>
                      <td>
                        <StatusPill status={displayStatus(i)} />
                      </td>
                      <td className="muted num">{formatDate(i.dueAt) || '—'}</td>
                      <td className="muted num">{formatDate(i.paidAt) || '—'}</td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        {formatMoney(i.amountCents)}
                      </td>
                      <td>
                        <span className="row-go">Open →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="only-narrow rows">
              {visible.map((i) => (
                <Link key={i.id} to={`/invoices/${i.id}`} className="row">
                  <span>
                    <span className="row-title">{i.title}</span>
                    <span className="row-meta">{i.sponsorName}</span>
                    <span className="row-meta num">
                      {i.dueAt ? `Due ${formatDate(i.dueAt)}` : 'No due date'}
                    </span>
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 6,
                    }}
                  >
                    <span className="row-amount num">{formatMoney(i.amountCents)}</span>
                    <StatusPill status={displayStatus(i)} />
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
