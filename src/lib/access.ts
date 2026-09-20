/**
 * Types for the Access screen, mirroring the Java records in
 * com.colorstackatgsu.portal.admin.AdminAccessService and AdminAccessController.
 *
 * Two different systems are being managed here and they are not symmetrical, which is the
 * thing to keep in mind when reading this file. A chapter officer is a row in our own
 * admins table and can be created before they have an account. A Tech League admin is a
 * flag on a row in the Tech League's database, which only exists once that student has
 * signed up there, so that side can only ever promote somebody who is already a member.
 */

/** Mirrors AdminAccessService.ChapterAdmin. */
export type ChapterAdmin = {
  email: string;
  note: string | null;
  /** False while the invite is outstanding. An unclaimed invite carries no access yet. */
  signedIn: boolean;
  createdAt: string | null;
  /** Null for anyone added by migration, before this screen existed. */
  grantedBy: string | null;
};

/** Mirrors TechLeagueClient.TechLeagueAdmin. */
export type TechLeagueAdmin = {
  email: string;
  fullName: string | null;
  grantedAt: string | null;
  grantedBy: string | null;
};

/** Mirrors AdminAccessService.Grant. */
export type Grant = {
  realm: 'chapter' | 'tech_league';
  targetEmail: string;
  granted: boolean;
  actorEmail: string;
  at: string | null;
};

/** Mirrors AdminAccessService.Access. */
export type Access = {
  chapterAdmins: ChapterAdmin[];
  techLeagueAdmins: TechLeagueAdmin[];
  /** False when TECH_LEAGUE_API_URL and TECH_LEAGUE_SERVICE_TOKEN are not both set. */
  techLeagueConfigured: boolean;
  /** Set when the Tech League is configured but did not answer. The chapter half still works. */
  techLeagueProblem: string | null;
  history: Grant[];
};

/**
 * Mirrors AdminAccessController.ChangeResult.
 *
 * `emailed: false` means the access change itself went through and only the notification
 * failed. The screen has to say so rather than reporting a failure, or an officer will try
 * again and be told they are already an admin.
 */
export type ChangeResult = {
  emailed: boolean;
  emailProblem: string | null;
};

export const REALM_LABEL: Record<Grant['realm'], string> = {
  chapter: 'Admin portal',
  tech_league: 'Tech League',
};

/** Same shape as the other body builders: trim, lowercase, empty string becomes null. */
export function grantBody(input: { email: string; note: string }) {
  return {
    email: input.email.trim().toLowerCase(),
    note: input.note.trim() || null,
  };
}

/** Local check so an obvious typo is caught before it becomes a round trip. */
export function emailError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v)) return 'That does not look like an email address.';
  return null;
}

/**
 * The Tech League only accepts student addresses, because a profile there is created from
 * a Supabase auth user whose address the database constrains to @student.gsu.edu. Saying
 * so here turns a refusal from their API into something the officer knew before clicking.
 */
export function techLeagueEmailError(value: string): string | null {
  const basic = emailError(value);
  if (basic) return basic;
  const v = value.trim().toLowerCase();
  if (v && !v.endsWith('@student.gsu.edu')) {
    return 'Tech League admins sign in with their @student.gsu.edu address.';
  }
  return null;
}
