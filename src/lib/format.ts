import type { ContactRole, InvoiceStatus, SponsorStatus } from './admin';

/**
 * Display helpers. Every amount, date and status label in the UI goes through
 * here, so there is exactly one place each of them can be wrong.
 *
 * Kept byte-for-byte compatible with the sponsor portal's lib/format.ts for
 * money, dates and invoice status: an officer and a sponsor looking at the same
 * invoice must read the same words and the same numbers off their screens.
 */

/** Zeffy invoice UUID to the public URL the sponsor pays on. */
export function zeffyInvoiceUrl(zeffyInvoiceId: string): string {
  return `https://www.zeffy.com/en-US/invoice/${zeffyInvoiceId}`;
}

/** Cents to "$5,000.00". */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * "Mar 14, 2026". Dates arrive as ISO strings.
 *
 * Parsed as UTC noon rather than handed straight to Date. A bare "2026-03-14" is
 * parsed as UTC midnight, which renders as March 13 for anyone west of Greenwich,
 * and an invoice due date that is off by a day is a real problem.
 */
export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: dateOnly ? 'UTC' : undefined,
  }).format(d);
}

/** Whole days from today until the date. Negative means it has passed. */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  const msPerDay = 86_400_000;
  return Math.ceil((d.getTime() - Date.now()) / msPerDay);
}

/** Today as `yyyy-mm-dd` in the local zone, for <input type="date"> bounds. */
export function todayInput(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** `yyyy-mm-dd` a number of days from today. Used to default a due date. */
export function dateInputIn(days: number): string {
  const then = new Date(Date.now() + days * 86_400_000);
  const local = new Date(then.getTime() - then.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * The status to actually show, which is not always the stored one. "Overdue" is
 * not a column: it is an issued invoice whose due date has passed, derived at
 * read time so it can never go stale in the database.
 */
export function displayStatus(invoice: {
  status: InvoiceStatus;
  dueAt: string | null;
}): InvoiceStatus | 'overdue' {
  if (invoice.status === 'issued') {
    const days = daysUntil(invoice.dueAt);
    if (days !== null && days < 0) return 'overdue';
  }
  return invoice.status;
}

const STATUS_LABELS: Record<InvoiceStatus | 'overdue', string> = {
  draft: 'Draft',
  issued: 'Awaiting payment',
  processing: 'Payment processing',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
};

export function statusLabel(status: InvoiceStatus | 'overdue'): string {
  return STATUS_LABELS[status];
}

/** One line saying what this status means for the officer looking at it. */
const STATUS_HELP: Record<InvoiceStatus | 'overdue', string> = {
  draft: 'Not sent. Nothing is visible to the sponsor until you issue it.',
  issued: 'Sent to the sponsor and waiting to be paid on Zeffy.',
  processing: 'The sponsor paid by bank transfer. It takes 3 to 5 business days to settle.',
  paid: 'Settled in full. Nothing further is needed.',
  overdue: 'Issued, and the due date has passed. Worth a nudge.',
  void: 'Cancelled. Not payable and not counted anywhere.',
};

export function statusHelp(status: InvoiceStatus | 'overdue'): string {
  return STATUS_HELP[status];
}

export function statusPillClass(status: InvoiceStatus | 'overdue'): string {
  return `pill pill-${status}`;
}

/* ---- Sponsor lifecycle ---------------------------------------------------- */

const SPONSOR_STATUS_LABELS: Record<SponsorStatus, string> = {
  active: 'Active',
  prospective: 'Prospective',
  lapsed: 'Lapsed',
};

export function sponsorStatusLabel(status: SponsorStatus): string {
  return SPONSOR_STATUS_LABELS[status];
}

export function sponsorStatusPillClass(status: SponsorStatus): string {
  return `pill pill-${status}`;
}

/* ---- Contacts ------------------------------------------------------------- */

const ROLE_LABELS: Record<ContactRole, string> = {
  primary: 'Primary',
  billing: 'Billing',
  viewer: 'Viewer',
};

export function roleLabel(role: ContactRole): string {
  return ROLE_LABELS[role];
}

/** What each role actually means, shown next to the role picker. */
export const ROLE_HELP =
  'Primary is the main relationship contact, Billing receives invoices, Viewer can sign in and look. ' +
  'All three see the same sponsor portal today; the role is how we decide who to email.';
