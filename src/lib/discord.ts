/**
 * The /bot screens' half of the admin API.
 *
 * Mirrors the records in cs-gsu_backend/.../discord/DiscordAdminService.java. Same rule
 * as lib/admin.ts: where the backend enforces something, the shape is written down once
 * here so no page invents its own vocabulary for it.
 */

/** Why the automatic verification could not finish. Mirrors attempts_reason_known. */
export type AttemptReason = 'no_match' | 'ambiguous' | 'already_linked' | 'error';

/** Mirrors attempts_status_known. */
export type AttemptStatus = 'pending' | 'linked' | 'rejected';

export type Attempt = {
  id: string;
  discordUserId: string;
  discordUsername: string;
  attemptedAt: string;
  reason: AttemptReason;
  status: AttemptStatus;
  /** How many times they clicked Verify before giving up. One row, not five. */
  attempts: number;
  memberId: string | null;
  memberName: string | null;
  memberEmail: string | null;
  resolvedAt: string | null;
  note: string | null;
};

export type DiscordLink = {
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  /** What the member typed. This is what verification matches on. */
  discordUsername: string | null;
  /** The account snowflake. Null means they have never verified. */
  discordUserId: string | null;
  discordVerifiedAt: string | null;
  nationalMemberApplied: boolean;
  activatedAt: string | null;
};

export type BotAction = {
  id: string;
  at: string;
  /** An officer's email, or 'system' when the webhook did it with nobody in the loop. */
  actor: string;
  action: string;
  discordUserId: string | null;
  memberId: string | null;
  memberName: string | null;
  detail: Record<string, unknown>;
};

export type DayCount = { day: string; count: number };

export type BotOverview = {
  pending: number;
  linked: number;
  unlinked: number;
  verifiedLast7Days: number;
  rejected: number;
  verificationsByDay: DayCount[];
  recentActions: BotAction[];
};

export type BotHealth = {
  configured: boolean;
  missingSettings: string[];
  guildReachable: boolean;
  guildError: string | null;
  gsuRoleResolves: boolean;
  gsuRoleName: string | null;
  nationalRoleResolves: boolean;
  nationalRoleName: string | null;
  interactionsUrl: string | null;
  lastInteractionAt: string | null;
  lastVerificationAt: string | null;
};

/* ============================================================================
   COPY
   ============================================================================
   Each reason needs two sentences an officer can act on: what happened, and
   what to do about it. A bare "no_match" on screen is a status code, not an
   explanation, and this queue is worked by people who did not write the bot.
   ==========================================================================*/

export const REASON_LABEL: Record<AttemptReason, string> = {
  no_match: 'No member record',
  ambiguous: 'More than one match',
  already_linked: 'Account already linked',
  error: 'Something failed',
};

export const REASON_HELP: Record<AttemptReason, string> = {
  no_match:
    'Nobody has this Discord username on their member record. Usually they changed their handle after filling in the form, sometimes they never filled it in. Search below by their name or email before assuming the second.',
  ambiguous:
    'Two or more member records claim this Discord username, so linking automatically would have handed one person the other one’s access. Pick the right record, then fix the duplicate handle on the other.',
  already_linked:
    'This Discord account is already verified against a different member record — or the record we found is verified against a different Discord account. Unlink the wrong one on Discord links first.',
  error:
    'The role grant or the lookup itself failed, so they may be half-verified. Linking them here re-runs the grant.',
};

/** Colour never carries the meaning alone — the pill always spells out its state. */
export function statusPillClass(status: AttemptStatus): string {
  if (status === 'pending') return 'pill pill-issued';
  if (status === 'linked') return 'pill pill-paid';
  return 'pill pill-void';
}

export function memberName(link: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name = [link.firstName, link.lastName].filter(Boolean).join(' ').trim();
  return name || link.email;
}

/** What the audit log's action verbs mean, spelled out for the overview feed. */
export const ACTION_LABEL: Record<string, string> = {
  verify: 'verified themselves',
  link: 'was linked by an officer',
  unlink: 'was unlinked',
  grant: 'had roles re-granted',
  revoke: 'had roles revoked',
  reject: 'was turned down',
  error: 'hit an error',
};
