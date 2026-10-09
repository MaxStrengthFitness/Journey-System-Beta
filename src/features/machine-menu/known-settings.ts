/**
 * THE MACHINE MENU — what this iPad last knew of a client's settings on a
 * machine, for the toast's Undo (the open session round's review, Oct 9
 * 2026).
 *
 * Set up's Save closes the card, and the app's toast keeps its Undo for ten
 * seconds. That Undo runs with the card gone, so it has no settings of its
 * own to read; and a later save on the same client and machine (Set up
 * again, another dial) must not be taken back with it. So each card notes
 * here what it was given while open and what each of its saves and undos
 * wrote, and the toast's Undo is laid onto the newest (`undoOnto`,
 * setting-draft.ts) when it is tapped.
 *
 * Only this iPad's knowledge: another iPad's change made while no card was
 * open isn't here, and then the Undo is what it always was, the save's own.
 * Kept to the last 50 owner-machine pairs, and forgotten at sign-out like
 * every module memory on a shared iPad.
 *
 * The OWNER of a set-up is a client's id, or `held:{sessionId}` for an open
 * session's set-up kept on the session until its client is chosen (the
 * machine card's `hold`; features/open-session): the two never share a key.
 */
import { forgetOnSignOut } from "../sign-out/memory";
import { getBounded, setBounded } from "../../lib/bounded-map";

/** How many owner-machine pairs are kept: far more than ten seconds of Undo needs. */
export const KNOWN_SETTINGS_KEYS = 50;

const known = new Map<string, Record<string, string>>();

forgetOnSignOut(() => {
  known.clear();
});

/** A client's settings document's own id shape (`clientMachineSettings/{clientId}_{machineId}`), or `held:{sessionId}_{machineId}`. */
const keyOf = (ownerKey: string, machineId: string) => `${ownerKey}_${machineId}`;

/** Note the settings map as it is now for this owner (a client's id, or `held:{sessionId}`) on this machine. */
export function noteKnownSettings(ownerKey: string, machineId: string, settings: Readonly<Record<string, string>>): void {
  if (!ownerKey || !machineId) return;
  setBounded(known, keyOf(ownerKey, machineId), { ...settings }, KNOWN_SETTINGS_KEYS);
}

/** The settings map this iPad last knew for this owner on this machine, or null. */
export function knownSettings(ownerKey: string, machineId: string): Record<string, string> | null {
  if (!ownerKey || !machineId) return null;
  const v = getBounded(known, keyOf(ownerKey, machineId));
  return v ? { ...v } : null;
}
