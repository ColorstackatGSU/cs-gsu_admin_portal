import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import {
  contactBody,
  errorMessage,
  hexError,
  slugError,
  sponsorBody,
  websiteError,
  type Contact,
  type ContactRole,
  type Invoice,
  type SponsorDetail as Detail,
  type SponsorStatus,
  type Tier,
} from '../lib/admin';
import { ROLE_HELP, displayStatus, formatDate, formatMoney } from '../lib/format';
import StatusPill, { ContactPill, SponsorPill } from '../components/StatusPill';
import { Empty, ErrorNote, Field, OkNote, Select } from '../components/Form';

/**
 * Everything about one sponsor: their record, their logo, the people who can
 * sign in on their behalf, and their invoices.
 *
 * What this page had to fix:
 *
 *   - The sponsor form wrote straight into the loaded object, so the Save
 *     button was live from the moment the page rendered and there was no way to
 *     tell whether anything had changed or whether a save had worked. It now
 *     tracks a draft against the server copy, disables Save until something is
 *     actually different, and confirms afterwards.
 *   - It PATCHed the whole Sponsor object back, id and tierName included, at a
 *     body with no fields for either. It now sends exactly SponsorBody.
 *   - Contact rows were bare inputs in a card with a Save button that gave no
 *     sign of having done anything, and the role picker never said what a role
 *     meant. Each row now has its own dirty state, its own saving state, its
 *     own confirmation, and a Revert.
 *   - The logo control said "Saved." and left it there forever, and clearing
 *     the logo silently no-oped in the UI. Both now report what happened, and
 *     the section says where the logo actually shows up.
 *   - Invoices for this sponsor were nowhere on the page, so answering "what
 *     have we billed them?" meant going to /invoices and scanning. They are
 *     listed at the bottom.
 */
export default function SponsorDetail() {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<Detail | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const fetchAll = useCallback(
    () =>
      Promise.all([api.get<Detail>(`/admin/sponsors/${id}`), api.get<Tier[]>('/admin/tiers')]),
    [id],
  );

  function apply(d: Detail, t: Tier[]) {
    setData(d);
    setTiers(t);
    setNotFound(false);
  }

  function applyError(e: unknown) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 404) {
      setNotFound(true);
      return;
    }
    setError(errorMessage(e));
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchAll()
      .then(([d, t]) => {
        if (!cancelled) apply(d, t);
      })
      .catch((e: unknown) => {
        if (!cancelled) applyError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [id, fetchAll]);

  /** Re-read after a child has written something. Called from event handlers,
   *  never from an effect. */
  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const [d, t] = await fetchAll();
      apply(d, t);
    } catch (e) {
      applyError(e);
    }
  }, [id, fetchAll]);

  // Invoices are a separate, non-blocking read: the admin API has no
  // per-sponsor invoice endpoint, so we pull the list and filter. If it fails
  // the rest of the page still works, and the section says so rather than
  // pretending the sponsor has never been billed.
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<Invoice[]>('/admin/invoices')
      .then((rows) => {
        if (!cancelled) setInvoices(rows.filter((i) => i.sponsorId === id));
      })
      .catch((e: unknown) => {
        if (!cancelled) setInvoiceError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (notFound) {
    return (
      <div className="wrap-narrow" style={{ textAlign: 'center', paddingTop: 32 }}>
        <h1>Sponsor not found</h1>
        <p className="page-sub" style={{ margin: '14px auto 22px' }}>
          There is no sponsor with that id. It may have been removed.
        </p>
        <Link to="/sponsors" className="btn btn-secondary">
          Back to sponsors
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="wrap">
        <ErrorNote message={error} />
        {!error && (
          <p className="page-sub" style={{ marginTop: 0 }} role="status">
            Loading sponsor…
          </p>
        )}
      </div>
    );
  }

  const s = data.sponsor;

  return (
    <div className="wrap">
      <Link to="/sponsors" className="backlink">
        ← All sponsors
      </Link>

      <header className="detail-head">
        <div>
          <h1>{s.name}</h1>
          <div className="detail-meta">
            <SponsorPill status={s.status} />
            <span className="detail-date">{s.tierName ?? 'No tier assigned'}</span>
            <span className="detail-date faint">{s.slug}</span>
          </div>
        </div>
        <div className="detail-actions">
          {s.websiteUrl && (
            <a
              className="btn btn-secondary"
              href={s.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Website ↗
            </a>
          )}
          <Link className="btn btn-secondary" to={`/sponsors/${s.id}/view`}>
            View as sponsor
          </Link>
          <Link className="btn btn-primary" to={`/invoices/new?sponsor=${s.id}`}>
            New invoice
          </Link>
        </div>
      </header>

      <ErrorNote message={error} />

      <SponsorForm key={sponsorSignature(s)} sponsor={s} tiers={tiers} onSaved={reload} />
      <LogoCard sponsorId={s.id} />
      <ContactsCard detail={data} onChanged={reload} />
      <InvoicesCard
        invoices={invoices}
        error={invoiceError}
        sponsorId={s.id}
        sponsorName={s.name}
      />
    </div>
  );
}


/* ============================================================================
   SPONSOR RECORD
   ==========================================================================*/

function SponsorForm({
  sponsor,
  tiers,
  onSaved,
}: {
  sponsor: Detail['sponsor'];
  tiers: Tier[];
  onSaved: () => Promise<void>;
}) {
  /** The draft is seeded from the server copy and re-seeded whenever the server
   *  copy changes identity, which happens after a successful save. Keeping it
   *  separate is what lets us know whether anything is actually different. */
  const server = {
    name: sponsor.name,
    slug: sponsor.slug,
    brandHex: sponsor.brandHex ?? '',
    tierId: sponsor.tierId ?? '',
    websiteUrl: sponsor.websiteUrl ?? '',
    status: sponsor.status,
  };

  // Seeded once. The parent gives this component a key derived from the server
  // record (see sponsorSignature), so a save that changes the record remounts
  // the form with fresh values rather than syncing them in an effect.
  const [draft, setDraft] = useState(server);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const slugProblem = slugError(draft.slug);
  const hexProblem = hexError(draft.brandHex);
  const siteProblem = websiteError(draft.websiteUrl);
  const dirty = (Object.keys(server) as (keyof typeof server)[]).some(
    (k) => draft[k].trim() !== server[k].trim(),
  );
  const canSave = dirty && !slugProblem && !hexProblem && !siteProblem && draft.name.trim() !== '' && !saving;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await api.patch(`/admin/sponsors/${sponsor.id}`, sponsorBody(draft));
      setSaved(true);
      await onSaved();
    } catch (x) {
      setError(errorMessage(x));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card card-flush card-sky" style={{ marginBottom: 26 }} onSubmit={submit} noValidate>
      <div className="card-head">
        <span className="card-title">Sponsor record</span>
        {dirty && <span className="sticker sticker-flat">Unsaved changes</span>}
      </div>

      <div className="card-pad form-grid">
        {error && (
          <div className="field-wide" style={{ marginBottom: 18 }}>
            <div className="note note-error" role="alert">
              {error}
            </div>
          </div>
        )}
        {saved && !dirty && !error && (
          <div className="field-wide" style={{ marginBottom: 18 }}>
            <div className="note note-ok" role="status">
              Saved. The sponsor sees this the next time they load their portal.
            </div>
          </div>
        )}

        <Field
          label="Company name"
          value={draft.name}
          required
          onChange={(name) => setDraft((d) => ({ ...d, name }))}
        />

        <Field
          label="URL slug"
          value={draft.slug}
          required
          mono
          error={slugProblem}
          hint="Unique internal id. Nothing links to it publicly, so changing it is safe — but it has to stay unique."
          onChange={(slug) => setDraft((d) => ({ ...d, slug }))}
        />

        <Field
          label="Brand colour"
          value={draft.brandHex}
          mono
          placeholder="#0039A6"
          error={hexProblem}
          hint="Tints this sponsor's own portal. Empty falls back to GSU blue."
          onChange={(brandHex) => setDraft((d) => ({ ...d, brandHex }))}
        />

        <Field
          label="Website"
          value={draft.websiteUrl}
          type="url"
          error={siteProblem}
          onChange={(websiteUrl) => setDraft((d) => ({ ...d, websiteUrl }))}
        />

        <Select
          label="Tier"
          value={draft.tierId}
          hint="Drives the amount on new invoices and the benefits the sponsor sees."
          onChange={(tierId) => setDraft((d) => ({ ...d, tierId }))}
        >
          <option value="">No tier</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — {formatMoney(t.amountCents)}
            </option>
          ))}
        </Select>

        <Select
          label="Status"
          value={draft.status}
          required
          onChange={(status) => setDraft((d) => ({ ...d, status: status as SponsorStatus }))}
        >
          <option value="prospective">Prospective — in conversation</option>
          <option value="active">Active — currently sponsoring</option>
          <option value="lapsed">Lapsed — sponsored in the past</option>
        </Select>

        <div className="form-actions">
          {!dirty && <span className="form-actions-note">No changes to save.</span>}
          {dirty && (
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(server)}>
              Discard changes
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            {saving ? 'Saving…' : 'Save sponsor'}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ============================================================================
   LOGO
   ==========================================================================*/

/**
 * The admin API can write a logo and clear it, but has no endpoint that reads
 * one back — the signed URL is minted for the sponsor by /me. So this section
 * cannot show a preview, and says so plainly rather than leaving a blank frame
 * that looks like a failed image.
 */
function LogoCard({ sponsorId }: { sponsorId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      await api.upload(`/admin/sponsors/${sponsorId}/logo`, 'file', file);
      setDone(`Uploaded ${file.name}. It replaces whatever was on file before.`);
    } catch (x) {
      setError(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!window.confirm('Remove this sponsor’s logo? Their portal falls back to no logo.')) {
      return;
    }
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      await api.delete(`/admin/sponsors/${sponsorId}/logo`);
      setDone('Logo removed.');
    } catch (x) {
      setError(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card card-flush card-violet" style={{ marginBottom: 26 }}>
      <div className="card-head">
        <span className="card-title">Logo</span>
        <span className="hint" style={{ margin: 0 }}>
          Shows on their dashboard and welcome screen
        </span>
      </div>
      <div className="card-pad">
        <ErrorNote message={error} />
        <OkNote message={done} />

        <div className="logo-row">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            disabled={busy}
            aria-label="Choose a logo file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              // Reset so choosing the same file twice fires change again.
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={clear}
          >
            Remove logo
          </button>
          {busy && <span className="muted">Working…</span>}
        </div>

        <p className="hint">
          PNG, JPEG, WebP or SVG, 1 MB max. Uploading replaces the current logo
          immediately. There is no preview here: the file is stored privately and
          only the sponsor's own portal mints a URL for it.
        </p>
      </div>
    </section>
  );
}

/* ============================================================================
   CONTACTS
   ==========================================================================*/

function ContactsCard({ detail, onChanged }: { detail: Detail; onChanged: () => Promise<void> }) {
  const sponsorId = detail.sponsor.id;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ email: '', fullName: '', title: '', role: 'viewer' as ContactRole });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const emailOk = /.+@.+\..+/.test(draft.email.trim());

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!emailOk || busy) return;
    setError(null);
    setAdded(null);
    setBusy(true);
    try {
      await api.post(`/admin/sponsors/${sponsorId}/contacts`, contactBody(draft));
      const who = draft.email.trim().toLowerCase();
      setDraft({ email: '', fullName: '', title: '', role: 'viewer' });
      setAdding(false);
      setAdded(`${who} can now sign in to the sponsor portal with a six-digit code.`);
      await onChanged();
    } catch (x) {
      setError(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card card-flush card-mint" style={{ marginBottom: 26 }}>
      <div className="card-head">
        <span className="card-title">Contacts · {detail.contacts.length}</span>
        <button
          type="button"
          className={adding ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
          onClick={() => {
            setAdding((v) => !v);
            setAdded(null);
          }}
          aria-expanded={adding}
        >
          {adding ? 'Cancel' : '+ Add contact'}
        </button>
      </div>

      <div className="card-pad" style={{ paddingBottom: 0 }}>
        <ErrorNote message={error} />
        <OkNote message={added} />
        <p className="hint" style={{ marginTop: 0, marginBottom: 18 }}>
          These are the people who can sign in to the sponsor portal as{' '}
          {detail.sponsor.name}. Adding one here is what creates their access — there is
          no separate invite step, and no email goes out until we send them one.{' '}
          {ROLE_HELP}
        </p>
      </div>

      {adding && (
        <form className="card-pad form-grid" style={{ paddingTop: 0 }} onSubmit={add} noValidate>
          <Field
            label="Email"
            type="email"
            value={draft.email}
            required
            autoComplete="off"
            placeholder="jordan@acme.com"
            error={draft.email && !emailOk ? 'That does not look like an email address.' : null}
            onChange={(email) => setDraft((d) => ({ ...d, email }))}
          />
          <Field
            label="Full name"
            value={draft.fullName}
            placeholder="Jordan Rivera"
            onChange={(fullName) => setDraft((d) => ({ ...d, fullName }))}
          />
          <Field
            label="Job title"
            value={draft.title}
            placeholder="Head of University Recruiting"
            onChange={(title) => setDraft((d) => ({ ...d, title }))}
          />
          <Select
            label="Role"
            value={draft.role}
            required
            onChange={(role) => setDraft((d) => ({ ...d, role: role as ContactRole }))}
          >
            <option value="primary">Primary — main relationship contact</option>
            <option value="billing">Billing — receives invoices</option>
            <option value="viewer">Viewer — can sign in and look</option>
          </Select>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!emailOk || busy}>
              {busy ? 'Adding…' : 'Add contact'}
            </button>
          </div>
        </form>
      )}

      {detail.contacts.length === 0 ? (
        <Empty
          title="No contacts yet"
          body="Nobody at this company can sign in to the sponsor portal. Add the person who handles the sponsorship, and the person who pays the invoices if that is somebody else."
        >
          {!adding && (
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              + Add the first contact
            </button>
          )}
        </Empty>
      ) : (
        <div>
          {detail.contacts.map((c) => (
            <ContactRow
              key={contactSignature(c)}
              sponsorId={sponsorId}
              contact={c}
              onSaved={onChanged}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One editable contact. Holds its own draft so a save on one row never picks up
 * half-finished edits from another, and so the Save button can be disabled
 * until this row in particular has changed.
 */
function ContactRow({
  sponsorId,
  contact,
  onSaved,
}: {
  sponsorId: string;
  contact: Contact;
  onSaved: () => Promise<void>;
}) {
  const server = {
    email: contact.email,
    fullName: contact.fullName ?? '',
    title: contact.title ?? '',
    role: contact.role,
  };
  // Keyed by the parent on the server values, so a reload after a save gives
  // this row a fresh draft by remounting instead of by an effect.
  const [draft, setDraft] = useState(server);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = (Object.keys(server) as (keyof typeof server)[]).some(
    (k) => draft[k].trim() !== server[k].trim(),
  );
  const emailOk = /.+@.+\..+/.test(draft.email.trim());

  async function save() {
    if (!dirty || !emailOk || saving) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await api.patch(`/admin/sponsors/${sponsorId}/contacts/${contact.id}`, contactBody(draft));
      setSaved(true);
      await onSaved();
    } catch (x) {
      setError(errorMessage(x));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="contact-row">
      <Field
        label="Email"
        type="email"
        value={draft.email}
        required
        error={draft.email && !emailOk ? 'Not a valid email.' : null}
        onChange={(email) => setDraft((d) => ({ ...d, email }))}
      />
      <Field
        label="Full name"
        value={draft.fullName}
        onChange={(fullName) => setDraft((d) => ({ ...d, fullName }))}
      />
      <Field
        label="Job title"
        value={draft.title}
        onChange={(title) => setDraft((d) => ({ ...d, title }))}
      />
      <Select
        label="Role"
        value={draft.role}
        required
        onChange={(role) => setDraft((d) => ({ ...d, role: role as ContactRole }))}
      >
        <option value="primary">Primary</option>
        <option value="billing">Billing</option>
        <option value="viewer">Viewer</option>
      </Select>

      <div className="contact-state">
        <ContactPill activated={contact.activated} />
      </div>

      <div className="contact-save">
        {dirty && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(server)}>
            Revert
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={save}
          disabled={!dirty || !emailOk || saving}
        >
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>

      {error && (
        <div className="contact-note note note-error" role="alert">
          {error}
        </div>
      )}
      {saved && !dirty && !error && (
        <div className="contact-note note note-ok" role="status">
          Saved.
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   INVOICES FOR THIS SPONSOR
   ==========================================================================*/

function InvoicesCard({
  invoices,
  error,
  sponsorId,
  sponsorName,
}: {
  invoices: Invoice[];
  error: string | null;
  sponsorId: string;
  sponsorName: string;
}) {
  return (
    <section className="card card-flush">
      <div className="card-head">
        <span className="card-title">Invoices · {invoices.length}</span>
        <Link className="btn btn-secondary btn-sm" to={`/invoices/new?sponsor=${sponsorId}`}>
          New invoice
        </Link>
      </div>

      {error ? (
        <div className="card-pad">
          <div className="note note-error">Couldn't load invoices: {error}</div>
        </div>
      ) : invoices.length === 0 ? (
        <Empty
          title="Nothing billed yet"
          body={`We have never raised an invoice for ${sponsorName}. New invoices start as drafts and stay invisible to the sponsor until you issue them.`}
        >
          <Link className="btn btn-primary" to={`/invoices/new?sponsor=${sponsorId}`}>
            Raise the first invoice
          </Link>
        </Empty>
      ) : (
        <div className="rows">
          {invoices.map((i) => (
            <Link key={i.id} to={`/invoices/${i.id}`} className="row">
              <span>
                <span className="row-title">{i.title}</span>
                <span className="row-meta num">
                  {i.issuedAt ? `Issued ${formatDate(i.issuedAt)}` : 'Not issued'}
                  {i.dueAt ? ` · due ${formatDate(i.dueAt)}` : ''}
                </span>
              </span>
              <span className="row-right">
                <span className="row-amount num">{formatMoney(i.amountCents)}</span>
                <StatusPill status={displayStatus(i)} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================================
   REMOUNT KEYS
   ============================================================================
   Both editable sections hold a draft seeded from the server copy. Rather than
   pushing the server copy back into that draft from an effect — which fights
   the rule that state should be derived, and can clobber a half-typed edit —
   the parent keys each component on the values it was seeded from. A reload
   that actually changed something produces a new key and a fresh mount; a
   reload that changed nothing leaves the draft, and any unsaved edits, alone.
   ==========================================================================*/

function sponsorSignature(s: Detail['sponsor']): string {
  return [s.id, s.name, s.slug, s.brandHex, s.tierId, s.websiteUrl, s.status].join('|');
}

function contactSignature(c: Contact): string {
  return [c.id, c.email, c.fullName, c.title, c.role, c.activated].join('|');
}
