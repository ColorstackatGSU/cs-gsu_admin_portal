import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * How many failed Discord verifications are waiting on an officer, for the badge on the
 * sidebar nav item.
 *
 * The second genuine queue in this app, and it exists for the same reason the unmatched
 * one does: somebody is stuck — a member who clicked Verify and got told to go away — and
 * nobody will open the page unless something says to. So the number lives in the nav, on
 * every screen, not only on the screen that would clear it.
 *
 * Same module-level store as useUnmatchedCount, deliberately: one integer, every consumer
 * wants the same copy, and the queue page has to push a fresh count after resolving a row.
 *
 * Failure is silent. The badge is a convenience; if the call fails the page itself shows
 * the real error when it is opened, and a broken badge should never be the loudest thing
 * on screen.
 */

let count: number | null = null;
const listeners = new Set<(value: number | null) => void>();

function publish(value: number | null) {
  count = value;
  listeners.forEach((fn) => fn(value));
}

export async function refreshBotQueue(): Promise<void> {
  try {
    // The count endpoint rather than the list: the nav has no use for 500 rows.
    const { pending } = await api.get<{ pending: number }>('/admin/discord/queue/count');
    publish(pending);
  } catch {
    publish(null);
  }
}

export function useBotQueueCount(): number | null {
  const [value, setValue] = useState<number | null>(count);

  useEffect(() => {
    listeners.add(setValue);
    if (count === null) void refreshBotQueue();
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  return value;
}
