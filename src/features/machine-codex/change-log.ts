/**
 * A CATALOG MACHINE'S CHANGE LOG — what changed on a standard machine, when,
 * and by whom, in plain words (the Codex's question 1, "later" on Sep 28
 * 2026; built Sep 29 2026, catalog wave 3).
 *
 * PURE: no React, no Firestore (change-log-store.ts writes and reads).
 *
 *   machines/{machineId}/changes/{changeId}
 *     { at, by: { uid, name }, kind: "created" | "edited", fields: [...] }
 *
 *   at      the server's time (the rules pin it)
 *   by      the Auth uid (never the trainer document's id) and the name as
 *           the app knew it — `features/machine-codex/who.ts`
 *   kind    "created" when the machine was added to the catalog (or published
 *           from a studio's offer), "edited" for every save after
 *   fields  the DEFINITION FIELDS the save wrote — the diff, never the whole
 *           machine, and never the values: the values are on the machine
 *           itself, and a log that copied them would double every write
 *
 * The words a reader sees come from `FIELD_LABELS` (lib/machine-template.ts,
 * the same words Compare and a studio's "changed" line use), so the record
 * stores keys and the sentence follows the app's vocabulary as it changes.
 * A field with no label is said by its key rather than dropped: a true
 * sentence with one odd word beats a silent gap.
 *
 * Append-only. Written only by the catalog editor's save, after the machine's
 * own write has landed; read on the machine's Catalog page by anyone signed
 * in (Learning → Catalog → a machine → What changed), where a read that fails
 * says so and never "nothing has changed".
 */

import { FIELD_LABELS, DEFINITION_KEYS } from "../../lib/machine-template";
import type { MachineDefinitionField } from "../../types/machines";
import { formatStudioDate, formatStudioTime } from "../../lib/studio-time";
import type { Person } from "./who";

export type MachineChangeKind = "created" | "edited";

export interface MachineChange {
  id: string;
  /** ms since epoch; 0 while the server's time isn't known yet. */
  at: number;
  by: Person;
  kind: MachineChangeKind;
  fields: string[];
}

/** The document as the rules pin it. Exactly this shape, nothing else. */
export interface MachineChangeDocument {
  by: Person;
  kind: MachineChangeKind;
  fields: string[];
}

/** Long enough for every field of a machine at once; the rules say the same. */
export const MAX_CHANGE_FIELDS = 80;

const KNOWN = new Set<string>(DEFINITION_KEYS as readonly string[]);

/**
 * The fields a save changed, as the log records them: definition fields
 * only (a stamp, an id or a catalog field is not a change to what the
 * machine IS), each once, in the definition's own order so two saves of the
 * same fields read the same.
 */
export function changedFields(keys: Iterable<string>): string[] {
  const wanted = new Set<string>();
  for (const k of keys) if (KNOWN.has(k)) wanted.add(k);
  return (DEFINITION_KEYS as readonly string[]).filter((k) => wanted.has(k)).slice(0, MAX_CHANGE_FIELDS);
}

/** The document to write, or null when there is nothing to record. */
export function changeDocument(kind: MachineChangeKind, fields: string[], by: Person): MachineChangeDocument | null {
  const recorded = changedFields(fields);
  if (kind === "edited" && recorded.length === 0) return null;
  return { by: { uid: by.uid, name: by.name }, kind, fields: recorded };
}

function millisOf(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number; seconds?: number } | null;
  if (v && typeof v.toMillis === "function") {
    const ms = v.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (v && typeof v.seconds === "number") return v.seconds * 1000;
  return 0;
}

/** One stored document as a change, or null when it isn't one. */
export function changeOf(id: string, data: unknown): MachineChange | null {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;
  const kind = d.kind === "created" || d.kind === "edited" ? d.kind : null;
  if (!kind) return null;
  const by = d.by as { uid?: unknown; name?: unknown } | null;
  if (!by || typeof by.uid !== "string" || !by.uid) return null;
  const fields = Array.isArray(d.fields) ? d.fields.filter((f): f is string => typeof f === "string") : [];
  return {
    id,
    at: millisOf(d.at),
    by: { uid: by.uid, name: typeof by.name === "string" && by.name.trim() ? by.name.trim() : "An administrator" },
    kind,
    fields,
  };
}

/** Every stored document that is a change, newest first; a write still on its way (no time yet) first of all. */
export function changesOf(docs: ReadonlyArray<{ id: string; data: unknown }>): MachineChange[] {
  return docs
    .map((d) => changeOf(d.id, d.data))
    .filter((c): c is MachineChange => c !== null)
    .sort((a, b) => (a.at === 0 ? -1 : b.at === 0 ? 1 : b.at - a.at));
}

/** The word for a field: FIELD_LABELS' where it has one, else the key itself. */
export function fieldWord(field: string): string {
  return FIELD_LABELS[field as MachineDefinitionField] ?? field;
}

/** "the stop rules", "the stop rules and the starting weight", "the stop rules, the dials and the starting weight". */
function listWords(words: string[]): string {
  const said = words.map((w) => (/^the /.test(w) ? w : `the ${w}`));
  if (said.length <= 1) return said[0] ?? "";
  return `${said.slice(0, -1).join(", ")} and ${said[said.length - 1]}`;
}

/**
 * The sentence: who did what. "Elrond Peredhel changed the stop rules and
 * the starting weight." / "Elrond Peredhel added it to the catalog." A
 * change that names no field (an older record, or one whose fields have all
 * since left the format) still says who saved it.
 */
export function changeSentence(c: MachineChange): string {
  if (c.kind === "created") return `${c.by.name} added it to the catalog.`;
  if (c.fields.length === 0) return `${c.by.name} saved it.`;
  return `${c.by.name} changed ${listWords(c.fields.map(fieldWord))}.`;
}

/** "Sep 29, 2:41 PM" in the studio's zone; null while the time isn't known. */
export function changeWhen(c: MachineChange, tz?: string): string | null {
  return c.at > 0
    ? `${formatStudioDate(c.at, { month: "short", day: "numeric", year: "numeric" }, tz)}, ${formatStudioTime(c.at, tz)}`
    : null;
}

export type ChangesRead =
  | { state: "loading" }
  | { state: "unreadable" }
  | { state: "ready"; changes: MachineChange[] };
