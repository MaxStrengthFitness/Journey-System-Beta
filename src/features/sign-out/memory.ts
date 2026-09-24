/**
 * WHAT A MODULE REMEMBERS FOR WHOEVER IS SIGNED IN — forgotten at sign-out.
 *
 * Sign-out round, Sep 24 2026. Several screens keep a small memory in module
 * scope rather than in React state, on purpose: the Planner's tab, My Studio's
 * section, the Operations span, a Planner request waiting for the Planner to
 * mount. Module scope outlives every component, so it also outlived the
 * person. On a studio iPad the next trainer to sign in inherited it — a Life
 * Transformer landing on My Studio's Team section because the leader before
 * them had left it there.
 *
 * Each such module registers its own reset here, beside the variable it
 * resets, so the knowledge of what to forget stays with the thing that
 * remembers. A module that is lazy-loaded and never opened has registered
 * nothing — and has nothing to forget, because its memory is still at its
 * default.
 *
 * NO IMPORTS, on purpose: every module with a memory imports this one, so it
 * must never pull anything else into the main bundle.
 */

type Reset = () => void;

const resets = new Set<Reset>();

/**
 * Register what this module forgets when someone signs out. Returns the
 * unregister, for tests; a module registers once, at load, and never needs it.
 */
export function forgetOnSignOut(reset: Reset): () => void {
  resets.add(reset);
  return () => {
    resets.delete(reset);
  };
}

/**
 * Run every registered reset. One that throws does not stop the rest: a
 * half-forgotten iPad is the bug this exists to close.
 */
export function forgetPersonalMemory(): void {
  for (const reset of resets) {
    try {
      reset();
    } catch (err) {
      console.warn("[sign-out] a reset threw; the others still ran", err);
    }
  }
}
