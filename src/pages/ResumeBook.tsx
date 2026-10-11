import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { errorMessage, type ResumeBookOverview } from '../lib/admin';
import { formatDate } from '../lib/format';
import Confirm from '../components/Confirm';

/**
 * The resume book as a file: a ZIP an officer downloads and hands to one sponsor.
 *
 * The sponsor portal shows the same book to a sponsor who signs in. This is for the ones
 * whose recruiters want files to load into their own system. It holds one PDF per member,
 * named Last_First_Year, and an index.csv with what the privacy policy says sponsors get.
 *
 * Always for a named sponsor, never just "download". A copy that has left cannot be taken
 * back, so each one is recorded against who it was for, and the list at the bottom is the
 * answer when a member asks who has their resume.
 */
export default function ResumeBook() {
  const [overview, setOverview] = useState<ResumeBookOverview | null>(null);
  const [sponsorId, setSponsorId] = useState('');
  /** Empty means everybody, including members with no graduation year on file. */
  const [years, setYears] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [building, setBuilding] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<ResumeBookOverview>('/admin/resume-book')
      .then(setOverview)
      .catch((e: unknown) => setError(errorMessage(e)));
  }

  useEffect(load, []);

  if (!overview) {
    return (
      <div className="wrap">
        <div className="page-head">
          <h1>Resume book</h1>
        </div>
        {error ? <div className="note note-error">{error}</div> : <p>Counting resumes…</p>}
      </div>
    );
  }

  const sponsor = overview.sponsors.find((s) => s.id === sponsorId) ?? null;
  const known = overview.gradYears.filter((y) => y.gradYear != null);
  const selected =
    years.length === 0
      ? overview.members
      : known.filter((y) => years.includes(y.gradYear as number)).reduce((n, y) => n + y.members, 0);

  function toggleYear(year: number) {
    setDone(null);
    setYears((now) => (now.includes(year) ? now.filter((y) => y !== year) : [...now, year].sort()));
  }

  async function download() {
    if (!sponsor) return;
    setBuilding(true);
    setError(null);
    setDone(null);
    try {
      const query = new URLSearchParams({ sponsorId: sponsor.id });
      years.forEach((y) => query.append('gradYear', String(y)));
      const zip = await api.blob(`/admin/resume-book/export?${query}`);

      const url = URL.createObjectURL(zip);
      const link = document.createElement('a');
      link.href = url;
      // The date in the name is what tells two copies apart later, on the sponsor's side
      // as much as ours.
      link.download = `colorstack-gsu-resume-book_${sponsor.slug}_${new Date()
        .toLocaleDateString('en-CA')}.zip`;
      link.click();
      URL.revokeObjectURL(url);

      setConfirming(false);
      setDone(`Downloaded the book for ${sponsor.name}. It is in your downloads folder.`);
      // Reload for the new row in the list below, which also says if anybody was left out.
      load();
    } catch (e) {
      setError(errorMessage(e));
      setConfirming(false);
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Resume book</h1>
      </div>

      {error && <div className="note note-error" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="note" style={{ marginBottom: 18 }}>
        A ZIP for one sponsor: every activated member's resume as <em>Last_First_Year.pdf</em>,
        and an <em>index.csv</em> with name, both email addresses, majors, class year,
        graduation and LinkedIn.
      </div>

      <div className="stat-row">
        <Stat label="Resumes in the book" value={overview.members} />
        <Stat label="In this export" value={selected} />
        <Stat label="Emails withheld" value={overview.contactHidden} note="by request" />
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <label className="field" style={{ maxWidth: 440 }}>
          <span className="label">Sponsor</span>
          <select
            className="input"
            value={sponsorId}
            onChange={(e) => { setSponsorId(e.target.value); setDone(null); setConfirming(false); }}
          >
            <option value="">Choose who this copy is for</option>
            {overview.sponsors.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.eligible}>
                {s.name}
                {s.eligible ? '' : ` (${s.tierName ?? 'no tier'}, not included)`}
              </option>
            ))}
          </select>
        </label>
        {overview.sponsors.every((s) => !s.eligible) && (
          <p className="hint" style={{ marginTop: -8 }}>
            No sponsor is on a tier that includes the resume book. Set the sponsor's tier on
            their page first.
          </p>
        )}

        {known.length > 0 && (
          <div className="field">
            <span className="label">
              Graduating <span className="label-opt">Optional</span>
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {known.map((y) => {
                const year = y.gradYear as number;
                const on = years.includes(year);
                return (
                  <button
                    key={year}
                    type="button"
                    className={`btn btn-sm ${on ? 'btn-primary' : 'btn-secondary'}`}
                    aria-pressed={on}
                    onClick={() => toggleYear(year)}
                  >
                    {year} ({y.members})
                  </button>
                );
              })}
            </div>
            <p className="hint">
              {years.length === 0
                ? 'Everybody, including members with no graduation year on file.'
                : `Only members graduating in ${years.join(', ')}.`}
            </p>
          </div>
        )}

        {done && <div className="note note-ok" style={{ marginBottom: 12 }}>{done}</div>}

        {confirming && sponsor ? (
          <Confirm
            question={`Download ${selected} resume${selected === 1 ? '' : 's'} for ${sponsor.name}?`}
            points={[
              'The file has each member’s resume and their student and personal email addresses.',
              'Once you send it, it cannot be recalled. A member who deletes their resume later is still in this copy.',
              `It is recorded below as given to ${sponsor.name}, under your name.`,
              'Send it only to that sponsor’s contacts, and not through a public link.',
            ]}
            confirmLabel="Build and download"
            busy={building}
            busyLabel="Building, this takes a minute…"
            onConfirm={() => void download()}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!sponsor || selected === 0}
            onClick={() => setConfirming(true)}
          >
            Download resume book
          </button>
        )}
      </section>

      <div className="card card-flush">
        <div className="card-head">
          <h2 className="card-title">Copies given out</h2>
        </div>
        {overview.exports.length === 0 ? (
          <p className="muted" style={{ padding: '14px 20px', margin: 0 }}>
            None yet. Every download is listed here.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Sponsor</th>
                  <th>Graduating</th>
                  <th>Resumes</th>
                  <th>Left out</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {overview.exports.map((x) => (
                  <tr key={x.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(x.exportedAt)}</td>
                    <td><strong>{x.sponsorName}</strong></td>
                    <td className="muted">{x.gradYears ? x.gradYears.join(', ') : 'Everybody'}</td>
                    <td>{x.members}</td>
                    <td>{x.skipped > 0 ? x.skipped : <span className="muted">0</span>}</td>
                    <td className="muted">{x.exportedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="muted" style={{ fontSize: 13.5, marginTop: 14 }}>
        Left out means a member whose file could not be read from storage when the copy was
        built. They are missing from that ZIP and its index, so ask them to upload again.
      </p>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {note && <span className="stat-note">{note}</span>}
      </span>
    </div>
  );
}
