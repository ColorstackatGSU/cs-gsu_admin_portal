import type { InvoiceStatus } from '../lib/format';
import { statusLabel, statusPillClass } from '../lib/format';

export default function StatusPill({ status }: { status: InvoiceStatus | 'overdue' }) {
  return <span className={statusPillClass(status)}>{statusLabel(status)}</span>;
}
