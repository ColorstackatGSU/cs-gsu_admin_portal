import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { displayStatus, formatDate, formatMoney } from '../lib/format';
import StatusPill from '../components/StatusPill';
import { errorMessage, type Invoice, type SponsorDetail } from '../lib/admin';

/**
 * Full read-only preview of what a sponsor sees, plus what an officer needs
 * to answer "what's this sponsor's whole picture?" in one place. No
 * impersonation, no session juggling, no button that could mutate anything
 * as the sponsor — every action is disabled.
 *
 * Renders:
 *   - Brand-accented header with sponsor name + tier + status
 *   - "Your sponsorship" card with tier price and benefits (from /tiers)
 *   - Outstanding invoice callout, if any
 *   - Every invoice ever raised for this sponsor
 *   - Every contact on the sponsor with role + activation state
 *
 * Pulls from existing admin endpoints plus /tiers (any signed-in caller can
 * read it), so no new backend surface is needed.
 */

type ApiTier = {
  id: string;
  name: string;
  amountCents: number;
  benefits: string[];
  sortOrder: number;
};

export default function SponsorView() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<SponsorDetail | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [tiers, setTiers] = useState<ApiTier[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([
      api.get<SponsorDetail>(`/admin/sponsors/${id}`),
      api.get<Invoice[]>('/admin/invoices'),
      api.get<ApiTier[]>('/tiers'),
    ])
      .then(([d, i, t]) => {
        if (cancelled) return;
        setDetail(d);
        setInvoices(i.filter((inv) => inv.sponsorId === id));
        setTiers(t);
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
  if (!detail || !invoices || !tiers) return <div className="wrap"><p>Loading…</p></div>;

  const s = detail.sponsor;
  const openInvoice = invoices.find((i) => i.status === 'issued' || i.status === 'processing');
  const tier = s.tierName ? tiers.find((t) => t.name === s.tierName) : undefined;
  const brand = s.brandHex ?? '#0039A6';

  return (
    <div className="wrap">
      <Link to={`/sponsors/${id}`} className="link">← Back to admin view</Link>

      <div
        className="note"
        style={{ marginTop: 12, marginBottom: 20, background: '#FFF8DC', borderColor: '#14110D' }}
      >
        <strong>Read-only preview.</strong> This is everything {s.name} sees on their
        dashboard, plus the contacts on file. Every button is disabled.
      </div>

      <header
        className="page-head"
        style={{ borderLeft: `6px solid ${brand}`, paddingLeft: 16 }}
      >
        <span className="eyebrow">Sponsor dashboard</span>
        <h1>{s.name}</h1>
        <p className="page-sub">
          Tier: {s.tierName ?? 'No tier assigned'} · Status: {s.status}
          {s.websiteUrl ? ' · ' : ''}
          {s.websiteUrl && (
            <a href={s.websiteUrl} target="_blank" rel="noopener noreferrer" className="link">
              {s.websiteUrl.replace(/^https?:\/\//, '')} ↗
            </a>
          )}
        </p>
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

      <div className="dash-grid" style={{ marginTop: 20 }}>
        <section className="card">
          <div className="card-head">
            <span className="card-title">Your sponsorship</span>
          </div>
          {tier ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20, fontWeight: 600 }}>{tier.name}</span>
                <span className="muted" style={{ fontSize: 14 }}>
                  {formatMoney(tier.amountCents)} per year
                </span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0' }}>
                {tier.benefits.map((b) => (
                  <li
                    key={b}
                    style={{ display: 'flex', gap: 8, padding: '6px 0', fontSize: 14 }}
                  >
                    <span aria-hidden="true" style={{ color: brand }}>•</span>
                    {b}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted" style={{ fontSize: 14 }}>
              No tier assigned yet. Assign one from the admin view.
            </p>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <span className="card-title">Contacts on file</span>
            <span className="muted" style={{ fontSize: 13 }}>
              {detail.contacts.length}
            </span>
          </div>
          {detail.contacts.length === 0 ? (
            <p className="muted" style={{ fontSize: 14 }}>
              No contacts yet. Add one from the admin view so someone can sign in.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {detail.contacts.map((c, i) => (
                <li
                  key={c.id}
                  style={{
                    padding: '10px 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--line, #e5e7eb)',
                    fontSize: 14,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong>{c.fullName || c.email}</strong>
                    <span className="muted" style={{ fontSize: 12.5, textTransform: 'capitalize' }}>
                      {c.role}
                    </span>
                    {c.activated ? (
                      <span className="muted" style={{ fontSize: 12.5 }}>· ✓ signed in</span>
                    ) : (
                      <span className="muted" style={{ fontSize: 12.5 }}>· invited, not yet signed in</span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                    {c.email}{c.title ? ` · ${c.title}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="card-head">
          <span className="card-title">All invoices</span>
          <span className="muted" style={{ fontSize: 13 }}>
            {invoices.length}
          </span>
        </div>
        {invoices.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>
            No invoices yet. When you issue their first invoice it will show up here.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Tier</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Paid</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.title}</td>
                  <td className="muted">{inv.tierName ?? '—'}</td>
                  <td className="muted">{formatDate(inv.issuedAt) || '—'}</td>
                  <td className="muted">{formatDate(inv.dueAt) || '—'}</td>
                  <td className="muted">{formatDate(inv.paidAt) || '—'}</td>
                  <td><StatusPill status={displayStatus(inv)} /></td>
                  <td className="num">{formatMoney(inv.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="hint" style={{ marginTop: 16 }}>
        In the actual sponsor portal, the header carries their uploaded logo (if any) and the whole
        page recolours around their brand hex. Contacts is admin-only info — sponsors do not
        see their teammates' rows here.
      </p>
    </div>
  );
}
