/**
 * ME / EVERYONE (hub cherry round, Sep 28 2026). focus.test.ts.
 *
 * Hub direction B: "Focus: [ Me | Everyone ]. 'Everyone' makes all columns
 * equal" — for a leader watching the whole floor, or anyone who wants the
 * calm grid as it was. Me is your own column, in words (the focus column:
 * your-day.ts, HubGrid `focusId`, HubCard `wordy`).
 *
 *   - Me by default: the round is your own day read in words.
 *   - Offered only to someone with a column on the day on screen; with no
 *     column there is nothing to focus on, and every column is alike.
 *   - Remembered on this iPad, in local storage, which a sign-out clears
 *     with everything else the person left (features/sign-out) — so the next
 *     trainer on a shared iPad starts on Me. No module memory, so nothing to
 *     register with `forgetOnSignOut`.
 *   - Storage refused (a private window) or unreadable: Me, and the choice
 *     still holds for the visit.
 */

export type HubFocus = "me" | "everyone";

export const FOCUS_KEY = "journey.hub.focus";
export const DEFAULT_FOCUS: HubFocus = "me";

/** The part of the Web Storage interface this reads. */
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function localStore(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readFocus(storage: StorageLike | null = localStore()): HubFocus {
  try {
    return storage?.getItem(FOCUS_KEY) === "everyone" ? "everyone" : DEFAULT_FOCUS;
  } catch {
    return DEFAULT_FOCUS;
  }
}

export function writeFocus(focus: HubFocus, storage: StorageLike | null = localStore()): void {
  try {
    storage?.setItem(FOCUS_KEY, focus);
  } catch {
    // Storage refused: the choice still holds for this visit.
  }
}

/** The focus column's id: yours on Me, none on Everyone or when you have no column. */
export function focusColumnId(focus: HubFocus, myColumnId: string | null): string | null {
  return focus === "me" ? myColumnId : null;
}
