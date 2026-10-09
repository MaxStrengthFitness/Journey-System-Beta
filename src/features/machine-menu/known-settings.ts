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
 * Kept to the last 50 client-machine pairs, and forgotten at sign-out like
 * every module memory on a shared iPad.
 */
import { forgetOnSignOut } from "../sign-out/memory";
import { getBounded, setBounded } from "../../lib/bounded-map";

/** How many client-machine pairs are kept: far more than ten seconds of Undo needs. */
export const KNOWN_SETTINGS_KEYS = 50;

const known = new Map<string, Record<string, string>>();

forgetOnSignOut(() => {
  known.clear();
});

/** The settings document's own id shape (`clientMachineSettings/{clientId}_{machineId}`). */
const keyOf = (clientId: string, machineId: string) => `${clientId}_${machineId}`;

/** Note the settings map as it is now for this client on this machine. */
export function noteKnownSettings(clientId: string, machineId: string, settings: Readonly<Record<string, string>>): void {
  if (!clientId || !machineId) return;
  setBounded(known, keyOf(clientId, machineId), { ...settings }, KNOWN_SETTINGS_KEYS);
}

/** The settings map this iPad last knew for this client on this machine, or null. */
export function knownSettings(clientId: string, machineId: string): Record<string, string> | null {
  if (!clientId || !machineId) return null;
  const v = getBounded(known, keyOf(clientId, machineId));
  return v ? { ...v } : null;
}
