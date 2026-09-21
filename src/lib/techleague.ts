/**
 * Types and shared rules for the Tech League's three admin screens: the review
 * queue, the applicant pool and score entry.
 *
 * These mirror the Java records the portal API answers with, which in turn mirror
 * the Tech League's own `/api/service` shapes. The frozen contract for both sides
 * lives with the port; the one rename to remember is that the Tech League says
 * `emailError` and the portal says `emailProblem`, and everything this file and
 * the pages above it touch is the portal's spelling.
 *
 * The decision rules live here rather than in a page because two screens ask the
 * same questions of an application (which bucket is it in, where would its email
 * go) and a second copy of either is a second place for them to drift.
 */

/* ---- Applications --------------------------------------------------------- */

export type ApplicationStatus = 'draft' | 'submitted';
export type Decision = 'accepted' | 'waitlisted' | 'denied';

/** Mirrors TechLeagueApplication.Resume. Metadata only: the file is fetched separately. */
export type ApplicationResume = {
  name: string;
  size: number;
  uploadedAt: string;
};

/** Mirrors TechLeagueApplication. */
export type Application = {
  userId: string;
  email: string;
  status: ApplicationStatus;
  fullName: string | null;
  personalEmail: string | null;
  /** True only once they clicked the link we mailed to that address. */
  personalEmailVerified: boolean;
  /** Collected for chapter reporting, in aggregate. Never part of a decision. */
  raceEthnicity: string[];
  year: string | null;
  major: string | null;
  secondMajor: string | null;
  gradTerm: string | null;
  interest: string | null;
  teamPref: string | null;
  whyJoin: string | null;
  goals: string | null;
  experience: string | null;
  commitment: string | null;
  decision: Decision | null;
  decidedAt: string | null;
  /** Null after a decision means the email did not go out. The queue surfaces that. */
  decisionEmailedAt: string | null;
  submittedAt: string | null;
  updatedAt: string;
  resume: ApplicationResume | null;
};

/**
 * Mirrors AdminTechLeagueController.DecisionResult.
 *
 * `emailed: false` means the decision itself was recorded and only the mail
 * failed. Reporting that as a failure would have an officer press Accept twice,
 * so the screen says the decision stands and offers to send the email again.
 */
export type DecisionResult = {
  application: Application;
  emailed: boolean;
  emailProblem: string | null;
};

/** Mirrors AdminTechLeagueController.ReopenResult. */
export type ReopenResult = {
  application: Application;
};

/* ---- Scores --------------------------------------------------------------- */

/** Mirrors TechLeagueScores.Event. `max` is the rubric total, `weight` its share. */
export type ScoreEvent = {
  id: string;
  name: string;
  weight: number;
  max: number;
};

/** Mirrors TechLeagueScores.Team. `scores` is keyed by event id; a missing key is unscored. */
export type ScoreTeam = {
  id: string;
  name: string;
  capacity: number;
  members: number;
  scores: Record<string, number>;
};

/** Mirrors TechLeagueScores. */
export type Scores = {
  events: ScoreEvent[];
  teams: ScoreTeam[];
};

/* ---- Vocabulary ----------------------------------------------------------- */

/** The stored values are short codes; these are what a person reads. */
export const TEAM_PREF_LABELS: Record<string, string> = {
  team: 'Wants help finding a team',
  'have-team': 'Has teammates in mind',
};

export const COMMITMENT_LABELS: Record<string, string> = {
  '1-2': '1-2 hrs / week',
  '3-5': '3-5 hrs / week',
  '6-8': '6-8 hrs / week',
  '9+': '9+ hrs / week',
};

/** A team below this many members stays off the leaderboard even once scored. */
export const TEAM_MIN_MEMBERS = 3;

/* ---- Status --------------------------------------------------------------- */

export type ApplicationState = {
  label: string;
  /** A .pill class. Defined in the Tech League block at the end of index.css. */
  pillClass: string;
};

/**
 * One label per bucket, spelled out. Nothing here is carried by colour alone,
 * which is the same rule the invoice and sponsor pills follow.
 */
export function statusOf(a: Application): ApplicationState {
  if (a.status === 'draft') return { label: 'Draft', pillClass: 'pill pill-tl-draft' };
  if (a.decision === 'accepted') return { label: 'Accepted', pillClass: 'pill pill-tl-accepted' };
  if (a.decision === 'waitlisted') return { label: 'Waitlisted', pillClass: 'pill pill-tl-waitlisted' };
  if (a.decision === 'denied') return { label: 'Denied', pillClass: 'pill pill-tl-denied' };
  return { label: 'To review', pillClass: 'pill pill-tl-review' };
}

/** A decision was recorded and its email never went. The one state worth chasing. */
export function needsEmail(a: Application): boolean {
  return Boolean(a.decision && !a.decisionEmailedAt);
}

/**
 * Where the decision email actually goes, and why.
 *
 * The personal address is used only once the applicant clicked the link we sent
 * to it. An unconfirmed personal address is a typed claim, and a decision mailed
 * to a typo is a decision nobody receives, so it falls back to the school
 * address that Supabase already proved they hold.
 */
export function emailTarget(a: Application): { address: string; note: string } {
  if (a.personalEmail && a.personalEmailVerified) {
    return { address: a.personalEmail, note: 'personal email, confirmed' };
  }
  return {
    address: a.email,
    note: a.personalEmail ? 'school email; personal email not confirmed' : 'school email',
  };
}

/* ---- Queue filters -------------------------------------------------------- */

export type FilterKey =
  | 'review'
  | 'accepted'
  | 'waitlisted'
  | 'denied'
  | 'drafts'
  | 'unsent'
  | 'all';

export type QueueFilter = {
  key: FilterKey;
  label: string;
  match: (a: Application) => boolean;
};

export const FILTERS: QueueFilter[] = [
  { key: 'review', label: 'To review', match: (a) => a.status === 'submitted' && !a.decision },
  { key: 'accepted', label: 'Accepted', match: (a) => a.decision === 'accepted' },
  { key: 'waitlisted', label: 'Waitlisted', match: (a) => a.decision === 'waitlisted' },
  { key: 'denied', label: 'Denied', match: (a) => a.decision === 'denied' },
  { key: 'drafts', label: 'Drafts', match: (a) => a.status === 'draft' },
  { key: 'unsent', label: 'Email not sent', match: needsEmail },
  { key: 'all', label: 'All', match: () => true },
];

export type SortKey = 'oldest' | 'newest' | 'name';

/** Oldest first is the default because the queue is worked, not browsed. */
export const SORTS: Record<SortKey, { label: string; fn: (x: Application, y: Application) => number }> = {
  oldest: {
    label: 'Oldest first',
    fn: (x, y) => (x.submittedAt ?? x.updatedAt).localeCompare(y.submittedAt ?? y.updatedAt),
  },
  newest: {
    label: 'Newest first',
    fn: (x, y) => (y.submittedAt ?? y.updatedAt).localeCompare(x.submittedAt ?? x.updatedAt),
  },
  name: {
    label: 'Name',
    fn: (x, y) => (x.fullName ?? x.email).localeCompare(y.fullName ?? y.email),
  },
};

/** The verb, the shortcut and the button treatment for each decision. */
export const DECISIONS: Record<Decision, { verb: string; past: string; key: string; danger: boolean }> = {
  accepted: { verb: 'Accept', past: 'Accepted', key: 'a', danger: false },
  waitlisted: { verb: 'Waitlist', past: 'Waitlisted', key: 'w', danger: false },
  denied: { verb: 'Deny', past: 'Denied', key: 'd', danger: true },
};

export const DECISION_ORDER: Decision[] = ['accepted', 'waitlisted', 'denied'];

/* ---- Small maths ---------------------------------------------------------- */

const DAY = 24 * 60 * 60 * 1000;

/** How long an application has been sitting unanswered. Never negative. */
export function waitingDays(iso: string | null): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / DAY));
}

/** Counts of one field across a set of applications, biggest first. */
export function tally(items: Application[], pick: (a: Application) => string | string[] | null): [string, number][] {
  const map = new Map<string, number>();
  for (const a of items) {
    const picked = pick(a);
    for (const value of Array.isArray(picked) ? picked : [picked]) {
      if (!value) continue;
      map.set(value, (map.get(value) ?? 0) + 1);
    }
  }
  return [...map.entries()].sort((x, y) => y[1] - x[1]);
}

/* ---- Score entry ---------------------------------------------------------- */

export const scoreKey = (teamId: string, eventId: string) => `${teamId}:${eventId}`;

/** A stored score as the text that belongs in its box. Undefined means unscored. */
export const scoreText = (points: number | undefined) =>
  points === undefined || points === null ? '' : String(points);

/**
 * Why a typed score cannot be saved, or null when it can.
 *
 * Empty is valid and means "clear this score", which is the only way to undo a
 * score typed into the wrong row.
 */
export function scoreProblem(text: string, event: ScoreEvent): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const points = Number(trimmed);
  if (!Number.isFinite(points) || points < 0 || points > event.max) {
    return `Enter 0 to ${event.max}, or leave it empty.`;
  }
  return null;
}

/* ---- Export --------------------------------------------------------------- */

/**
 * The visible list as a CSV, for the officers who do their counting in a sheet.
 *
 * Race and ethnicity are left out on purpose. They exist for the aggregate
 * numbers on the pool screen, not for a spreadsheet that gets forwarded around
 * a chapter Slack, and a column nobody can un-share is worse than a column
 * somebody has to go and count.
 */
export function exportCsv(items: Application[], label: string): void {
  const columns: [string, (a: Application) => unknown][] = [
    ['Name', (a) => a.fullName],
    ['School email', (a) => a.email],
    ['Personal email', (a) => a.personalEmail],
    ['Personal email confirmed', (a) => (a.personalEmailVerified ? 'yes' : 'no')],
    ['Year', (a) => a.year],
    ['Major', (a) => a.major],
    ['Second major', (a) => a.secondMajor],
    ['Graduating', (a) => a.gradTerm],
    ['Interest', (a) => a.interest],
    ['Teammates', (a) => (a.teamPref ? TEAM_PREF_LABELS[a.teamPref] : '')],
    ['Time per week', (a) => (a.commitment ? COMMITMENT_LABELS[a.commitment] : '')],
    ['Status', (a) => statusOf(a).label],
    ['Submitted', (a) => (a.submittedAt ? a.submittedAt.slice(0, 10) : '')],
    ['Resume', (a) => (a.resume ? 'yes' : 'no')],
  ];
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    columns.map(([head]) => cell(head)).join(','),
    ...items.map((a) => columns.map(([, read]) => cell(read(a))).join(',')),
  ].join('\r\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `tech-league-${label.toLowerCase().replace(/\s+/g, '-')}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
