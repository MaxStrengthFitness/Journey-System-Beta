/**
 * BODY & PULSE → ON OUR FLOOR — per machine she is prescribed, what the team
 * has written about HER on it, then the Academy's set-up for a body her
 * height.
 *
 * Client codex, Sep 2026 (phase 12). AJ asked to "look at the body type and
 * almost know how I'd train this type of person". The honest version of that
 * is two things side by side, in a fixed order:
 *
 *   1. HER notes, always first — every open or standing journal thread tied
 *      to the machine (loudest first: a Critical "stop at 90°" above a
 *      standing "seat 7, gap 6"), then the machine notes the team marked
 *      important in her machine settings.
 *   2. The Academy's column for her stature band (shorter or taller than the
 *      height the catalog's machines are set for), QUOTED part by part —
 *      seat, pads and handles, special notes — never merged or reworded. A
 *      client within 3" of the baseline, or with no height, gets no column:
 *      the standard set-up applies, and the card says so once.
 *
 * Her own notes sit on top of the Academy's general advice because they were
 * written about her, on this floor. Nothing here suggests a load, a weight or
 * a value to type: the page describes, the trainer decides.
 *
 * The rows are the machines she is prescribed (Routine A in its order, then
 * B when B is on), then any other machine on this floor that carries a note
 * of hers. A prescribed machine with neither a note nor an Academy column is
 * counted, not drawn ("3 more of her machines use the standard set-up").
 *
 * While her routines, her settings or the catalog are still out (or failed),
 * the card claims nothing that depends on them (`floorReads`): no count of
 * machines on the standard set-up, no "not in her routines", no "0 of 16
 * machines set up".
 *
 * Pure: floor.test.ts. The notes come from Notes' one selector
 * (`threadsByMachine`, record-selectors.ts); the Academy text from the
 * catalog's `bodyTypeAdjustments`, the same field the machine window reads.
 */
import type { ClientMachineSetting, Machine, MachineNote, Routine } from "../../../types";
import type { BodyTypeAdjustments } from "../../../types/machines";
import type { JournalImportance } from "../../../types/journal";
import type { StatureBand } from "../../equipment/setting-suggestions";
import { toDate, studioDateKey } from "../../../lib/studio-time";
import { threadCardMeta } from "../../client-notes/record-selectors";
import type { NoteThread } from "../../client-notes/threads";
import { dayWords } from "./pulse-read";

export type HerNote =
  | {
      kind: "thread";
      key: string;
      threadId: string;
      importance: JournalImportance;
      body: string;
      meta: string;
    }
  | {
      kind: "machineNote";
      key: string;
      body: string;
      meta: string;
    };

export interface FloorRow {
  machineId: string;
  /** The machine's name, never shortened. */
  name: string;
  /** Which of her routines prescribe it; [] for a machine here only for her notes. */
  prescribedIn: ("A" | "B")[];
  hers: HerNote[];
  /** The Academy's column for her band, part by part, verbatim. [] within 3" or with no height. */
  academy: string[];
}

export interface FloorView {
  rows: FloorRow[];
  /** Prescribed machines with neither a note of hers nor an Academy column. */
  rest: number;
}

/** The Academy's column for a stature band, part by part, in the template's order. */
export function academyParts(
  adjustments: Partial<BodyTypeAdjustments> | null | undefined,
  band: StatureBand | null,
): string[] {
  if (!adjustments || (band !== "shorter" && band !== "taller")) return [];
  const col = band === "shorter" ? adjustments.shorterStature : adjustments.tallerStature;
  if (!col) return [];
  return [col.seatAdjustment, col.padHandlePlacement, col.specialNotes]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
}

function millisOf(v: unknown): number {
  const d = toDate(v as Parameters<typeof toDate>[0]);
  return d ? d.getTime() : 0;
}

/** Her machine notes the team marked important, newest first. */
function importantMachineNotes(setting: ClientMachineSetting | undefined, now: Date): HerNote[] {
  return (setting?.machineNotes ?? [])
    .filter((n): n is MachineNote => !!n && n.isImportant === true && (n.content ?? "").trim() !== "")
    .slice()
    .sort((a, b) => millisOf(b.timestamp) - millisOf(a.timestamp))
    .map((n, i) => {
      const d = toDate(n.timestamp as Parameters<typeof toDate>[0]);
      const when = d ? dayWords(studioDateKey(d), now) : "";
      const who = (n.authorName ?? "").trim();
      return {
        kind: "machineNote" as const,
        key: `mn:${n.id ?? i}`,
        body: n.content.trim(),
        meta: [who, when].filter(Boolean).join(", ") || "Machine note",
      };
    });
}

/**
 * The rows of On our floor. `byMachine` is `threadsByMachine(journal.threads,
 * today)` — open and standing threads per machine, loudest first. `bodyTypeOf`
 * looks up a machine's catalog `bodyTypeAdjustments`.
 */
export function floorRows({
  machines,
  routines,
  isBActive,
  clientSettings,
  byMachine,
  bodyTypeOf,
  band,
  today,
  now,
}: {
  machines: readonly Machine[];
  routines: readonly Routine[];
  isBActive: boolean;
  clientSettings: Readonly<Record<string, ClientMachineSetting>>;
  byMachine: ReadonlyMap<string, NoteThread[]>;
  bodyTypeOf: (machineId: string) => Partial<BodyTypeAdjustments> | null | undefined;
  band: StatureBand | null;
  /** The studio's day key, for a thread's meta. */
  today: string;
  now: Date;
}): FloorView {
  const floor = new Map<string, Machine>();
  for (const m of machines) if (m?.id) floor.set(m.id, m);

  const prescribed = new Map<string, ("A" | "B")[]>();
  const order: string[] = [];
  for (const name of ["A", "B"] as const) {
    if (name === "B" && !isBActive) continue;
    const routine = routines.find((r) => r.name === `Routine ${name}`);
    for (const id of routine?.machineIds ?? []) {
      if (!floor.has(id)) continue;
      const list = prescribed.get(id);
      if (list) {
        if (!list.includes(name)) list.push(name);
      } else {
        prescribed.set(id, [name]);
        order.push(id);
      }
    }
  }
  // Then any other floor machine that carries a note of hers, in the floor's order.
  const others = [...floor.values()]
    .filter((m) => !prescribed.has(m.id!) && (byMachine.get(m.id!)?.length ?? 0) > 0)
    .sort((a, b) => Number(a.order ?? 999) - Number(b.order ?? 999) || a.name.localeCompare(b.name))
    .map((m) => m.id!);

  const rows: FloorRow[] = [];
  let rest = 0;
  for (const id of [...order, ...others]) {
    const machine = floor.get(id)!;
    const threads: HerNote[] = (byMachine.get(id) ?? []).map((t) => ({
      kind: "thread" as const,
      key: `t:${t.id}`,
      threadId: t.id,
      importance: t.root.importance,
      body: (t.root.body ?? "").trim(),
      meta: threadCardMeta(t, today),
    }));
    const hers = [...threads, ...importantMachineNotes(clientSettings[id], now)];
    const academy = academyParts(bodyTypeOf(id), band);
    const prescribedIn = prescribed.get(id) ?? [];
    if (prescribedIn.length > 0 && hers.length === 0 && academy.length === 0) {
      rest += 1;
      continue;
    }
    rows.push({ machineId: id, name: (machine.fullName || machine.name || id).trim(), prescribedIn, hers, academy });
  }
  return { rows, rest };
}

/** The card's eyebrow: what the Academy column below is for. */
export function floorEyebrow(band: StatureBand | null, pronouns: { possessive: string }): string {
  if (band === "shorter") return "On our floor · set-up for a shorter body";
  if (band === "taller") return "On our floor · set-up for a taller body";
  return `On our floor · ${pronouns.possessive} notes by machine`;
}

/** Why there is no Academy column (average or no height); null when there is one. */
export function noAcademyLine(
  band: StatureBand | null,
  pronouns: { possessive: string; object: string },
): string | null {
  if (band === "average") {
    return `${pronouns.possessive.charAt(0).toUpperCase()}${pronouns.possessive.slice(1)} height is within 3" of what our machines are set for, so the standard set-up applies.`;
  }
  if (band === null)
    return `No height on file, so the Academy's shorter and taller set-ups can't be matched to ${pronouns.object}.`;
  return null;
}

/** Whether a read the card depends on has answered. */
export type FloorReadStatus = "loading" | "ready" | "failed";

export interface FloorReads {
  /**
   * Her routines and machine settings answered: only then may the card say
   * "not in her routines", count the machines on the standard set-up, or say
   * she has no machines.
   */
  programmeKnown: boolean;
  /** The Academy's column is known for every machine (or her band needs none). */
  academyKnown: boolean;
  /**
   * Machine fit's inputs — her settings, her routines and the catalog's
   * fields — answered: only then may its count ("14 of 16 machines set up")
   * or its verdict be said.
   */
  fit: FloorReadStatus;
  /** What the card says about each read that has not answered; [] when all did. */
  lines: string[];
}

/**
 * What On our floor may claim while its reads are out. A read that has not
 * come back is unknown, never "nothing": no "standard set-up" count while
 * the catalog (the Academy's text) or her routines are still out, and no
 * "0 of 16 machines set up" from an empty catalog.
 */
export function floorReads({
  band,
  programme,
  catalog,
  pronouns,
}: {
  band: StatureBand | null;
  /** Her routines and machine settings (CodexProgramming.status). */
  programme: FloorReadStatus;
  /** The machine catalog (useMachineCatalog's loading and failed). */
  catalog: FloorReadStatus;
  pronouns: { possessive: string };
}): FloorReads {
  const academyWanted = band === "shorter" || band === "taller";
  const Her = `${pronouns.possessive.charAt(0).toUpperCase()}${pronouns.possessive.slice(1)}`;
  const lines: string[] = [];
  if (programme === "loading") lines.push(`Loading ${pronouns.possessive} routines and machine settings…`);
  if (programme === "failed")
    lines.push(`${Her} routines or machine settings couldn't be loaded just now, so a machine may be missing.`);
  if (academyWanted && catalog === "loading") lines.push("Loading the Academy's set-up…");
  if (academyWanted && catalog === "failed")
    lines.push("The Academy's set-up couldn't be loaded just now, so it isn't shown.");
  const fit: FloorReadStatus =
    programme === "failed" || catalog === "failed"
      ? "failed"
      : programme === "loading" || catalog === "loading"
        ? "loading"
        : "ready";
  return {
    programmeKnown: programme === "ready",
    academyKnown: !academyWanted || catalog === "ready",
    fit,
    lines,
  };
}
