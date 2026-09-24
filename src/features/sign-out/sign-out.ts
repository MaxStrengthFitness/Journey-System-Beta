/**
 * SIGNING OUT — the next person on this iPad starts fresh.
 *
 * Sign-out round, Sep 24 2026. The app review found that signing out left the
 * last person's screen, app mode, selected client and studio in place, so on
 * a shared studio iPad the next person to sign in landed exactly where the
 * last one had been: their client open, and Operations still showing to a
 * Life Transformer who could never have opened it.
 *
 * The rule now: **a sign-out is a fresh load for the next person**, with two
 * exceptions that belong to the iPad or to the session rather than to the
 * person.
 *
 *  - KEPT: the studio this iPad is pinned to (lib/default-studio). A tablet on
 *    the Westlake floor should still open Westlake for the next trainer, and
 *    the pin is re-checked against that trainer's access before it is used.
 *  - KEPT: a note a trainer started mid-session and did not save
 *    (client-notes/session-draft). It belongs to the SESSION, not the person,
 *    and "nothing a trainer wrote about a client may be lost by the app".
 *  - FORGOTTEN: everything else. Local storage apart from the pin; the
 *    one-shot handoffs in session storage (a profile told to open on Setup);
 *    every module memory registered in ./memory; and all of React's state,
 *    because App remounts the whole signed-in tree on `personKey`.
 *
 * PURE apart from the storage it is handed, so it is tested without a device.
 */

import { DEFAULT_STUDIO_KEY } from "../../lib/default-studio";
import { STORE_PREFIX as PROFILE_NAV_PREFIX } from "../client-profile/profile-nav";
import { PREFIX as SETUP_HINT_PREFIX } from "../machine-fit/ui/open-hint";
import { forgetPersonalMemory } from "./memory";

/** The part of the Web Storage interface this module uses. */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

/** Local-storage keys that belong to the iPad, not to whoever is signed in. */
export const DEVICE_KEYS: readonly string[] = [DEFAULT_STUDIO_KEY];

/**
 * Session-storage keys, by prefix, that are one-shot handoffs from one screen
 * to the next: written by a tap, read once by the screen it opens. Left
 * behind, the next person's first tap on that client obeys the last person's.
 * Note drafts (`msf_session_note:`) are deliberately NOT here — see the top.
 */
export const SESSION_HANDOFF_PREFIXES: readonly string[] = [PROFILE_NAV_PREFIX, SETUP_HINT_PREFIX];

/** Clear local storage, keeping only what belongs to the iPad. */
export function clearPersonalStorage(storage: StorageLike | null | undefined): void {
  if (!storage) return;
  try {
    const kept = DEVICE_KEYS.map((key) => [key, storage.getItem(key)] as const);
    storage.clear();
    for (const [key, value] of kept) {
      if (value !== null) storage.setItem(key, value);
    }
  } catch (err) {
    // Private window or storage disabled: nothing was stored to leak.
    console.warn("[sign-out] could not clear local storage", err);
  }
}

/** Remove the one-shot handoffs from session storage; leave everything else. */
export function clearSessionHandoffs(storage: StorageLike | null | undefined): void {
  if (!storage) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && SESSION_HANDOFF_PREFIXES.some((prefix) => key.startsWith(prefix))) doomed.push(key);
    }
    // Collected first: removing while walking by index skips the next key.
    for (const key of doomed) storage.removeItem(key);
  } catch (err) {
    console.warn("[sign-out] could not clear session handoffs", err);
  }
}

/** Everything a sign-out forgets, in one call. Safe to call twice. */
export function endPersonalSession(stores: {
  local?: StorageLike | null;
  session?: StorageLike | null;
}): void {
  clearPersonalStorage(stores.local);
  clearSessionHandoffs(stores.session);
  forgetPersonalMemory();
}

/** The key the signed-in tree carries while nobody is known. */
export const SIGNED_OUT = "signed-out";

/**
 * Who is using the app, as a React key: App remounts everything under it when
 * this changes, which is what resets every screen, mode and selection at once
 * — including any added after this round, which a list of setters would miss.
 *
 * Signed in AND known, not merely signed in. The Firebase user arrives a beat
 * before the trainer profile, and a Microsoft account from outside the
 * company is signed in and straight back out by the sign-in screen, which
 * then shows why. Keying on the bare uid would remount that screen between
 * the two and lose the sentence.
 */
export function personKey(
  user: { uid?: string | null } | null | undefined,
  trainer: object | null | undefined,
): string {
  return user?.uid && trainer ? user.uid : SIGNED_OUT;
}

/**
 * Did the signed-in person just change, so that what the last one left must
 * go? `previous` is undefined before Firebase has answered at all — a reload,
 * which keeps its person and forgets nothing. From nobody to somebody is a
 * sign-in: the sign-out before it already forgot.
 */
export function personChanged(
  previous: string | null | undefined,
  next: string | null,
): boolean {
  return typeof previous === "string" && previous !== next;
}
