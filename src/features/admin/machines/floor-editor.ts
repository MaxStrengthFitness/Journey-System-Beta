/**
 * THE FLOOR EDITOR — the pure half.
 *
 * Wave 2 of the Machine Catalog room (Catalog R5, AJ's "all yes", Sep 28
 * 2026): one floor editor, three doors. Learning → Catalog → {studio}'s floor
 * → Edit our floor, My Studio → Machines and Operations → Floor all open the
 * same screen (my-studio/MachinesSection, whose floor list is
 * StudioInventoryManager), and the Admins dashboard's studio page reaches the
 * same list. CLAUDE.md: "never a second editor".
 *
 * What a leader does there, and what this file decides for it:
 *
 *   the walking order   the floor, in the order it is walked (`onFloor`),
 *                       moved one place at a time (`moveInOrder`) or dragged,
 *                       saved in one batch, 1..n
 *   out of service      with a reason (features/catalog/out-of-service.ts)
 *   add from MSF        the MSF machines not on the floor (`addableFromMsf`):
 *                       the standard's first, then the rest of the catalog,
 *                       then the ones this studio switched off; a machine
 *                       added joins the END of a walking order the studio
 *                       keeps (`orderForNewMachine`), or its place in the
 *                       standard order when the studio keeps none
 *   a new machine       the studio machine editor, until the Machine Codex's
 *                       Guided forge exists
 *
 * PURE MODULE — no React, no Firestore.
 */
import type { MachineCatalogEntry, ResolvedMachine, StudioMachineRosterEntry } from "../../../types/machines";
import { isStandardSetMachine } from "../studios/registry";

/** The machines on the floor: on the roster and not switched off, in the order given (walking order). */
export function onFloor(machines: readonly ResolvedMachine[], rosteredIds: ReadonlySet<string>): ResolvedMachine[] {
  return machines.filter((m) => rosteredIds.has(m.machineId) && m.rosterStatus !== "inactive");
}

/** One MSF machine a leader could put on the floor. */
export interface Addable {
  machineId: string;
  name: string;
  /** On the roster, switched off: adding it switches it back on, with its local set-up. */
  switchedOff: boolean;
}

export interface AddableFromMsf {
  /** In the MSF standard set, not on this floor. */
  standard: Addable[];
  /** Everything else active in the catalog, not on this floor. */
  others: Addable[];
  /** Machines this studio switched off (catalog copies); adding one puts it back. */
  switchedOff: Addable[];
}

/**
 * What "Add from MSF" offers: the catalog's active machines that are not on
 * this floor. A retired catalog machine is never offered (it can't be added
 * to a floor); a studio's own machine is never here (it is on the floor, or
 * it was removed).
 */
export function addableFromMsf(input: {
  machines: readonly ResolvedMachine[];
  rosterEntries: readonly StudioMachineRosterEntry[];
  catalog: readonly MachineCatalogEntry[];
}): AddableFromMsf {
  const rostered = new Map(input.rosterEntries.map((e) => [e.machineId, e]));
  const catalogById = new Map(input.catalog.map((c) => [c.id, c]));
  const out: AddableFromMsf = { standard: [], others: [], switchedOff: [] };
  for (const m of input.machines) {
    const entry = rostered.get(m.machineId);
    const onTheFloor = entry && m.rosterStatus !== "inactive";
    if (onTheFloor) continue;
    if (m.source !== "catalog") continue;
    const c = catalogById.get(m.machineId);
    if (!c || c.status !== "active") continue;
    const item: Addable = { machineId: m.machineId, name: m.name, switchedOff: Boolean(entry) };
    if (entry) out.switchedOff.push(item);
    else if (isStandardSetMachine(c)) out.standard.push(item);
    else out.others.push(item);
  }
  return out;
}

/**
 * Where a machine added now goes in the walking order: after the last one,
 * when the studio keeps an order of its own (any entry on the roster carries
 * `order`), so it joins the end of the walk and moves nobody else; null when
 * the studio keeps none, so it takes its place in the MSF standard order like
 * every other machine on that floor.
 */
export function orderForNewMachine(rosterEntries: readonly StudioMachineRosterEntry[]): number | null {
  let max: number | null = null;
  for (const e of rosterEntries) {
    if (e.status === "inactive") continue;
    if (typeof e.order === "number" && Number.isFinite(e.order)) max = max === null ? e.order : Math.max(max, e.order);
  }
  return max === null ? null : max + 1;
}

/** The walking order with one machine moved `delta` places (−1 up, +1 down); unchanged at an end. */
export function moveInOrder(ids: readonly string[], index: number, delta: -1 | 1): string[] {
  const to = index + delta;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Whom a save of the walking order reaches, in one sentence. */
export function orderReach(studioName: string): string {
  return `Saves for everyone at ${studioName}: the Catalog, the Journey grid and the session walk the floor in this order.`;
}
