/**
 * A pixel dissolve for crossing between the two design systems.
 *
 * This portal is cream paper, GSU blue and hard ink borders. The Tech League is a
 * near-black pitch with neon green. Dropping somebody straight from one into the other is
 * jarring enough that it reads as a bug, so the jump gets a beat of its own: a grid of
 * squares sweeps across the screen, and the squares themselves ramp from this portal's
 * palette into the Tech League's. By the time the screen is covered it is already the
 * other system's colours, so arriving there feels like the end of a move rather than a
 * different site loading.
 *
 * Built out of transform and opacity only, on a fixed overlay, so it composites on the GPU
 * and never reflows the page underneath. No dependency and no canvas: a canvas would mean
 * rasterising the DOM first, which is both slow and a much larger thing to maintain than
 * five hundred divs that scale from zero.
 *
 * The state lives in a module-level store with a listener set, the same shape as
 * useUnmatchedCount and useBotQueueCount, because the trigger and the overlay are in
 * different parts of the tree and this codebase already solves that this way rather than
 * with a context. It lives in lib/ rather than beside the component because a module
 * that exports both a component and plain functions breaks Fast Refresh.
 */

type Phase = 'idle' | 'covering' | 'revealing';

/**
 * Which way the crossing goes.
 *
 * The squares ramp from the palette you are leaving to the palette you are arriving in,
 * so the direction has to be known: sweeping portal colours onto the portal on the way
 * back would leave a block of black and neon green as the last thing clearing off a cream
 * page, which is visibly the wrong way round.
 *
 * It is carried rather than inferred from the DOM, because the outbound case
 * (pixelateToUrl, leaving for the Tech League site) has no destination in this document
 * to inspect.
 */
type Direction = 'to-tech-league' | 'to-portal';

type State = {
  phase: Phase;
  /** Set while covering, so the overlay can label where it is going. */
  label: string | null;
  direction: Direction;
};

let state: State = { phase: 'idle', label: null, direction: 'to-tech-league' };
const listeners = new Set<(s: State) => void>();

function publish(next: State) {
  state = next;
  for (const listener of listeners) listener(state);
}

/** Cover, then reveal, in milliseconds. Kept here so the callers cannot drift from the CSS. */
const COVER_MS = 620;
const REVEAL_MS = 520;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs the dissolve, then hands control back at the moment the screen is fully covered.
 *
 * `onCovered` is where the navigation goes. Doing it at the midpoint rather than at the
 * start is the whole point: the new screen renders behind an opaque overlay, so its first
 * paint, its fonts loading and its data arriving all happen out of sight.
 *
 * Under prefers-reduced-motion the callback fires immediately and nothing is drawn. This
 * is a full-screen animation of several hundred moving elements, which is squarely what
 * that setting exists to turn off.
 */
export function pixelateThen(
  onCovered: () => void,
  label?: string,
  direction: Direction = 'to-tech-league',
) {
  if (prefersReducedMotion()) {
    onCovered();
    return;
  }
  if (state.phase !== 'idle') return;

  publish({ phase: 'covering', label: label ?? null, direction });

  window.setTimeout(() => {
    onCovered();
    // The direction is kept through the reveal: the cells clearing off the new page have
    // to be the ones that already match it, or the old palette flashes on the new screen.
    publish({ phase: 'revealing', label: null, direction });
    window.setTimeout(() => publish({ phase: 'idle', label: null, direction }), REVEAL_MS);
  }, COVER_MS);
}

/**
 * The same dissolve, for leaving this app entirely.
 *
 * There is no reveal: the browser unloads this document on navigation, so the overlay
 * simply stays covered until it goes. Trying to reveal afterwards would flash the old page
 * back for a frame on a slow connection.
 */
export function pixelateToUrl(
  href: string,
  label?: string,
  direction: Direction = 'to-tech-league',
) {
  if (prefersReducedMotion()) {
    window.location.assign(href);
    return;
  }
  if (state.phase !== 'idle') return;

  publish({ phase: 'covering', label: label ?? null, direction });
  window.setTimeout(() => window.location.assign(href), COVER_MS);
}


/** Subscribes to the phase. Only the overlay needs this. */
export function subscribe(listener: (s: State) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentState(): State {
  return state;
}

export type { State, Phase, Direction };
export { COVER_MS, REVEAL_MS };
