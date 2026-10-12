import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { errorMessage, type ResumeBookOverview } from '../lib/admin';
import { formatDate } from '../lib/format';
import Confirm from '../components/Confirm';

/**
 * The resume book as a file: a ZIP an officer downloads and hands to one sponsor.
 *
 * The sponsor portal shows the same book to a sponsor who signs in. This is for the ones
 * whose recruiters want files to load into their own system. It holds one PDF per member,
 * named Last_First, and an index.csv with what the privacy policy says sponsors get.
 *
 * Always for a named sponsor, never just "download". A copy that has left cannot be taken
 * back, so each one is recorded against who it was for and who was in it, and the list at
 * the bottom is the answer when a member asks who has their resume.
 *
 * Any sponsor can be chosen. The tier that unlocks the book in the sponsor portal is shown
 * next to the name and repeated in the confirmation, and that is all: an officer handing a
 * copy to somebody below that tier is a decision, not a mistake to prevent.
 *
 * Who goes in it is one of two modes. Everybody, optionally narrowed by graduation year,
 * which is the usual copy. Or picked by hand, for a sponsor who asked for particular
 * people or for a shortlist after an event.
 */
type Mode = 'all' | 'pick';

export default function ResumeBook() {
  const [overview, setOverview] = useState<ResumeBookOverview | null>(null);
  const [sponsorId, setSponsorId] = useState('');
  const [mode, setMode] = useState<Mode>('all');
  /** Empty means everybody, including members with no graduation year on file. */
  const [years, setYears] = useState<number[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
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

  const roster = overview?.roster;
  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!roster || words.length === 0) return roster ?? [];
    return roster.filter((m) => {
      const hay = `${m.name ?? ''} ${m.email} ${m.majors ?? ''} ${m.classYear ?? ''} ${m.gradYear ?? ''}`
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [roster, search]);

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
    mode === 'pick'
      ? picked.size
      : years.length === 0
        ? overview.members
        : known.filter((y) => years.includes(y.gradYear as number)).reduce((n, y) => n + y.members, 0);

  /** Any change to what is in the copy withdraws a confirmation that described the old one. */
  function changed() {
    setDone(null);
    setConfirming(false);
  }

  function toggleYear(year: number) {
    changed();
    setYears((now) => (now.includes(year) ? now.filter((y) => y !== year) : [...now, year].sort()));
  }

  function togglePicked(id: string) {
    changed();
    setPicked((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Adds or removes everybody the search currently shows, and leaves the rest as they were. */
  function setShown(on: boolean) {
    changed();
    setPicked((now) => {
      const next = new Set(now);
      shown.forEach((m) => (on ? next.add(m.id) : next.delete(m.id)));
      return next;
    });
  }

  async function download() {
    if (!sponsor) return;
    setBuilding(true);
    setError(null);
    setDone(null);
    try {
      const zip = await api.blobPost('/admin/resume-book/export', {
        sponsorId: sponsor.id,
        gradYears: mode === 'all' ? years : [],
        memberIds: mode === 'pick' ? [...picked] : [],
      });

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

  const tierNote = sponsor && !sponsor.eligible
    ? `${sponsor.name} is ${sponsor.tierName ? `on ${sponsor.tierName}` : 'not on a tier'}, which does not include the resume book in the sponsor portal.`
    : null;

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Resume book</h1>
      </div>

      {error && <div className="note note-error" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="note" style={{ marginBottom: 18 }}>
        A ZIP for one sponsor: each member's resume as <em>LastName_FirstName.pdf</em>, and an{' '}
        <em>index.csv</em> with name, both email addresses, majors, class year, graduation and
        LinkedIn.
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
            onChange={(e) => { setSponsorId(e.target.value); changed(); }}
          >
            <option value="">Choose who this copy is for</option>
            {overview.sponsors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.tierName ?? 'no tier'})
              </option>
            ))}
          </select>
        </label>
        {tierNote && (
          <p className="hint" style={{ marginTop: -8, marginBottom: 18 }}>
            {tierNote} You can still give them a copy here.
          </p>
        )}

        <div className="field">
          <span className="label">Members</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={mode === 'all'}
              onClick={() => { setMode('all'); changed(); }}
            >
              Everybody
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'pick' ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={mode === 'pick'}
              onClick={() => { setMode('pick'); changed(); }}
            >
              Pick members
            </button>
          </div>
        </div>

        {mode === 'all' && known.length > 0 && (
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

        {mode === 'pick' && (
          <div className="field">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <input
                className="input"
                type="search"
                placeholder="Search by name, email, major or year"
                aria-label="Search members"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: '1 1 260px', maxWidth: 440 }}
              />
              <button type="button" className="btn btn-secondary btn-sm"
                      disabled={shown.length === 0} onClick={() => setShown(true)}>
                Add the {shown.length} shown
              </button>
              <button type="button" className="btn btn-ghost btn-sm"
                      disabled={picked.size === 0}
                      onClick={() => { changed(); setPicked(new Set()); }}>
                Clear
              </button>
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto', border: 'var(--bw) solid var(--ink)' }}>
              {shown.length === 0 ? (
                <p className="muted" style={{ padding: '12px 14px', margin: 0 }}>
                  Nobody with a resume matches that.
                </p>
              ) : (
                shown.map((m) => (
                  <label
                    key={m.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      padding: '9px 14px',
                      borderBottom: '1px solid var(--line)',
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={picked.has(m.id)}
                      onChange={() => togglePicked(m.id)}
                    />
                    <span style={{ flex: '1 1 0', minWidth: 0 }}>
                      <strong>{m.name ?? m.email}</strong>
                      <span className="muted">
                        {' '}
                        {[m.classYear, m.gradYear, m.majors].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
            <p className="hint">
              {picked.size === 0
                ? 'Tick the members to include. Only members with a resume are listed.'
                : `${picked.size} picked. Searching changes what is listed, not who is picked.`}
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
              ...(tierNote ? [`${tierNote} Giving them a copy is your call.`] : []),
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
                  <th>Who</th>
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
                    <td className="muted">
                      {x.handPicked
                        ? 'Picked by hand'
                        : x.gradYears
                          ? `Graduating ${x.gradYears.join(', ')}`
                          : 'Everybody'}
                    </td>
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
