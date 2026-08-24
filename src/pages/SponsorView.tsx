import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { displayStatus, formatDate, formatMoney } from '../lib/format';
import StatusPill from '../components/StatusPill';
import { errorMessage, type Invoice, type SponsorDetail } from '../lib/admin';

/**
 * Read-only preview of what a sponsor sees. Renders inside the admin portal,
 * so no impersonation, no session juggling, no risk of the officer clicking
 * a button that mutates something as the sponsor. Everything the sponsor
 * portal shows on their dashboard is here: header with tier + brand hint,
 * outstanding invoice call-out, invoice history.
 *
 * Reuses existing admin endpoints (/admin/sponsors/:id, /admin/invoices) —
 * no new backend surface needed. Invoices are filtered client-side by
 * sponsor id because /admin/invoices does not take a sponsor filter today.
 */
export default function SponsorView() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<SponsorDetail | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([
      api.get<SponsorDetail>(`/admin/sponsors/${id}`),
      api.get<Invoice[]>('/admin/invoices'),
    ])
      .then(([d, i]) => {
        if (cancelled) return;
        setDetail(d);
        setInvoices(i.filter((inv) => inv.sponsorId === id));
      })
      .catch((e: unknown) => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [id]);

  if (error) {
    return (
      <div className="wrap">
        <Link to={`/sponsors/${id}`} className="link">← Back to admin view</Link>
        <div className="note note-error" style={{ marginTop: 16 }}>{error}</div>
      </div>
    );
  }
  if (!detail || !invoices) return <div className="wrap"><p>Loading…</p></div>;

  const s = detail.sponsor;
  const openInvoice = invoices.find((i) => i.status === 'issued' || i.status === 'processing');
  const recent = invoices.slice(0, 5);
  const brand = s.brandHex ?? '#0039A6';

  return (
    <div className="wrap">
      <Link to={`/sponsors/${id}`} className="link">← Back to admin view</Link>

      <div
        className="note"
        style={{ marginTop: 12, marginBottom: 20, background: '#FFF8DC', borderColor: '#14110D' }}
      >
        <strong>Read-only preview.</strong> This is what {s.name} sees on their
        dashboard. Nothing you click here changes anything — buttons are
        disabled.
      </div>

      <header
        className="page-head"
        style={{ borderLeft: `6px solid ${brand}`, paddingLeft: 16 }}
      >
        <span className="eyebrow">Sponsor dashboard</span>
        <h1>{s.name}</h1>
        <p className="page-sub">Their tier: {s.tierName ?? 'No tier assigned'}</p>
      </header>

      {openInvoice && (
        <section
          className="card"
          style={{
            background: '#FFF8DC',
            marginTop: 20,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
              {openInvoice.status === 'processing' ? 'Payment in progress' : 'Amount due'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 600 }}>
              {formatMoney(openInvoice.amountCents)}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 13.5 }}>
              {openInvoice.title}
              {openInvoice.dueAt ? ` · due ${formatDate(openInvoice.dueAt)}` : ''}
            </p>
          </div>
          <button className="btn btn-primary" disabled>Pay on Zeffy ↗ (preview)</button>
        </section>
      )}

      <section className="card" style={{ marginTop: 20 }}>
        <div className="card-head">
          <span className="card-title">Recent invoices</span>
        </div>
        {recent.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>
            No invoices yet. When you issue their first invoice it will show up here.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Issued</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.title}</td>
                  <td className="muted">{formatDate(inv.issuedAt)}</td>
                  <td><StatusPill status={displayStatus(inv)} /></td>
                  <td className="num">{formatMoney(inv.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="hint" style={{ marginTop: 16 }}>
        The sponsor portal renders this in their own brand colour, with their logo
        on the header if one is uploaded, and a full "your sponsorship" card with
        tier benefits. This preview is the essentials only.
      </p>
    </div>
  );
}
