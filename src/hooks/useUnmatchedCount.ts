import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Unmatched } from '../lib/admin';

/**
 * How many Zeffy payments are sitting unreconciled, for the badge on the
 * sidebar nav item.
 *
 * This is the one number in the app that is genuinely a queue: money has
 * arrived that we have not tied to an invoice, and nobody will go looking at
 * the page unless something tells them to. So it lives in the nav, on every
 * page, rather than only on the page that would fix it.
 *
 * A tiny module-level store rather than a context: the value is one integer,
 * every consumer wants the same copy of it, and the unmatched page needs to
 * push a fresh count after linking or dismissing a row. `refreshUnmatched()`
 * is that push.
 *
 * A failure here is silent on purpose. The badge is a convenience; if the call
 * fails the page itself will show the real error when it is opened, and a
 * broken badge should never be the loudest thing on screen.
 */

let count: number | null = null;
const listeners = new Set<(value: number | null) => void>();

function publish(value: number | null) {
  count = value;
  listeners.forEach((fn) => fn(value));
}

export async function refreshUnmatched(): Promise<void> {
  try {
    const rows = await api.get<Unmatched[]>('/admin/unmatched-payments');
    publish(rows.length);
  } catch {
    publish(null);
  }
}

export function useUnmatchedCount(): number | null {
  const [value, setValue] = useState<number | null>(count);

  useEffect(() => {
    listeners.add(setValue);
    // Only fetch on the first mount of the first consumer. After that the
    // stored value is handed straight over and refreshed by the page that
    // changes it.
    if (count === null) void refreshUnmatched();
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  return value;
}
