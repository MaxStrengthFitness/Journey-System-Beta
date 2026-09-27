/**
 * WHAT THE SERVER LAST SAID, AND WHETHER THIS APP NEEDS A RELOAD
 * (new-version round, Sep 26 2026).
 *
 * One small store, outside React, because the first to hear of a failed screen
 * is main.tsx's `vite:preloadError` listener, before any component knows. The
 * hook, the line and both boundaries read it.
 *
 *   check()       Ask the server which build is live. An answer younger than
 *                 `maxAgeMs` is reused (a minute by default, so coming back to
 *                 the app over and over asks once); asks in flight are
 *                 shared. Returns the live build, or null when there was no
 *                 answer.
 *   markBroken()  A screen or panel of THIS page could not be loaded. React
 *                 remembers the failure until the page reloads, so a reload
 *                 is wanted even when the server still has this build (it was
 *                 the connection).
 *
 * `reloadTarget` is what a reload would be FOR: the live build when it is a
 * new one, otherwise this build again when something is broken, otherwise
 * nothing. The loop guard (reload-once.ts) is keyed by it.
 *
 * No person's data is held here, so sign-out has nothing to forget.
 */

import { APP_BUILD, fetchLiveBuild, isNewBuild } from "./build";

export interface VersionState {
  /** The build the server last named; null before any answer. */
  live: string | null;
  /** When that answer came. */
  answeredAt: number | null;
  /** The last ask got no answer. */
  unreachable: boolean;
  /** A screen or panel of this page could not be loaded. */
  broken: boolean;
}

export interface VersionStore {
  get(): VersionState;
  subscribe(listener: () => void): () => void;
  check(options?: { maxAgeMs?: number }): Promise<string | null>;
  markBroken(): void;
}

/** Coming back to the app asks at most once a minute. */
export const CHECK_REUSE_MS = 60_000;

export function createVersionStore(deps: {
  fetchLive: () => Promise<string | null>;
  now: () => number;
}): VersionStore {
  let state: VersionState = { live: null, answeredAt: null, unreachable: false, broken: false };
  let inFlight: Promise<string | null> | null = null;
  const listeners = new Set<() => void>();

  const set = (patch: Partial<VersionState>) => {
    const next = { ...state, ...patch };
    if (
      next.live === state.live &&
      next.answeredAt === state.answeredAt &&
      next.unreachable === state.unreachable &&
      next.broken === state.broken
    ) {
      return;
    }
    state = next;
    for (const l of Array.from(listeners)) l();
  };

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    check(options) {
      const maxAgeMs = options?.maxAgeMs ?? CHECK_REUSE_MS;
      const fresh =
        !state.unreachable &&
        state.answeredAt !== null &&
        deps.now() - state.answeredAt >= 0 &&
        deps.now() - state.answeredAt < maxAgeMs;
      if (fresh) return Promise.resolve(state.live);
      if (inFlight) return inFlight;
      inFlight = deps
        .fetchLive()
        .catch(() => null)
        .then((live) => {
          inFlight = null;
          if (live === null) set({ unreachable: true });
          else set({ live, answeredAt: deps.now(), unreachable: false });
          return live;
        });
      return inFlight;
    },
    markBroken() {
      set({ broken: true });
    },
  };
}

/** True when a reload would bring something: a new build, or a broken screen back. */
export function reloadWanted(state: VersionState, running: string): boolean {
  return isNewBuild(running, state.live) || state.broken;
}

/** What a reload is for, for the loop guard; null when none is wanted. */
export function reloadTarget(state: VersionState, running: string): string | null {
  if (isNewBuild(running, state.live)) return state.live;
  if (state.broken) return `again:${running}`;
  return null;
}

/** The app's one store, for this build. */
export const versionStore: VersionStore = createVersionStore({
  fetchLive: () => fetchLiveBuild(),
  now: () => Date.now(),
});

/** Whether this app wants a reload now, by the app's one store. */
export function appReloadWanted(): boolean {
  return reloadWanted(versionStore.get(), APP_BUILD);
}
