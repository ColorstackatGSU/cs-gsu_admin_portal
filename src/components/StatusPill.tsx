import type { ContactRole, InvoiceStatus, SponsorStatus } from '../lib/admin';
import {
  roleLabel,
  sponsorStatusLabel,
  sponsorStatusPillClass,
  statusLabel,
  statusPillClass,
} from '../lib/format';

/**
 * Invoice state, as a pill. The label is always spelled out, never carried by
 * colour alone, so this survives colour blindness and a greyscale print.
 */
export default function StatusPill({ status }: { status: InvoiceStatus | 'overdue' }) {
  return <span className={statusPillClass(status)}>{statusLabel(status)}</span>;
}

/** Sponsor lifecycle: active, prospective, lapsed. Same shape, same rules. */
export function SponsorPill({ status }: { status: SponsorStatus }) {
  return <span className={sponsorStatusPillClass(status)}>{sponsorStatusLabel(status)}</span>;
}

/**
 * Whether a contact has ever signed in. "Invited" is not a failure state — most
 * contacts sit there for weeks before the first invoice goes out — so it gets
 * the neutral fill, not a warning colour.
 */
export function ContactPill({ activated }: { activated: boolean }) {
  return (
    <span className={activated ? 'pill pill-signedin' : 'pill pill-invited'}>
      {activated ? 'Signed in' : 'Invited'}
    </span>
  );
}

/** Contact role, as a plain chip. Not a status, so no dot. */
export function RolePill({ role }: { role: ContactRole }) {
  return <span className="pill pill-invited">{roleLabel(role)}</span>;
}
