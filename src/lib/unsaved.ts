/**
 * Stops a click in the nav throwing away work a screen is still holding.
 *
 * Score entry stages every edit locally and writes nothing until the officer reviews the
 * list and confirms. That is deliberate: scores go live to every open leaderboard within
 * seconds, so a stray keystroke should not be one blur away from public. The cost is that
 * the staged edits live in a component, and clicking another nav item unmounts it.
 *
 * `beforeunload` does not help. The browser fires it for closing the tab or a real page
 * load, not for a client side route change, which is what every link in this app does. So
 * on the original Tech League page the edits survived, because its sections were tabs in
 * one component; here they are routes, and without this they vanish silently.
 *
 * react-router's own `useBlocker` is the obvious tool and is not available: it requires a
 * data router, and this app mounts a plain `<BrowserRouter>`. Migrating the whole router to
 * block one screen is a much larger change than this.
 *
 * So: a screen registers what it would lose, the nav asks before it navigates, and the
 * screen renders the question itself. A module level store with a listener set, the same
 * shape as useUnmatchedCount and pixelate, because the two halves are in different parts of
 * the tree and this codebase already solves that this way rather than with a context.
 *
 * Deliberately not `window.confirm`: see the note in components/Confirm.tsx. A native
 * dialog cannot say what is about to be lost in the screen's own words, and looks like a
 * browser error rather than a question the app is asking.
 */

type State = {
  /** What would be lost, in the screen's words. Null when there is nothing to lose. */
  reason: string | null;
  /** The navigation waiting on an answer, or null when nothing is pending. */
  pending: (() => void) | null;
};

let state: State = { reason: null, pending: null };
const listeners = new Set<(s: State) => void>();

function publish(next: State) {
  state = next;
  for (const listener of listeners) listener(state);
}

export function subscribeUnsaved(listener: (s: State) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentUnsaved(): State {
  return state;
}

/**
 * Declares that this screen is holding unsaved work, or that it no longer is.
 *
 * Call with null on unmount. A screen that forgets to clear this would block navigation
 * from every other screen in the app, which is why the caller should do it from an effect's
 * cleanup rather than by hand.
 */
export function setUnsaved(reason: string | null) {
  if (state.reason === reason) return;
  publish({ ...state, reason });
}

/**
 * Runs `go`, or holds it back and asks first.
 *
 * Returns true when the navigation happened, false when it is waiting on an answer. The
 * caller uses that to decide whether to also run anything it would normally pair with the
 * navigation, such as the pixel dissolve: starting a transition for a move that is about to
 * be questioned would cover the question.
 */
export function guardNavigation(go: () => void): boolean {
  if (!state.reason) {
    go();
    return true;
  }
  publish({ ...state, pending: go });
  return false;
}

/** The officer chose to leave anyway. */
export function proceedAnyway() {
  const go = state.pending;
  publish({ reason: null, pending: null });
  go?.();
}

/** The officer chose to stay. The work is still held, so `reason` survives. */
export function stayHere() {
  publish({ ...state, pending: null });
}
