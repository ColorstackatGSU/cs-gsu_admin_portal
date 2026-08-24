import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { errorMessage, type Invoice, type Unmatched } from '../lib/admin';
import { formatDate, formatMoney } from '../lib/format';
import { refreshUnmatched } from '../hooks/useUnmatchedCount';
import { Empty, ErrorNote, Loading, OkNote } from '../components/Form';

/**
 * Money that arrived through Zeffy which the webhook could not tie to an
 * invoice, usually because the sponsor paid against something we never linked
 * or paid a different amount than we billed.
 *
 * What this page had to fix:
 *
 *   - It offered every draft invoice in the dropdown, but the backend refuses
 *     any link where the invoice amount is not exactly the payment amount. So
 *     most choices were traps that returned "Payment and invoice amounts do not
 *     match." after the click. Drafts that can actually take the payment are
 *     now listed first; the rest are shown disabled with their amount, so you
 *     can see why they are not available instead of guessing.
 *   - Dismiss ran instantly with no confirmation, and dismissing is not
 *     reversible from this UI — the row is marked resolved and never comes
 *     back. It asks now.
 *   - Dismiss also always *looked* like it failed: the endpoint returns 200
 *     with an empty body and the api client called res.json() on it. Fixed in
 *     lib/api.ts.
 *   - Nothing explained what an unmatched payment is or what linking does. It
 *     does three things at once (fills in the Zeffy id, issues the invoice,
 *     marks it paid), which is worth saying before someone clicks it.
 *   - Every row shared one dropdown-state object and one error, so a failure on
 *     one payment lit up the whole page. Each row now owns its own state.
 */
export default function UnmatchedPayments() {
  const [rows, setRows] = useState<Unmatched[] | null>(null);
  const [drafts, setDrafts] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /** One fetch, no state: the queue plus the drafts a payment could be linked
   *  to. Applied differently by the first load and by a post-action refresh. */
  const fetchAll = () =>
    Promise.all([
      api.get<Unmatched[]>('/admin/unmatched-payments'),
      api.get<Invoice[]>('/admin/invoices?status=draft'),
    ]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then(([r, d]) => {
        if (cancelled) return;
        setRows(r);
        setDrafts(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const [r, d] = await fetchAll();
      setRows(r);
      setDrafts(d);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
    // Keep the sidebar badge honest after every resolution.
    void refreshUnmatched();
  }, []);

  const loading = rows === null;

  return (
    <div className="wrap">
      <header className="page-head">
        <div className="page-head-row">
          <div>
            <span className="eyebrow eyebrow-coral">Reconciliation</span>
            <h1>Unmatched payments</h1>
            <p className="page-sub">
              Payments Zeffy told us about that we could not tie to an invoice
              automatically. Until one is resolved, the money is in the bank but the
              invoice it belongs to still reads as unpaid.
            </p>
          </div>
        </div>
      </header>

      <ErrorNote message={error} />
      <OkNote message={done} />

      <div className="note note-info" style={{ marginBottom: 22 }}>
        <strong>Linking does three things at once:</strong> it writes the Zeffy payment id
        onto the draft invoice, issues that invoice, and records the payment against it.
        The invoice has to be a draft and its amount has to match the payment exactly —
        that is a backend rule, not a UI one. <strong>Dismissing</strong> marks the payment
        resolved without touching any invoice, and cannot be undone from here.
      </div>

      <section className="card card-flush card-coral">
        <div className="card-head">
          <span className="card-title">
            Waiting · {loading ? '—' : (rows ?? []).length}
          </span>
          <Link className="btn btn-secondary btn-sm" to="/invoices?status=draft">
            View draft invoices
          </Link>
        </div>

        {loading ? (
          <Loading what="payments" />
        ) : (rows ?? []).length === 0 ? (
          <Empty
            title="Everything is reconciled"
            body="Every Zeffy payment we know about is tied to an invoice. New ones land here on their own when the webhook cannot work out where they belong."
          />
        ) : (
          <div>
            {(rows ?? []).map((p) => (
              <PaymentRow
                key={p.id}
                payment={p}
                drafts={drafts}
                onResolved={async (message) => {
                  setDone(message);
                  await reload();
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PaymentRow({
  payment,
  drafts,
  onResolved,
}: {
  payment: Unmatched;
  drafts: Invoice[];
  onResolved: (message: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState<'link' | 'dismiss' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The backend compares amounts exactly, so split the drafts by whether they
  // can take this payment at all. Showing the rest disabled is more useful than
  // hiding them: "why isn't the Acme draft in this list" is answered on screen.
  const matching = drafts.filter((d) => d.amountCents === payment.amountCents);
  const other = drafts.filter((d) => d.amountCents !== payment.amountCents);

  async function link() {
    if (!choice || busy) return;
    setError(null);
    setBusy('link');
    try {
      const invoice = await api.post<Invoice>(`/admin/unmatched-payments/${payment.id}/link`, {
        invoiceId: choice,
      });
      await onResolved(`Linked ${formatMoney(payment.amountCents)} to ${invoice.title}.`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  async function dismiss() {
    if (busy) return;
    const who = payment.buyerCompany || payment.buyerEmail || 'this payer';
    if (
      !window.confirm(
        `Dismiss the ${formatMoney(payment.amountCents)} payment from ${who}? ` +
          'It disappears from this queue for good and no invoice is touched. ' +
          'Only do this for duplicates, test payments, or money that is not sponsorship.',
      )
    ) {
      return;
    }
    setError(null);
    setBusy('dismiss');
    try {
      await api.post(`/admin/unmatched-payments/${payment.id}/dismiss`);
      await onResolved(`Dismissed the ${formatMoney(payment.amountCents)} payment.`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  const selectId = `link-${payment.id}`;

  return (
    <div className="unmatched">
      <div>
        <p className="unmatched-amount">{formatMoney(payment.amountCents)}</p>
        <p className="unmatched-who">
          {payment.buyerCompany || payment.buyerEmail || 'Unknown payer'}
        </p>
        {payment.buyerCompany && payment.buyerEmail && (
          <p className="unmatched-meta">{payment.buyerEmail}</p>
        )}
        <p className="unmatched-meta">
          Received {formatDate(payment.receivedAt)}
          {payment.currency && payment.currency.toUpperCase() !== 'USD'
            ? ` · ${payment.currency.toUpperCase()}`
            : ''}
        </p>
        <p className="unmatched-meta">Zeffy payment {payment.zeffyPaymentId}</p>
      </div>

      <div>
        {error && (
          <div className="note note-error" style={{ marginBottom: 12 }} role="alert">
            {error}
          </div>
        )}

        <label className="label" htmlFor={selectId}>
          Link to a draft invoice
        </label>
        <select
          id={selectId}
          className="input"
          value={choice}
          disabled={busy !== null || matching.length === 0}
          onChange={(e) => setChoice(e.target.value)}
        >
          <option value="">
            {matching.length === 0
              ? 'No draft matches this amount'
              : `Choose one of ${matching.length}`}
          </option>
          {matching.map((i) => (
            <option key={i.id} value={i.id}>
              {i.sponsorName} — {i.title}
            </option>
          ))}
          {other.length > 0 && (
            <optgroup label="Different amount — cannot be linked">
              {other.map((i) => (
                <option key={i.id} value={i.id} disabled>
                  {i.sponsorName} — {i.title} ({formatMoney(i.amountCents)})
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {matching.length === 0 && (
          <p className="hint">
            Nothing to link this to. Either{' '}
            <Link className="link" to="/invoices/new">
              raise a draft
            </Link>{' '}
            for exactly {formatMoney(payment.amountCents)}, or dismiss the payment if it is
            not sponsorship money.
          </p>
        )}

        <div className="unmatched-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!choice || busy !== null}
            onClick={link}
          >
            {busy === 'link' ? 'Linking…' : 'Link payment'}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy !== null}
            onClick={dismiss}
          >
            {busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
          </button>
        </div>
      </div>
    </div>
  );
}
