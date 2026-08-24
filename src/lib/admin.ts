/**
 * Resource types for the admin API, plus the small amount of logic that has to
 * agree with the backend exactly.
 *
 * Each type mirrors a record in
 * cs-gsu_backend/.../admin/AdminPortalService.java. Where the backend validates
 * something (slug shape, brand hex shape, which fields a body may carry), the
 * rule is written down here once so every page enforces the same thing before
 * the request goes out. A form that lets you type something the server will
 * refuse, and only tells you after a round trip, is a form that wastes an
 * officer's evening.
 */

export type Tier = {
  id: string;
  name: string;
  amountCents: number;
};

export type SponsorStatus = 'active' | 'prospective' | 'lapsed';
export type ContactRole = 'primary' | 'billing' | 'viewer';
export type InvoiceStatus = 'draft' | 'issued' | 'processing' | 'paid' | 'void';

export type Sponsor = {
  id: string;
  name: string;
  slug: string;
  brandHex: string | null;
  tierId: string | null;
  tierName: string | null;
  websiteUrl: string | null;
  status: SponsorStatus;
};

export type Contact = {
  id: string;
  sponsorId: string;
  email: string;
  fullName: string | null;
  title: string | null;
  role: ContactRole;
  /** True once the person has signed in and been linked to an auth user. */
  activated: boolean;
};

export type SponsorDetail = {
  sponsor: Sponsor;
  contacts: Contact[];
};

export type Invoice = {
  id: string;
  sponsorId: string;
  sponsorName: string;
  tierId: string | null;
  tierName: string | null;
  amountCents: number;
  title: string;
  zeffyInvoiceId: string | null;
  status: InvoiceStatus;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
};

/** What POST /admin/sponsors/{id}/impersonate returns. The admin frontend
 *  opens sponsors.colorstackatgsu.com/impersonate?token=<tokenHash>&sponsor=<name>
 *  in a new tab; the sponsor portal calls verifyOtp with the token_hash and
 *  lands the officer in a real session as that sponsor's primary contact. */
export type Impersonation = {
  email: string;
  tokenHash: string;
  sponsorName: string;
};

/** A member as an officer sees them. Every column: this is the admin view. */
export type Member = {
  id: string;
  userId: string | null;
  email: string;
  personalEmail: string | null;
  firstName: string | null;
  lastName: string | null;
  pronouns: string | null;
  majors: string | null;
  classYear: string | null;
  gradTerm: string | null;
  gradYear: number | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  discordUsername: string | null;
  resumeShared: boolean;
  hasResume: boolean;
  resumeUploadedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
};

export type Unmatched = {
  id: string;
  zeffyPaymentId: string;
  amountCents: number;
  currency: string | null;
  buyerEmail: string | null;
  buyerCompany: string | null;
  receivedAt: string;
};

/* ============================================================================
   REQUEST BODIES
   ============================================================================
   The backend binds each body to a Java record with @NotNull / @NotBlank on
   specific fields. Building the body through these helpers rather than
   spreading a whole resource object into the request means we never send `id`,
   `tierName` or `activated` back to an endpoint that has no field for them, and
   the required fields cannot be forgotten.
   ==========================================================================*/

/** Matches AdminPortalController.SponsorBody. */
export type SponsorBody = {
  name: string;
  slug: string;
  brandHex: string | null;
  tierId: string | null;
  websiteUrl: string | null;
  status: SponsorStatus;
};

export function sponsorBody(input: {
  name: string;
  slug: string;
  brandHex: string;
  tierId: string;
  websiteUrl: string;
  status: SponsorStatus;
}): SponsorBody {
  return {
    name: input.name.trim(),
    slug: input.slug.trim(),
    // The DB check constraint is `^#[0-9A-F]{6}$`, so uppercase on the way out
    // and send null rather than an empty string when it is blank.
    brandHex: input.brandHex.trim() ? input.brandHex.trim().toUpperCase() : null,
    tierId: input.tierId || null,
    websiteUrl: input.websiteUrl.trim() || null,
    status: input.status,
  };
}

/** Matches AdminPortalController.ContactBody. */
export type ContactBody = {
  email: string;
  fullName: string | null;
  title: string | null;
  role: ContactRole;
};

export function contactBody(input: {
  email: string;
  fullName: string;
  title: string;
  role: ContactRole;
}): ContactBody {
  return {
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName.trim() || null,
    title: input.title.trim() || null,
    role: input.role,
  };
}

/** Matches AdminPortalController.InvoiceBody. tierId is required server-side:
 *  the amount is read off the tier, never sent by us. */
export type InvoiceBody = {
  sponsorId: string;
  tierId: string;
  zeffyInvoiceId: string | null;
  title: string;
  dueAt: string | null;
};

export function invoiceBody(input: {
  sponsorId: string;
  tierId: string;
  zeffyInvoiceId: string;
  title: string;
  dueAt: string;
}): InvoiceBody {
  return {
    sponsorId: input.sponsorId,
    tierId: input.tierId,
    zeffyInvoiceId: input.zeffyInvoiceId.trim() || null,
    title: input.title.trim(),
    dueAt: input.dueAt || null,
  };
}

/* ============================================================================
   VALIDATION
   ============================================================================
   Mirrors the database's own check constraints (see the sponsors table in
   supabase/migrations/20260730000002_sponsors.sql). Kept as pure predicates so
   forms can show the problem next to the field instead of surfacing a 409 that
   says "invalid or already in use" about six fields at once.
   ==========================================================================*/

/** `^[a-z0-9]+(-[a-z0-9]+)*$` — the sponsors_slug_format constraint. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** `^#[0-9A-F]{6}$` — the sponsors_brand_hex_format constraint, case-folded
 *  here because we uppercase before sending. */
export const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** Turns a company name into a valid slug. Same shape the constraint wants. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function slugError(slug: string): string | null {
  if (!slug.trim()) return 'A slug is required.';
  if (!SLUG_PATTERN.test(slug.trim())) {
    return 'Lowercase letters, numbers and single dashes only — no spaces, no leading or trailing dash.';
  }
  return null;
}

export function hexError(hex: string): string | null {
  if (!hex.trim()) return null; // optional: null means "fall back to GSU blue"
  if (!HEX_PATTERN.test(hex.trim())) return 'Six-digit hex with a leading #, e.g. #0039A6.';
  return null;
}

export function websiteError(url: string): string | null {
  if (!url.trim()) return null;
  if (!/^https?:\/\/.+/i.test(url.trim())) return 'Include the protocol, e.g. https://example.com.';
  return null;
}

/* ============================================================================
   ERRORS
   ==========================================================================*/

/**
 * The human-readable message for anything thrown by the api client.
 *
 * Spring answers with a ProblemDetail whose `detail` is copy the backend wrote
 * for exactly this situation ("Only draft invoices can be issued."), so that is
 * always preferred over our own fallback.
 */
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'body' in error) {
    const body = (error as { body: unknown }).body;
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string' && detail.trim()) return detail;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}
