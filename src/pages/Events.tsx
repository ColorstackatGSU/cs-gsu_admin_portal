import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/admin';
import {
  EMPTY_EVENT,
  eventBody,
  eventProblems,
  formatWhen,
  formFromEvent,
  isUpcoming,
  type ChapterEvent,
  type EventForm,
} from '../lib/events';
import Confirm from '../components/Confirm';
import { Empty, ErrorNote, Field, Loading, OkNote } from '../components/Form';

/**
 * The events on the member portal, written here instead of in code.
 *
 * Before this screen every event was a block typed into the member portal's source, so
 * posting a flyer took a developer and a deploy, and the order on the page was the order
 * somebody typed them in. Now an officer fills in this form and the member portal reads it,
 * sorted by date: upcoming soonest first, past most recent first.
 *
 * One form does both jobs, new and edit, and the flyer is part of it. An event has to exist
 * before it has a flyer, so on save the record goes first and the image follows.
 */

const FLYER_TYPES = 'image/png,image/jpeg,image/webp';
const FLYER_MAX = 5 * 1024 * 1024;

export default function Events() {
  const [events, setEvents] = useState<ChapterEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  /** Null when the form is closed, 'new' for a new event, otherwise the id being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_EVENT);
  const [flyer, setFlyer] = useState<File | null>(null);
  const [flyerProblem, setFlyerProblem] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Read once per visit. Which side of now an event sits on does not need to tick live.
  const [now] = useState(() => Date.now());

  const [deleting, setDeleting] = useState<ChapterEvent | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteProblem, setDeleteProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ChapterEvent[]>('/admin/events')
      .then((rows) => !cancelled && setEvents(rows))
      .catch((e: unknown) => {
        if (cancelled) return;
        setEvents([]);
        setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function reload() {
    try {
      setEvents(await api.get<ChapterEvent[]>('/admin/events'));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const current = editing && editing !== 'new' ? events?.find((e) => e.id === editing) ?? null : null;

  // A local preview of the chosen file, released when it changes so it does not leak.
  const flyerPreview = useMemo(() => (flyer ? URL.createObjectURL(flyer) : null), [flyer]);
  useEffect(() => () => {
    if (flyerPreview) URL.revokeObjectURL(flyerPreview);
  }, [flyerPreview]);

  const problems = eventProblems(form);
  const canSubmit =
    form.title.trim().length > 0 &&
    form.startsAt !== '' &&
    !problems.endsAt &&
    !problems.linkUrl &&
    !flyerProblem &&
    !submitting;

  function open(e: ChapterEvent | null) {
    setEditing(e ? e.id : 'new');
    setForm(e ? formFromEvent(e) : EMPTY_EVENT);
    setFlyer(null);
    setFlyerProblem(null);
    setSaved(null);
    setError(null);
    window.setTimeout(() => {
      document.getElementById('event-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  function close() {
    setEditing(null);
    setForm(EMPTY_EVENT);
    setFlyer(null);
    setFlyerProblem(null);
  }

  function chooseFlyer(file: File | undefined) {
    if (!file) return;
    if (!FLYER_TYPES.split(',').includes(file.type)) {
      setFlyerProblem('Use a PNG, JPEG or WebP image. Export it from Canva as PNG if unsure.');
      return;
    }
    if (file.size > FLYER_MAX) {
      setFlyerProblem('That image is over 5 MB. Export a smaller version and try again.');
      return;
    }
    setFlyerProblem(null);
    setFlyer(file);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSaved(null);
    setSubmitting(true);
    try {
      const body = eventBody(form);
      const record =
        editing === 'new'
          ? await api.post<ChapterEvent>('/admin/events', body)
          : await api.put<ChapterEvent>(`/admin/events/${editing}`, body);

      if (flyer) {
        try {
          await api.upload<ChapterEvent>(`/admin/events/${record.id}/flyer`, 'file', flyer);
        } catch (x) {
          // The event itself is saved, so say exactly that rather than "failed".
          setError(`${record.title} was saved, but the flyer did not upload: ${errorMessage(x)}`);
          setEditing(record.id);
          setFlyer(null);
          await reload();
          return;
        }
      }

      close();
      setSaved(
        record.published
          ? `${record.title} is saved and showing on the member portal.`
          : `${record.title} is saved as a draft. Members will not see it until you publish it.`,
      );
      await reload();
    } catch (x) {
      setError(errorMessage(x));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeFlyer() {
    if (!current) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.delete(`/admin/events/${current.id}/flyer`);
      setSaved(`Flyer removed from ${current.title}.`);
      await reload();
    } catch (x) {
      setError(errorMessage(x));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteProblem(null);
    try {
      await api.delete(`/admin/events/${deleting.id}`);
      if (editing === deleting.id) close();
      setSaved(`${deleting.title} deleted.`);
      setDeleting(null);
      await reload();
    } catch (x) {
      setDeleteProblem(errorMessage(x));
    } finally {
      setDeleteBusy(false);
    }
  }

  const upcoming = (events ?? [])
    .filter((e) => isUpcoming(e, now))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = (events ?? [])
    .filter((e) => !isUpcoming(e, now))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const shownFlyer = flyerPreview ?? current?.flyerUrl ?? null;

  function renderList(rows: ChapterEvent[]) {
    return (
      <div className="event-admin-list">
        {rows.map((e) => (
          <div key={e.id} className="event-admin-row">
            {e.flyerUrl ? (
              <img className="event-admin-thumb" src={e.flyerUrl} alt="" />
            ) : (
              <span className="event-admin-thumb event-admin-thumb-empty">No flyer</span>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="row-title" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {e.title}
                {!e.published && <span className="pill pill-draft">Draft</span>}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{formatWhen(e)}</div>
              {e.location && <div className="faint" style={{ fontSize: 13 }}>{e.location}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(e)}>
                Edit
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setDeleting(e);
                  setDeleteProblem(null);
                }}
              >
                Delete
              </button>
            </div>
            {deleting?.id === e.id && (
              <Confirm
                style={{ flexBasis: '100%' }}
                question={`Delete ${e.title}?`}
                points={[
                  'It disappears from the member portal straight away.',
                  'This cannot be undone. To hide it for now instead, edit it and untick "Show on the member portal".',
                ]}
                confirmLabel="Delete event"
                busyLabel="Deleting…"
                busy={deleteBusy}
                problem={deleteProblem}
                danger
                onConfirm={() => void confirmDelete()}
                onCancel={() => setDeleting(null)}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="page-head">
        <div className="page-head-row">
          <div>
            <span className="eyebrow">Member portal</span>
            <h1>Events</h1>
            <p className="page-sub">
              Everything members see on the Events page. Add an event, upload its flyer, and it
              shows up for members right away, sorted by date. No code or deploy needed.
            </p>
          </div>
          <button
            type="button"
            className={editing ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={editing ? close : () => open(null)}
            aria-expanded={editing !== null}
            aria-controls="event-form"
          >
            {editing ? 'Cancel' : '+ Add event'}
          </button>
        </div>
      </header>

      <ErrorNote message={error} />
      <OkNote message={saved} />

      {editing && (
        <form
          id="event-form"
          className="card card-flush card-yellow"
          style={{ marginBottom: 26 }}
          onSubmit={submit}
          noValidate
        >
          <div className="card-head">
            <span className="card-title">{editing === 'new' ? 'New event' : `Edit ${current?.title ?? 'event'}`}</span>
            <span className="hint" style={{ margin: 0 }}>Times are Atlanta time</span>
          </div>

          <div className="card-pad form-grid">
            <Field
              label="Event name"
              value={form.title}
              required
              wide
              maxLength={200}
              placeholder="ColorStack x NVIDIA"
              onChange={(title) => setForm((f) => ({ ...f, title }))}
            />

            <Field
              label="Starts"
              type="datetime-local"
              value={form.startsAt}
              required
              hint="The date and time it begins."
              onChange={(startsAt) => setForm((f) => ({ ...f, startsAt }))}
            />

            <Field
              label="Ends"
              type="datetime-local"
              value={form.endsAt}
              error={problems.endsAt}
              hint="Optional, but it keeps the event under Upcoming until it is actually over."
              onChange={(endsAt) => setForm((f) => ({ ...f, endsAt }))}
            />

            <Field
              label="Location"
              value={form.location}
              wide
              placeholder="Classroom South 150"
              onChange={(location) => setForm((f) => ({ ...f, location }))}
            />

            <div className="field field-wide">
              <label className="label" htmlFor="event-description">
                Description<span className="label-opt">Optional</span>
              </label>
              <textarea
                id="event-description"
                className="input"
                rows={3}
                maxLength={1000}
                value={form.description}
                placeholder="One or two sentences on what members get out of coming."
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <Field
              label="Link"
              type="url"
              value={form.linkUrl}
              error={problems.linkUrl}
              placeholder="https://pin.gsu.edu/event/..."
              hint="Where the button sends people: the PIN page, or a registration form."
              onChange={(linkUrl) => setForm((f) => ({ ...f, linkUrl }))}
            />

            <Field
              label="Button text"
              value={form.linkLabel}
              maxLength={40}
              placeholder="Link to PIN"
              hint='Short, like "Link to PIN" or "Register". Only shows when there is a link.'
              onChange={(linkLabel) => setForm((f) => ({ ...f, linkLabel }))}
            />

            <div className="field field-wide">
              <span className="label">
                Flyer<span className="label-opt">Optional</span>
              </span>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {shownFlyer ? (
                  <img className="event-admin-preview" src={shownFlyer} alt="Flyer preview" />
                ) : (
                  <span className="event-admin-preview event-admin-thumb-empty">No flyer yet</span>
                )}
                <div style={{ display: 'grid', gap: 8 }}>
                  <div className="logo-row">
                  <input
                    type="file"
                    accept={FLYER_TYPES}
                    aria-label="Choose a flyer image"
                    disabled={submitting}
                    onChange={(e) => {
                      chooseFlyer(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  </div>
                  {flyer && (
                    <span className="muted" style={{ fontSize: 13 }}>
                      {flyer.name} will upload when you save.{' '}
                      <button type="button" className="link" onClick={() => setFlyer(null)}>
                        Undo
                      </button>
                    </span>
                  )}
                  {!flyer && current?.flyerUrl && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ justifySelf: 'start' }}
                      disabled={submitting}
                      onClick={() => void removeFlyer()}
                    >
                      Remove flyer
                    </button>
                  )}
                  {flyerProblem ? (
                    <p className="field-error" style={{ margin: 0 }}>{flyerProblem}</p>
                  ) : (
                    <p className="hint" style={{ margin: 0 }}>
                      PNG, JPEG or WebP, up to 5 MB. A portrait poster from Canva works well.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <label className="field field-wide" style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
              />
              <span>
                <strong>Show on the member portal</strong>
                <span className="hint" style={{ display: 'block', margin: 0 }}>
                  Untick to save it as a draft that only officers can see.
                </span>
              </span>
            </label>

            <div className="form-actions">
              <span className="form-actions-note">
                Saving does not email or text anyone. It only updates the Events page.
              </span>
              <button type="button" className="btn btn-secondary" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
                {submitting ? 'Saving…' : editing === 'new' ? 'Create event' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>
      )}

      {events === null ? (
        <section className="card card-flush">
          <Loading what="events" />
        </section>
      ) : events.length === 0 ? (
        <section className="card card-flush">
          <Empty
            title="No events yet"
            body="Events you add here appear on the member portal's Events page, newest first."
          >
            <button type="button" className="btn btn-primary" onClick={() => open(null)}>
              + Add the first event
            </button>
          </Empty>
        </section>
      ) : (
        <>
          <section className="card card-flush" style={{ marginBottom: 26 }}>
            <div className="card-head">
              <span className="card-title">Upcoming</span>
              <span className="hint" style={{ margin: 0 }}>Soonest first, the same order members see</span>
            </div>
            {upcoming.length === 0 ? (
              <Empty title="Nothing coming up" body="Add the next event so members have something to look forward to." />
            ) : (
              renderList(upcoming)
            )}
          </section>

          <section className="card card-flush">
            <div className="card-head">
              <span className="card-title">Past</span>
              <span className="hint" style={{ margin: 0 }}>Most recent first. Members can still see these.</span>
            </div>
            {past.length === 0 ? <Empty title="No past events" body="Events move here once they end." /> : renderList(past)}
          </section>
        </>
      )}
    </div>
  );
}
