export type InvoiceStatus = 'draft' | 'issued' | 'processing' | 'paid' | 'void';
export type SponsorStatus = 'active' | 'prospective' | 'lapsed';
export type ContactRole = 'primary' | 'billing' | 'viewer';

export function zeffyInvoiceUrl(zeffyInvoiceId: string): string {
  return `https://www.zeffy.com/en-US/invoice/${zeffyInvoiceId}`;
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

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

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  const msPerDay = 86_400_000;
  return Math.ceil((d.getTime() - Date.now()) / msPerDay);
}

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

export function statusPillClass(status: InvoiceStatus | 'overdue'): string {
  return `pill pill-${status}`;
}

const SPONSOR_STATUS_LABELS: Record<SponsorStatus, string> = {
  active: 'Active',
  prospective: 'Prospective',
  lapsed: 'Lapsed',
};

export function sponsorStatusLabel(status: SponsorStatus): string {
  return SPONSOR_STATUS_LABELS[status];
}

export function sponsorStatusPillClass(status: SponsorStatus): string {
  const map: Record<SponsorStatus, string> = {
    active: 'pill pill-paid',
    prospective: 'pill pill-issued',
    lapsed: 'pill pill-void',
  };
  return map[status];
}
