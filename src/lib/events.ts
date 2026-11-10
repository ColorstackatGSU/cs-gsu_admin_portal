/**
 * Events as the admin API returns them, mirroring EventsService.Event in
 * cs-gsu_backend/.../events/EventsService.java, plus the small conversions the form
 * needs between an ISO instant and what a datetime-local input holds.
 */

export type ChapterEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  flyerUrl: string | null;
  /** False for a draft: officers see it here, members do not. */
  published: boolean;
  updatedAt: string | null;
};

export type EventForm = {
  title: string;
  description: string;
  /** datetime-local value, in the officer's own clock. */
  startsAt: string;
  endsAt: string;
  location: string;
  linkUrl: string;
  linkLabel: string;
  published: boolean;
};

export const EMPTY_EVENT: EventForm = {
  title: '',
  description: '',
  startsAt: '',
  endsAt: '',
  location: '',
  linkUrl: '',
  linkLabel: 'Link to PIN',
  published: true,
};

/** ISO instant to `yyyy-mm-ddThh:mm` in the browser's own zone, for a datetime-local input. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** The reverse. A datetime-local value has no zone, and Date reads it as local time. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formFromEvent(e: ChapterEvent): EventForm {
  return {
    title: e.title,
    description: e.description ?? '',
    startsAt: toLocalInput(e.startsAt),
    endsAt: toLocalInput(e.endsAt),
    location: e.location ?? '',
    linkUrl: e.linkUrl ?? '',
    linkLabel: e.linkLabel ?? '',
    published: e.published,
  };
}

export function eventBody(f: EventForm) {
  return {
    title: f.title.trim(),
    description: f.description.trim() || null,
    startsAt: fromLocalInput(f.startsAt),
    endsAt: fromLocalInput(f.endsAt),
    location: f.location.trim() || null,
    linkUrl: f.linkUrl.trim() || null,
    linkLabel: f.linkLabel.trim() || null,
    published: f.published,
  };
}

/** The same rules the API applies, so the form can say so before a round trip. */
export function eventProblems(f: EventForm): { endsAt: string | null; linkUrl: string | null } {
  const start = fromLocalInput(f.startsAt);
  const end = fromLocalInput(f.endsAt);
  const link = f.linkUrl.trim();
  return {
    endsAt: start && end && end < start ? 'This is before the start time.' : null,
    linkUrl: link && !/^https?:\/\/\S+$/i.test(link) ? 'Paste the full link, starting with https://' : null,
  };
}

/** True while the event has not finished: its end, or its start when there is no end, is ahead. */
export function isUpcoming(e: ChapterEvent, now = Date.now()): boolean {
  return new Date(e.endsAt ?? e.startsAt).getTime() >= now;
}

const ZONE = 'America/New_York';

/** "Thu, Nov 20, 2026 · 6:00 PM to 7:30 PM", always in Atlanta time. */
export function formatWhen(e: ChapterEvent): string {
  const start = new Date(e.startsAt);
  const day = new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: ZONE,
  }).format(start);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ZONE });
  const end = e.endsAt ? ` to ${time.format(new Date(e.endsAt))}` : '';
  return `${day} · ${time.format(start)}${end}`;
}
