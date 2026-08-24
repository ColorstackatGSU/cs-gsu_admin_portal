import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import {
  errorMessage,
  invoiceBody,
  type Invoice,
  type Sponsor,
  type Tier,
} from '../lib/admin';
import { dateInputIn, formatMoney, todayInput } from '../lib/format';
import { ErrorNote, Field, Select } from '../components/Form';

/**
 * Raise a draft invoice.
 *
 * What this page had to fix:
 *
 *   - Every field was marked required by the shared Field component's default,
 *     including the ones the backend treats as optional, while the two the
 *     backend actually insists on (sponsorId, tierId) were plain selects that
 *     happily submitted empty and came back as a 400 naming a Java field. The
 *     form now enforces exactly what InvoiceBody enforces, before submitting.
 *   - Nothing said where the amount comes from. It is not typed: the backend
 *     reads it off the chosen tier, and refuses a tier that is not active. The
 *     amount is now shown as soon as a tier is picked, in the same place the
 *     total will land.
 *   - Nothing said what a Zeffy invoice UUID is, or that an invoice cannot be
 *     issued without one. Both are said next to the field.
 *   - Submitting twice on a slow connection created two invoices.
 *
 * ?sponsor=<id> prefills the sponsor, so "New invoice" from a sponsor page can
 * land here with the answer already filled in.
 */
export default function InvoiceNew() {
  const nav = useNavigate();
  const [search] = useSearchParams();

  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Two of the five values on this form are only sometimes typed:
   *
   *   tier   defaults to whatever tier the chosen sponsor already has
   *   title  defaults to "Sponsor — Tier year"
   *
   * Both are held as null-until-typed overrides rather than being written into
   * state by an effect. Derived is the honest description of what they are, it
   * cannot fall out of sync, and it means choosing a different sponsor cannot
   * silently keep the previous sponsor's tier or title.
   */
  const [sponsorId, setSponsorId] = useState(search.get('sponsor') ?? '');
  const [tierOverride, setTierOverride] = useState<string | null>(null);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [zeffyInvoiceId, setZeffyInvoiceId] = useState('');
  const [dueAt, setDueAt] = useState(dateInputIn(30));

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get<Sponsor[]>('/admin/sponsors'), api.get<Tier[]>('/admin/tiers')])
      .then(([s, t]) => {
        if (cancelled) return;
        setSponsors(s);
        setTiers(t);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(errorMessage(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sponsor = sponsors.find((s) => s.id === sponsorId);
  const tierId = tierOverride ?? sponsor?.tierId ?? '';
  const tier = tiers.find((t) => t.id === tierId);

  const suggestedTitle = useMemo(() => {
    if (!sponsor) return '';
    const year = new Date().getFullYear();
    return tier ? `${sponsor.name} — ${tier.name} ${year}` : `${sponsor.name} sponsorship ${year}`;
  }, [sponsor, tier]);

  const title = titleOverride ?? suggestedTitle;

  const form = { sponsorId, tierId, zeffyInvoiceId, title, dueAt };
  const canSubmit = Boolean(sponsorId) && Boolean(tierId) && title.trim() !== '' && !submitting;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.post<Invoice>('/admin/invoices', invoiceBody(form));
      nav(`/invoices/${created.id}`, { replace: true });
    } catch (x) {
      setError(errorMessage(x));
      setSubmitting(false);
    }
  }

  const sponsorsWithoutTier = sponsors.filter((s) => !s.tierId).length;

  return (
    <div className="wrap">
      <Link to="/invoices" className="backlink">
        ← All invoices
      </Link>

      <header className="page-head" style={{ marginTop: 16 }}>
        <span className="eyebrow eyebrow-sky">Billing</span>
        <h1>New invoice</h1>
        <p className="page-sub">
          This creates a <strong>draft</strong>. Nothing is emailed and the sponsor sees
          nothing until you open the invoice and issue it.
        </p>
      </header>

      <ErrorNote message={error} />

      <form className="card card-flush card-sky" onSubmit={submit} noValidate>
        <div className="card-head">
          <span className="card-title">Invoice details</span>
        </div>

        <div className="card-pad form-grid">
          <Select
            label="Sponsor"
            value={sponsorId}
            required
            disabled={loading}
            hint={
              sponsorsWithoutTier > 0
                ? `${sponsorsWithoutTier} sponsor${sponsorsWithoutTier === 1 ? ' has' : 's have'} no tier on file. You can still bill them by choosing a tier below.`
                : undefined
            }
            onChange={(next) => {
              setSponsorId(next);
              // Drop any tier and title the previous sponsor implied.
              setTierOverride(null);
              setTitleOverride(null);
            }}
          >
            <option value="">{loading ? 'Loading sponsors…' : 'Choose a sponsor'}</option>
            {sponsors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.tierName ? ` (${s.tierName})` : ''}
              </option>
            ))}
          </Select>

          <Select
            label="Tier"
            value={tierId}
            required
            disabled={loading}
            hint="Sets the amount. The backend reads it off the tier, so there is no amount field to type."
            onChange={setTierOverride}
          >
            <option value="">{loading ? 'Loading tiers…' : 'Choose a tier'}</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {formatMoney(t.amountCents)}
              </option>
            ))}
          </Select>

          <Field
            label="Title"
            value={title}
            required
            wide
            placeholder="Acme — Gold sponsorship 2026"
            hint="What the sponsor sees at the top of the invoice in their portal."
            onChange={setTitleOverride}
          />

          <Field
            label="Zeffy invoice UUID"
            value={zeffyInvoiceId}
            mono
            placeholder="0f9c1e2a-…"
            hint="The id from the invoice's URL on Zeffy. Optional now, but required before this invoice can be issued — leave it blank if you plan to reconcile it from an unmatched payment instead."
            onChange={setZeffyInvoiceId}
          />

          <Field
            label="Due date"
            type="date"
            value={dueAt}
            min={todayInput()}
            hint="Defaults to 30 days out. An issued invoice past this date shows as overdue."
            onChange={setDueAt}
          />

          <div className="form-actions">
            <span className="form-actions-total">
              <span className="card-title">Amount</span>
              <span className="num">{tier ? formatMoney(tier.amountCents) : '—'}</span>
            </span>
            <Link className="btn btn-secondary" to="/invoices">
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {submitting ? 'Creating…' : 'Create draft'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
