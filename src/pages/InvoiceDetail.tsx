import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { errorMessage, type Invoice } from '../lib/admin';
import {
  daysUntil,
  displayStatus,
  formatDate,
  formatMoney,
  statusHelp,
  zeffyInvoiceUrl,
} from '../lib/format';
import StatusPill from '../components/StatusPill';
import { ErrorNote, OkNote } from '../components/Form';

/**
 * One invoice, and the two things an officer can do to it.
 *
 * What this page had to fix:
 *
 *   - The pill showed the stored status, so an invoice two weeks past its due
 *     date read "Awaiting payment" here and "Overdue" on the list it was
 *     clicked from. Both now use displayStatus().
 *   - "Issue invoice" was offered on drafts with no Zeffy id, which the
 *     database refuses (invoices carrying any status other than draft or void
 *     must have a zeffy_invoice_id). The click returned a 409 that read like a
 *     bug. Issue is now disabled in that case, with the reason next to it.
 *   - "Void invoice" fired immediately, on any invoice including a paid one,
 *     with no confirmation and no undo. It now asks, and asks harder when the
 *     invoice has been paid.
 *   - Neither action showed a pending state, so a slow request looked like
 *     nothing had happened and invited a second click.
 *   - There was nothing on the page saying what the current status means or
 *     what happens next, which is most of what someone opening an invoice
 *     wants to know.
 *
 * There is deliberately no edit form: the admin API exposes create, issue and
 * void, and nothing else. Getting the amount or the tier wrong means voiding
 * and raising a new one, which is also the honest accounting answer.
 */
export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<'issue' | 'void' | null>(null);

  useEffect(() => {
    api
      .get<Invoice>(`/admin/invoices/${id}`)
      .then(setInvoice)
      .catch((e) => {
        if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 404) {
          setNotFound(true);
          return;
        }
        setError(errorMessage(e));
      });
  }, [id]);

  async function issue() {
    if (busy) return;
    setError(null);
    setDone(null);
    setBusy('issue');
    try {
      const next = await api.post<Invoice>(`/admin/invoices/${id}/issue`);
      setInvoice(next);
      setDone('Issued. The sponsor can see it in their portal and pay it on Zeffy.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function voidInvoice() {
    if (busy || !invoice) return;
    const paid = invoice.status === 'paid' || invoice.status === 'processing';
    const question = paid
      ? `This invoice is marked ${invoice.status}. Voiding it does not refund anything — it only stops us counting it. Void ${invoice.title}?`
      : `Void ${invoice.title}? It stops being payable and cannot be un-voided. Raise a new invoice if you need to correct it.`;
    if (!window.confirm(question)) return;

    setError(null);
    setDone(null);
    setBusy('void');
    try {
      const next = await api.post<Invoice>(`/admin/invoices/${id}/void`);
      setInvoice(next);
      setDone('Voided. It is no longer payable.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (notFound) {
    return (
      <div className="wrap-narrow" style={{ textAlign: 'center', paddingTop: 32 }}>
        <h1>Invoice not found</h1>
        <p className="page-sub" style={{ margin: '14px auto 22px' }}>
          There is no invoice with that id.
        </p>
        <Link to="/invoices" className="btn btn-secondary">
          Back to invoices
        </Link>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="wrap">
        <ErrorNote message={error} />
        {!error && (
          <p className="page-sub" style={{ marginTop: 0 }} role="status">
            Loading invoice…
          </p>
        )}
      </div>
    );
  }

  const status = displayStatus(invoice);
  const days = daysUntil(invoice.dueAt);
  const late = status === 'overdue';
  const canIssue = invoice.status === 'draft' && Boolean(invoice.zeffyInvoiceId);
  const blockedFromIssuing = invoice.status === 'draft' && !invoice.zeffyInvoiceId;

  return (
    <div className="wrap">
      <Link to="/invoices" className="backlink">
        ← All invoices
      </Link>

      <header className="detail-head">
        <div>
          <h1>{invoice.title}</h1>
          <div className="detail-meta">
            <StatusPill status={status} />
            <Link className="link" to={`/sponsors/${invoice.sponsorId}`}>
              {invoice.sponsorName}
            </Link>
            {invoice.dueAt && invoice.status === 'issued' && (
              <span className={late ? 'detail-date detail-date-late' : 'detail-date'}>
                {late ? 'Was due' : 'Due'} {formatDate(invoice.dueAt)}
                {!late && days !== null && days <= 30 && ` (${days} days)`}
              </span>
            )}
          </div>
        </div>

        <div className="detail-actions">
          {invoice.zeffyInvoiceId && (
            <a
              className="btn btn-secondary"
              href={zeffyInvoiceUrl(invoice.zeffyInvoiceId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Zeffy ↗
            </a>
          )}
          {invoice.status === 'draft' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={issue}
              disabled={!canIssue || busy !== null}
              title={
                blockedFromIssuing ? 'Add a Zeffy invoice UUID before issuing.' : undefined
              }
            >
              {busy === 'issue' ? 'Issuing…' : 'Issue invoice'}
            </button>
          )}
          {invoice.status !== 'void' && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={voidInvoice}
              disabled={busy !== null}
            >
              {busy === 'void' ? 'Voiding…' : 'Void invoice'}
            </button>
          )}
        </div>
      </header>

      <ErrorNote message={error} />
      <OkNote message={done} />

      {/* What this status means, in one line. The single most common question
          about an invoice is "so what happens now?" */}
      <div
        className={
          late ? 'note note-error' : status === 'paid' ? 'note note-ok' : 'note note-info'
        }
        style={{ marginBottom: 22 }}
      >
        <strong>{statusHelp(status)}</strong>
      </div>

      {blockedFromIssuing && (
        <div className="note note-warn" style={{ marginBottom: 22 }}>
          This draft has no Zeffy invoice UUID, so it cannot be issued: an invoice that
          leaves draft has to point at something the sponsor can actually pay. Either
          create the invoice on Zeffy and raise a new draft carrying its UUID, or wait for
          the payment to arrive and link it from{' '}
          <Link className="link" to="/unmatched">
            unmatched payments
          </Link>
          , which fills the UUID in and issues the invoice in one step.
        </div>
      )}

      <section className="card card-flush" style={{ marginBottom: 22 }}>
        <div className="summary-grid">
          <div>
            <p className="summary-key">Amount</p>
            <p className="summary-val summary-val-big">{formatMoney(invoice.amountCents)}</p>
          </div>
          <div>
            <p className="summary-key">Tier</p>
            <p className="summary-val">{invoice.tierName ?? '—'}</p>
          </div>
          <div>
            <p className="summary-key">Issued</p>
            <p className="summary-val num" style={{ fontSize: 17 }}>
              {formatDate(invoice.issuedAt) || 'Not issued'}
            </p>
          </div>
          <div>
            <p className="summary-key">Paid</p>
            <p className="summary-val num" style={{ fontSize: 17 }}>
              {formatDate(invoice.paidAt) || 'Not paid'}
            </p>
          </div>
        </div>
      </section>

      <section className="card card-flush">
        <div className="card-head">
          <span className="card-title">Reference</span>
        </div>
        <div className="card-pad">
          <p className="meta-key">Billed to</p>
          <p className="meta-val">
            <Link className="link" to={`/sponsors/${invoice.sponsorId}`}>
              {invoice.sponsorName}
            </Link>
          </p>

          <p className="meta-key">Due date</p>
          <p className="meta-val num">{formatDate(invoice.dueAt) || 'None set'}</p>

          <p className="meta-key">Zeffy invoice</p>
          <p className="meta-val num" style={{ wordBreak: 'break-all' }}>
            {invoice.zeffyInvoiceId ?? 'Not linked'}
          </p>

          <p className="hint">
            Zeffy owns the invoice document and the payment page. This record is what we
            hold internally and what the sponsor sees in their portal. Amounts and tiers
            cannot be edited after creation — void and raise a new one instead.
          </p>
        </div>
      </section>
    </div>
  );
}
