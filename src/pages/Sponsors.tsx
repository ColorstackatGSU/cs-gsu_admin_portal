import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  errorMessage,
  hexError,
  slugError,
  slugify,
  sponsorBody,
  websiteError,
  type Sponsor,
  type SponsorStatus,
  type Tier,
} from '../lib/admin';
import { formatMoney } from '../lib/format';
import { SponsorPill } from '../components/StatusPill';
import { Empty, ErrorNote, Field, Loading, OkNote, Select } from '../components/Form';

/**
 * Every company we bill, and the way in to everything else about them.
 *
 * What this page had to fix:
 *
 *   - "Add sponsor" toggled a boolean and nothing else. The label never
 *     changed, nothing was announced, and the form opened below the fold, so
 *     the button read as broken. It now says what it will do, carries
 *     aria-expanded, and scrolls the form into view when it opens.
 *   - Table rows navigated to the detail page through a link on the company
 *     name only, with no hover state, no cursor and nothing saying the rest of
 *     the row was clickable. The whole row is now the hit area, with an OPEN
 *     marker in the last cell that inverts on hover. The company name is still
 *     a real link so keyboard and middle-click both work.
 *   - The empty state sat below the create form, so the eye read
 *     add-form-then-nothing. The form is closed by default now, which puts the
 *     empty state directly under the heading where it can say what to do.
 *   - Nothing told anyone that contacts, logos and tier changes live one click
 *     down. The subtitle and the empty state both say so.
 */

const EMPTY_FORM = {
  name: '',
  slug: '',
  brandHex: '',
  tierId: '',
  websiteUrl: '',
  status: 'prospective' as SponsorStatus,
};

type Form = typeof EMPTY_FORM;

export default function Sponsors() {
  const nav = useNavigate();
  const [sponsors, setSponsors] = useState<Sponsor[] | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  // Null until the officer has typed in the slug field themselves. While it is
  // null the slug tracks the company name, which is what anyone wants; once
  // they have edited it we stop overwriting their work.
  const [slugTouched, setSlugTouched] = useState(false);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const formRef = useRef<HTMLFormElement>(null);

  /** One fetch, no state. Both the first load and the refresh after a create go
   *  through it, but they apply the result in their own way — the effect has to
   *  guard against unmounting, the create handler does not. */
  const fetchAll = () =>
    Promise.all([api.get<Sponsor[]>('/admin/sponsors'), api.get<Tier[]>('/admin/tiers')]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then(([s, t]) => {
        if (cancelled) return;
        setSponsors(s);
        setTiers(t);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setSponsors([]);
        setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function reload() {
    try {
      const [s, t] = await fetchAll();
      setSponsors(s);
      setTiers(t);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const slugProblem = form.slug ? slugError(form.slug) : null;
  const hexProblem = hexError(form.brandHex);
  const siteProblem = websiteError(form.websiteUrl);
  const canSubmit =
    form.name.trim().length > 0 && !slugProblem && !hexProblem && !siteProblem && !submitting;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSaved(null);
    setSubmitting(true);
    try {
      const created = await api.post<Sponsor>('/admin/sponsors', sponsorBody(form));
      setForm(EMPTY_FORM);
      setSlugTouched(false);
      setAdding(false);
      setSaved(`${created.name} added. Open it to invite contacts and upload a logo.`);
      await reload();
    } catch (x) {
      setError(errorMessage(x));
    } finally {
      setSubmitting(false);
    }
  }

  function openForm() {
    setAdding(true);
    setSaved(null);
    // Let the form mount before scrolling to it, otherwise the button looks
    // like it did nothing on a short viewport.
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  }

  function closeForm() {
    setAdding(false);
    setForm(EMPTY_FORM);
    setSlugTouched(false);
  }

  const visible = useMemo(() => {
    const rows = sponsors ?? [];
    const q = query.trim().toLowerCase();
    return rows.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.tierName ?? '').toLowerCase().includes(q)
      );
    });
  }, [sponsors, query, statusFilter]);

  const loading = sponsors === null;
  const total = sponsors?.length ?? 0;
  const filtering = Boolean(query.trim() || statusFilter);

  return (
    <div className="wrap">
      <header className="page-head">
        <div className="page-head-row">
          <div>
            <span className="eyebrow">Directory</span>
            <h1>Sponsors</h1>
            <p className="page-sub">
              Every company we bill. Open a sponsor to edit its details, invite the
              people who can sign in to the sponsor portal, and upload their logo.
            </p>
          </div>
          <button
            type="button"
            className={adding ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={adding ? closeForm : openForm}
            aria-expanded={adding}
            aria-controls="new-sponsor"
          >
            {adding ? 'Cancel' : '+ Add sponsor'}
          </button>
        </div>
      </header>

      <ErrorNote message={error} />
      <OkNote message={saved} />

      {adding && (
        <form
          id="new-sponsor"
          ref={formRef}
          className="card card-flush card-yellow"
          style={{ marginBottom: 26 }}
          onSubmit={submit}
          noValidate
        >
          <div className="card-head">
            <span className="card-title">New sponsor</span>
            <span className="hint" style={{ margin: 0 }}>
              Contacts and logo come after this
            </span>
          </div>

          <div className="card-pad form-grid">
            <Field
              label="Company name"
              value={form.name}
              required
              autoComplete="organization"
              placeholder="Acme Corporation"
              onChange={(name) =>
                setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }))
              }
            />

            <Field
              label="URL slug"
              value={form.slug}
              required
              mono
              placeholder="acme-corporation"
              error={slugProblem}
              hint="Short internal id for this company, filled in from the name. Lowercase letters, numbers and dashes. It has to be unique and it is a pain to change later, so leave it alone unless the generated one is wrong."
              onChange={(slug) => {
                setSlugTouched(true);
                setForm((f) => ({ ...f, slug }));
              }}
            />

            <Field
              label="Brand colour"
              value={form.brandHex}
              mono
              placeholder="#0039A6"
              error={hexProblem}
              hint="Six-digit hex. Tints the sponsor's own portal. Leave empty for GSU blue."
              onChange={(brandHex) => setForm((f) => ({ ...f, brandHex }))}
            />

            <Field
              label="Website"
              value={form.websiteUrl}
              type="url"
              placeholder="https://acme.com"
              error={siteProblem}
              onChange={(websiteUrl) => setForm((f) => ({ ...f, websiteUrl }))}
            />

            <Select
              label="Tier"
              value={form.tierId}
              hint="Sets what their sponsorship includes. Can be assigned later."
              onChange={(tierId) => setForm((f) => ({ ...f, tierId }))}
            >
              <option value="">No tier yet</option>
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {formatMoney(t.amountCents)}
                </option>
              ))}
            </Select>

            <Select
              label="Status"
              value={form.status}
              required
              hint="Prospective until they have committed; active once they are paying."
              onChange={(status) => setForm((f) => ({ ...f, status: status as SponsorStatus }))}
            >
              <option value="prospective">Prospective — in conversation</option>
              <option value="active">Active — currently sponsoring</option>
              <option value="lapsed">Lapsed — sponsored in the past</option>
            </Select>

            <div className="form-actions">
              <span className="form-actions-note">
                Adding a company does not email anyone. Invites go out from the
                sponsor's own page.
              </span>
              <button type="button" className="btn btn-secondary" onClick={closeForm}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
                {submitting ? 'Creating…' : 'Create sponsor'}
              </button>
            </div>
          </div>
        </form>
      )}

      {total > 0 && (
        <div className="toolbar">
          <label className="toolbar-label" htmlFor="sponsor-q">
            Find
          </label>
          <input
            id="sponsor-q"
            className="input"
            type="search"
            placeholder="Company, slug or tier"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="toolbar-label" htmlFor="sponsor-status">
            Status
          </label>
          <select
            id="sponsor-status"
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="prospective">Prospective</option>
            <option value="lapsed">Lapsed</option>
          </select>
          <span className="toolbar-count">
            {filtering ? `${visible.length} of ${total}` : `${total} total`}
          </span>
        </div>
      )}

      <section className="card card-flush">
        <div className="card-head">
          <span className="card-title">All sponsors</span>
          <span className="hint" style={{ margin: 0 }}>
            Click a row to manage contacts, tier and logo
          </span>
        </div>

        {loading ? (
          <Loading what="sponsors" />
        ) : total === 0 ? (
          <Empty
            title="No sponsors yet"
            body="Companies you add show up in this table. Start with the one you are closest to closing — you can add their contacts and raise an invoice afterwards."
          >
            <button type="button" className="btn btn-primary" onClick={openForm}>
              + Add the first sponsor
            </button>
          </Empty>
        ) : visible.length === 0 ? (
          <Empty
            title="Nothing matches"
            body="No sponsor matches that search and filter."
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setQuery('');
                setStatusFilter('');
              }}
            >
              Clear filters
            </button>
          </Empty>
        ) : (
          <>
            <div className="table-scroll">
              <table className="table only-wide">
                <thead>
                  <tr>
                    <th scope="col">Company</th>
                    <th scope="col">Tier</th>
                    <th scope="col">Status</th>
                    <th scope="col">Website</th>
                    <th scope="col">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <tr
                      key={s.id}
                      className="row-link"
                      onClick={() => nav(`/sponsors/${s.id}`)}
                      title={`Open ${s.name}`}
                    >
                      <td>
                        <Link
                          className="link"
                          to={`/sponsors/${s.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {s.name}
                        </Link>
                        <div className="faint num" style={{ fontSize: 12 }}>
                          {s.slug}
                        </div>
                      </td>
                      <td className={s.tierName ? undefined : 'faint'}>{s.tierName ?? 'No tier'}</td>
                      <td>
                        <SponsorPill status={s.status} />
                      </td>
                      <td>
                        {s.websiteUrl ? (
                          <a
                            className="link"
                            href={s.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Visit ↗
                          </a>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                      <td>
                        <span className="row-go">Open →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone. A five-column table here either scrolls sideways or
                crushes the company name, which is the column that matters. */}
            <div className="only-narrow rows">
              {visible.map((s) => (
                <Link key={s.id} to={`/sponsors/${s.id}`} className="row">
                  <span>
                    <span className="row-title">{s.name}</span>
                    <span className="row-meta">{s.tierName ?? 'No tier'}</span>
                  </span>
                  <span className="row-right">
                    <SponsorPill status={s.status} />
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
