/**
 * SETTINGS HELD ON THE SESSION (the open session round, Oct 9 2026; finding 4
 * of `docs/rounds/2026-10-09-open-session.md`, AJ's pick "3a" and his OK for
 * the one new field on the session record).
 *
 * An open session has no client until Who's this?. The machine card's Save
 * used to write what was typed meanwhile to `clientMachineSettings/_{machineId}`
 * with `clientId: ""`: one ghost record per machine, shared by every open
 * session at every studio, read by nobody, and never moved to the client.
 *
 * Now the values are KEPT ON THE SESSION, `sessions/{id}.heldSetup.{machineId}`
 * = `{ values, sources?, at, byUid }` (`sources` only for a value the trainer
 * took from a suggestion, so machine fit never learns from its own guess):
 * one update, issued and never awaited (`held-store.ts`). The card reads them
 * back as what is saved, so reopening shows them and the Now Bar's Set up
 * counts them. Nothing else is written for them while there is no client: no
 * setting history, no journal copy and no machine-fit row.
 *
 * At Assign (Who's this?, or at Finish) each machine's values are saved to
 * the chosen client, in the assign's own batch, and `heldSetup` is deleted
 * in that same write (`heldMoves` below, then `queueHeldMoves`): all of it
 * lands, or none of it does and the values are still on the session. The
 * journal copy and the machine-fit row go only once that batch has
 * committed. What the client already had is read for the move, and only the
 * SERVER's answer says what is on file: without it no first set-up is
 * claimed and no fit row is written (it would replace the client's whole
 * row with only the held dials; the rebuild or the next save remakes it).
 *
 * Pure: held-setup.test.ts.
 */
import type { ClientMachineSetting, HeldSetupEntry, WorkoutSession } from "../../types";

/** Where a held value came from when it isn't typed: `HeldSetupEntry.sources`'s own values, declared once there. */
export type HeldSource = NonNullable<HeldSetupEntry["sources"]>[string];

/** The line the card says while it keeps the settings on the session. */
export const HELD_SETUP_LINE = "Kept on this session · saved to the client when you choose them";

/** A dial map as stored: trimmed strings, a dial with no value left out. */
export function cleanHeldValues(values: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!values || typeof values !== "object" || Array.isArray(values)) return out;
  for (const [key, v] of Object.entries(values as Record<string, unknown>)) {
    if (!key || (typeof v !== "string" && typeof v !== "number")) continue;
    const s = String(v).trim();
    if (s) out[key] = s;
  }
  return out;
}

/**
 * The sources worth keeping beside the values: a dial that has a value and
 * came from a suggestion (or the FileMaker chart). "typed" is the default
 * and is not stored, as on a client's settings.
 */
export function cleanHeldSources(sources: unknown, values: Readonly<Record<string, string>>): Record<string, HeldSource> {
  const out: Record<string, HeldSource> = {};
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) return out;
  for (const [key, v] of Object.entries(sources as Record<string, unknown>)) {
    if ((v === "suggested" || v === "legacy") && values[key]) out[key] = v;
  }
  return out;
}

/** A machine id that can be written as a plain dotted field path (`heldSetup.m-leg-press`). */
const PLAIN_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Where one machine's held set-up is written as a dotted field path, or null
 * for an id a dotted path can't carry (the writer then names the field with a
 * `FieldPath`, which takes any id). Every machine id Journey makes is plain.
 */
export function heldSetupField(machineId: string): string | null {
  return PLAIN_ID.test(machineId) ? `heldSetup.${machineId}` : null;
}

/**
 * One machine's entry as written. `at` is `serverTimestamp()`, passed in so
 * this stays pure. `sources` only when one isn't typed: Firestore refuses
 * undefined, and an empty map says nothing.
 */
export function heldSetupEntry(values: unknown, byUid: string, at: unknown, sources?: unknown): HeldSetupEntry {
  const clean = cleanHeldValues(values);
  const src = cleanHeldSources(sources, clean);
  return { values: clean, ...(Object.keys(src).length > 0 ? { sources: src } : {}), at, byUid };
}

/** What the session holds, machine id → its values; a machine with none left out. */
export function heldValuesOf(
  session: Pick<WorkoutSession, "heldSetup"> | null | undefined,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const held = session?.heldSetup;
  if (!held || typeof held !== "object" || Array.isArray(held)) return out;
  for (const [machineId, entry] of Object.entries(held)) {
    if (!machineId || !entry || typeof entry !== "object") continue;
    const values = cleanHeldValues((entry as Partial<HeldSetupEntry>).values);
    if (Object.keys(values).length > 0) out[machineId] = values;
  }
  return out;
}

/** Where each held value came from, machine id → its non-typed sources; a machine with none left out. */
export function heldSourcesOf(
  session: Pick<WorkoutSession, "heldSetup"> | null | undefined,
): Record<string, Record<string, HeldSource>> {
  const out: Record<string, Record<string, HeldSource>> = {};
  const held = session?.heldSetup;
  if (!held || typeof held !== "object" || Array.isArray(held)) return out;
  for (const [machineId, entry] of Object.entries(held)) {
    if (!machineId || !entry || typeof entry !== "object") continue;
    const e = entry as Partial<HeldSetupEntry>;
    const src = cleanHeldSources(e.sources, cleanHeldValues(e.values));
    if (Object.keys(src).length > 0) out[machineId] = src;
  }
  return out;
}

/**
 * Who kept each machine's set-up, machine id → their sign-in uid (`byUid`):
 * at Assign the client's settings, history row and journal copy are signed
 * by the person who typed it, not by whoever chose the client (the
 * whole-branch review, Oct 9 2026: a take-over credited the wrong trainer).
 */
export function heldAuthorsOf(
  session: Pick<WorkoutSession, "heldSetup"> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  const held = session?.heldSetup;
  if (!held || typeof held !== "object" || Array.isArray(held)) return out;
  for (const [machineId, entry] of Object.entries(held)) {
    if (!machineId || !entry || typeof entry !== "object") continue;
    const by = (entry as Partial<HeldSetupEntry>).byUid;
    if (typeof by === "string" && by.trim()) out[machineId] = by.trim();
  }
  return out;
}

/** The session has a `heldSetup` field to clear at Assign (even one an Undo emptied). */
export function hasHeldSetup(session: Pick<WorkoutSession, "heldSetup"> | null | undefined): boolean {
  const held = session?.heldSetup;
  return !!held && typeof held === "object" && !Array.isArray(held) && Object.keys(held).length > 0;
}

/**
 * The held set-up in the shape the card and the Now Bar read a client's
 * saved settings (`ClientMachineSetting` by machine id), so the card opens on
 * them and reopening shows them, with where a suggested value came from (so
 * a later save keeps it "suggested"). A read model only, never written:
 * there is no client, so `clientId` is empty and nothing else is on it.
 */
export function heldAsSettings(
  held: Readonly<Record<string, Readonly<Record<string, string>>>>,
  sources: Readonly<Record<string, Readonly<Record<string, HeldSource>>>> = {},
): Record<string, ClientMachineSetting> {
  const out: Record<string, ClientMachineSetting> = {};
  for (const [machineId, values] of Object.entries(held)) {
    const src = sources[machineId];
    out[machineId] = {
      clientId: "",
      machineId,
      settings: { ...values },
      ...(src && Object.keys(src).length > 0 ? { sources: { ...src } } : {}),
      updatedBy: "",
      updatedAt: null,
    };
  }
  return out;
}

/** A stable key for a held map (its values, or its sources): the same map, the same key (for a memo). */
export function heldKey(held: Readonly<Record<string, Readonly<Record<string, string>>>>): string {
  return JSON.stringify(
    Object.keys(held)
      .sort()
      .map((m) => [m, Object.keys(held[m]).sort().map((k) => [k, held[m][k]])]),
  );
}

/**
 * At Assign, one machine's draft for the client: what the client already has
 * on the machine, with each dial the held set-up set laid over it. A held
 * value wins ONLY for the dials it set; every other dial stays as the client
 * has it. (`saveSettings`' `dialsOnly` then writes only the held dials, by
 * name, so the database keeps the client's other dials too, whatever this
 * iPad had read of them: a cold cache or a read that never answered can't
 * wipe a saved seat.)
 */
export function heldOverSaved(saved: unknown, held: unknown): Record<string, string> {
  return { ...cleanHeldValues(saved), ...cleanHeldValues(held) };
}

/** A dial as a move hands it to `saveSettings` (`SettingFieldSpec` fits). */
export interface MoveField {
  key: string;
  label: string;
  type: "enum" | "number" | "text";
  ghost: string | null;
  absolute: boolean;
}

/** What the client already has on a machine, as far as this iPad read it. */
export interface OnFile {
  settings?: Record<string, unknown> | null;
  sources?: Record<string, unknown> | null;
  fitAcks?: Record<string, { value?: unknown } | undefined> | null;
}

/** One machine's move from the session to the client. */
export interface HeldMove<F extends MoveField = MoveField> {
  machineId: string;
  /** The machine's dials, then any held dial its list doesn't show, by its key: nothing held is dropped. */
  fields: F[];
  /** What the client has on file, as far as this iPad read it (the history row's "from"; empty when unread). */
  saved: Record<string, string>;
  /** `saved` with the held values laid over it (`heldOverSaved`). */
  draft: Record<string, string>;
  /** The held dials: written by name whatever `saved` says (`saveSettings`' `writeDials`), so a stale copy can't drop one. */
  writeDials: string[];
  /** Where a held value came from when it isn't typed ("suggested"): `saveSettings`' `changedSources`. */
  changedSources: Record<string, HeldSource>;
  /**
   * Nothing on file, by the SERVER's answer: the client's history row says
   * "Initial setup". An unread or cache-only answer never claims it.
   */
  firstSetup: boolean;
  /**
   * The server answered, so `saved` is the client's whole map and the
   * machine-fit row (written whole, `rows.{clientId}`) can be built from it.
   * Otherwise no row: it would replace the client's other dials and their
   * reviews with only the held ones.
   */
  fitRow: boolean;
  sources: Record<string, unknown> | null;
  fitAcks: OnFile["fitAcks"];
}

/**
 * Every held machine's move to the client, in a steady order. A machine
 * whose held values change nothing this iPad can see is still listed (its
 * held dials are written by name all the same); the caller clears
 * `heldSetup` once every move is queued.
 *
 * `serverAnswered`: `onFile` is the server's answer to the read of the
 * client's settings, so a machine it doesn't list has nothing saved. False
 * (no read, the iPad's copy only, or the server slower than the wait), and
 * nothing on file is claimed: no first set-up, no fit row.
 */
export function heldMoves<F extends MoveField>(f: {
  held: Readonly<Record<string, Readonly<Record<string, string>>>>;
  sources?: Readonly<Record<string, Readonly<Record<string, HeldSource>>>>;
  onFile: Readonly<Record<string, OnFile | null | undefined>>;
  serverAnswered?: boolean;
  fieldsOf: (machineId: string) => F[];
}): HeldMove<F | MoveField>[] {
  const out: HeldMove<F | MoveField>[] = [];
  const serverAnswered = f.serverAnswered === true;
  for (const machineId of Object.keys(f.held).sort()) {
    const values = cleanHeldValues(f.held[machineId]);
    if (Object.keys(values).length === 0) continue;
    const own = f.fieldsOf(machineId);
    const known = new Set(own.map((x) => x.key));
    const extra: MoveField[] = Object.keys(values)
      .filter((k) => !known.has(k))
      .map((k) => ({ key: k, label: k, type: "text", ghost: null, absolute: false }));
    const onFile = f.onFile[machineId] ?? null;
    const saved = cleanHeldValues(onFile?.settings);
    out.push({
      machineId,
      fields: [...own, ...extra],
      saved,
      draft: heldOverSaved(saved, values),
      writeDials: Object.keys(values).sort(),
      changedSources: cleanHeldSources(f.sources?.[machineId], values),
      firstSetup: serverAnswered && Object.keys(saved).length === 0,
      fitRow: serverAnswered,
      sources: onFile?.sources && typeof onFile.sources === "object" ? { ...onFile.sources } : null,
      fitAcks: onFile?.fitAcks ?? null,
    });
  }
  return out;
}

/**
 * A keep refused because the session already has its client (the review,
 * Oct 9 2026): an Undo that outlived Assign (the toast's ten seconds, or a
 * card still open) would write `heldSetup` onto a session nobody moves it
 * from again. The card says where the settings are instead.
 */
export function heldClosedError(clientName: string): Error {
  return Object.assign(new Error("The session has its client: the set-up was saved to them."), { heldClosedFor: clientName || "" });
}

/** The client's name a keep was refused for (`heldClosedError`), or null for any other refusal. */
export function heldClosedFor(error: unknown): string | null {
  const v = (error as { heldClosedFor?: unknown } | null)?.heldClosedFor;
  return typeof v === "string" ? v : null;
}
