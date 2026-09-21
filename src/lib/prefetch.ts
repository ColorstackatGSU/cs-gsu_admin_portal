import { api } from './api';

/**
 * Starts a screen's GET when it is clicked rather than when it mounts.
 *
 * Crossing into or out of the Tech League runs a 620ms pixel dissolve before the
 * navigation happens, because pixelateThen calls back at the midpoint so the new
 * screen renders behind an opaque overlay. The comment there claimed the new
 * screen's data arrived out of sight along with its first paint. It did not, and
 * could not: the component did not exist until the cover finished, so neither did
 * its effect, so the request could not start until then. Those 620ms were the one
 * window where a request would be completely invisible, and they were spent idle.
 *
 * Warm, that put the data on screen with about 140ms of reveal left. Cold, with the
 * Tech League's Vercel function taking 1.8s to wake, it arrived more than a second
 * after the reveal had finished and the officer watched a spinner on a fully
 * revealed page.
 *
 * So the click warms the endpoint and the screen claims the result on mount. The
 * screens are unchanged otherwise: claim() falls back to a plain api.get when
 * nothing was warmed, which is what happens on a reload, a typed URL, or a
 * navigation from somewhere that does not warm.
 *
 * GETs only. Every one of these is safe to repeat and safe to throw away, which is
 * what makes firing one for a navigation that may not happen acceptable.
 */

type Entry = { promise: Promise<unknown>; at: number };

const waiting = new Map<string, Entry>();

/**
 * How long a warmed result stays claimable.
 *
 * Short on purpose. A stashed promise is a snapshot of one moment, so serving it to
 * a screen mounting much later would render data that was already old when it
 * arrived. Fifteen seconds covers a dissolve, an unsaved-work confirm and a slow
 * cold start with room to spare, and expires long before a back-navigation could
 * pick it up.
 */
const TTL_MS = 15_000;

/** Endpoint each route loads on mount. Reads as the map it is. */
const ROUTE_DATA: Record<string, string> = {
  '/tech-league': '/admin/access',
  '/tech-league/review': '/admin/tech-league/applications',
  '/tech-league/pool': '/admin/tech-league/applications',
  '/tech-league/scores': '/admin/tech-league/scores',
};

/** Begins the GET for `path`, if one is not already in flight. */
export function warm(path: string): void {
  prune();
  if (waiting.has(path)) return;

  const promise = api.get<unknown>(path);

  // Nothing awaits this until the screen mounts, and a request that fails before
  // then would be an unhandled rejection in the console. Attaching a handler here
  // settles that without swallowing anything: claim() hands back this same promise,
  // and the screen awaits it and shows the error exactly as it always did.
  promise.catch(() => {});

  waiting.set(path, { promise, at: Date.now() });
}

/**
 * The result of an earlier warm(), or a fresh request when there is none.
 *
 * A drop-in for api.get at the point a screen loads itself. Handed out once: a
 * second screen asking for the same endpoint gets its own request rather than a
 * result fetched for somebody else, which matters because Review and the applicant
 * pool read the same list.
 */
export function claim<T>(path: string): Promise<T> {
  const entry = waiting.get(path);
  waiting.delete(path);

  if (entry && Date.now() - entry.at < TTL_MS) {
    return entry.promise as Promise<T>;
  }
  return api.get<T>(path);
}

/** Warms whatever the route at `to` loads, if it is a route this knows about. */
export function warmRoute(to: string): void {
  const path = ROUTE_DATA[to];
  if (path) warm(path);
}

/** Drops anything nobody claimed in time, so a discarded result is not held. */
function prune(): void {
  const now = Date.now();
  for (const [path, entry] of waiting) {
    if (now - entry.at >= TTL_MS) waiting.delete(path);
  }
}
