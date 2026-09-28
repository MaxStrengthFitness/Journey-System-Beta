/**
 * TAKING ONE OF THE CATALOG'S SAFETY LINES OFF A COPY, AND PUTTING IT BACK —
 * the Sep 21 rule in the editor (built Sep 28 2026). PURE.
 *
 * A copy's safety list, as the editor holds it, is the catalog's lines this
 * unit keeps followed by the studio's own. Taking a catalog line off drops
 * it from the list and adds a removal record carrying the reason, who and
 * when (`removalRecord`); putting it back does the opposite, in the
 * catalog's own order. The write gate (`scopeOverrides`) refuses a list
 * missing a catalog line with no record, so the two always travel together.
 */

import type { MachineDefinition, RemovedSafetyLine, SafetyListField } from "../../../../types/machines";
import { safetyLineKey } from "../../../../lib/resolve-machine";
import { removalRecord } from "../../../../lib/machine-template";

const norm = (v: unknown): string => {
  const walk = (x: unknown): unknown => {
    if (typeof x === "string") return x.trim();
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(x as Record<string, unknown>).sort()) {
        const y = (x as Record<string, unknown>)[k];
        if (y !== undefined && y !== "") out[k] = walk(y);
      }
      return out;
    }
    return x;
  };
  return JSON.stringify(walk(v));
};

function sameLine(field: SafetyListField, a: unknown, b: unknown): boolean {
  if (typeof a === "string" || typeof b === "string") {
    return safetyLineKey(field, a).toLowerCase() === safetyLineKey(field, b).toLowerCase();
  }
  return norm(a) === norm(b);
}

/** The catalog's lines this copy keeps, and the studio's own, from the list as it stands. */
export function splitSafety(
  field: SafetyListField,
  current: readonly unknown[] | undefined,
  standard: readonly unknown[] | undefined,
): { inherited: unknown[]; own: unknown[] } {
  const list = [...(current ?? [])];
  const std = [...(standard ?? [])];
  const inherited = std.filter((s) => list.some((c) => sameLine(field, c, s)));
  const own = list.filter((c) => !std.some((s) => sameLine(field, c, s)));
  return { inherited, own };
}

/** The records for one list. */
export function removedFrom(value: Partial<MachineDefinition>, field: SafetyListField): RemovedSafetyLine[] {
  return (value.removedSafety ?? []).filter((r) => r.field === field);
}

/**
 * Take a catalog line off: the list without it, and the records with its
 * reason added (replacing an older record for the same line).
 */
export function takeOff(
  value: Partial<MachineDefinition>,
  field: SafetyListField,
  entry: unknown,
  reason: string,
  by: { uid: string; name: string },
  now: Date = new Date(),
): { list: unknown[]; records: RemovedSafetyLine[] } {
  const current = (value[field] as unknown[] | undefined) ?? [];
  const line = safetyLineKey(field, entry);
  const list = current.filter((c) => !sameLine(field, c, entry));
  const others = (value.removedSafety ?? []).filter(
    (r) => !(r.field === field && r.line.trim().toLowerCase() === line.toLowerCase()),
  );
  return { list, records: [...others, removalRecord({ field, line }, reason, by, now)] };
}

/**
 * Put a catalog line back: in the catalog's own order among the lines kept,
 * the studio's own after them, and its record gone.
 */
export function putBack(
  value: Partial<MachineDefinition>,
  standard: Partial<MachineDefinition>,
  field: SafetyListField,
  line: string,
): { list: unknown[]; records: RemovedSafetyLine[] } {
  const current = (value[field] as unknown[] | undefined) ?? [];
  const std = (standard[field] as unknown[] | undefined) ?? [];
  const { inherited, own } = splitSafety(field, current, std);
  const back = std.find((s) => safetyLineKey(field, s).toLowerCase() === line.trim().toLowerCase());
  const kept = std.filter((s) => inherited.includes(s) || s === back);
  const records = (value.removedSafety ?? []).filter(
    (r) => !(r.field === field && r.line.trim().toLowerCase() === line.trim().toLowerCase()),
  );
  return { list: [...kept, ...own], records };
}
