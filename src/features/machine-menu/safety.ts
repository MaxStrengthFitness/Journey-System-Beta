/**
 * THE MACHINE MENU — what goes in the safety strip, and how many things it says.
 *
 * The strip is the first block in both doors and never moves (doors.ts):
 * the Critical notes about this client on this machine, the clinical
 * watch-outs the studio's matrix names for it, and the studio's own notes on
 * the unit with the Relay flag (machine menu design §B, block 1).
 *
 *   - A Critical note is an OPEN thread root on this machine at Critical
 *     loudness, by the notes' one zone rule (client-notes/threads.ts), with
 *     the copies of a settings save left out (settings-copy.ts) — the same
 *     list MenuNotes reads, which is why its head skips an open Critical
 *     note: the strip already says it. A note on the old `machineNotes`
 *     list with no journal copy, flagged important, is said too: the old
 *     sheet hoisted it above the dials, and it stays on top.
 *   - A journal that couldn't be read is said ("Critical notes couldn't be
 *     checked"), never an empty strip standing in for "nothing to know";
 *     one that hasn't answered yet says nothing until it does.
 *   - The count is the header pill's ("2 things to know first"): every line
 *     the strip draws, a line saying a read failed included.
 *
 * PURE — no React, no Firestore.
 */
import { machineNoteWords, machineNotesFor } from "../equipment/machine-notes";
import { whoOf } from "../client-notes/record-selectors";
import { assembleThreads, threadsByZone } from "../client-notes/threads";
import { studioDateKey } from "../../lib/studio-time";
import type { MachineNote } from "../../types";
import { toDate, type JournalEntry } from "../../types/journal";
import { withoutSettingsCopies } from "./settings-copy";
import type { SettingRow } from "./setting-history";

/** A Critical note on this machine, as the strip says it. */
export interface CriticalLine {
  /** The thread's id, or the old list's note id. */
  id: string;
  /** The note's own words, without the "Leg Press — " the journal copy carries. */
  words: string;
  /** "Ana", or the initials when no name was written. */
  who: string;
  /** The studio day it was written, when known. */
  day: string | null;
}

export type CriticalRead =
  /** The client's journal hasn't answered: nothing is said yet. */
  | { state: "loading" }
  /** It couldn't be read: the strip says so, never "nothing to know". */
  | { state: "failed" }
  | { state: "ready"; lines: CriticalLine[] };

export interface CriticalInput {
  machineId: string;
  /** The unit's floor name. */
  machineName: string;
  /** Every name a settings copy may carry (the floor's and the catalog's); defaults to the floor name. */
  machineNames?: readonly string[];
  /** The host's one journal listener; null while unread or after a failed read. */
  journal: readonly JournalEntry[] | null;
  journalState: "loading" | "ready" | "failed";
  /** The old `clientMachineSettings.machineNotes` list (read, never written). */
  legacy?: readonly MachineNote[] | null;
  /** The card's one read of the setting changes; null when unread or failed (then nothing is hidden). */
  history: readonly SettingRow[] | null;
  /** The studio day today. */
  today: string;
}

const dayOfMs = (ms: number): string | null => (Number.isFinite(ms) && ms > 0 ? studioDateKey(new Date(ms)) : null);

/** The Critical notes on this machine, open today, newest first. */
export function criticalLinesOf(input: CriticalInput): CriticalRead {
  const { machineId, machineName, journal, today } = input;
  if (input.journalState === "failed") return { state: "failed" };
  if (!journal) return input.journalState === "loading" ? { state: "loading" } : { state: "failed" };

  const names = input.machineNames && input.machineNames.length ? [...input.machineNames] : [machineName];
  const mine = journal.filter((e) => e && e.machineId === machineId && !e.isArchived && (e.body ?? "").trim() !== "");
  const threads = assembleThreads(withoutSettingsCopies(mine, input.history, names));
  const open = threadsByZone(threads, today).open.filter((t) => t.root.importance === "critical");
  const lines: CriticalLine[] = open.map((t) => {
    const at = toDate(t.root.occurredAt);
    return {
      id: t.id,
      words: machineNoteWords(t.root.body ?? "", machineName),
      who: whoOf(t.root),
      day: at ? dayOfMs(at.getTime()) : null,
    };
  });

  // The old list's notes with no journal copy, flagged important.
  const earlier = machineNotesFor({ machineId, machineName, legacy: input.legacy ?? [], journal }).filter(
    (n) => !n.journalEntryId && n.isImportant && (n.content ?? "").trim() !== "",
  );
  for (const n of earlier) {
    const ms = n.timestamp ? Date.parse(n.timestamp) : NaN;
    lines.push({
      id: n.id,
      words: machineNoteWords(n.content ?? "", machineName),
      who: (n.authorName ?? "").trim().split(/\s+/)[0] || "Unknown",
      day: dayOfMs(ms),
    });
  }
  return { state: "ready", lines };
}

/** What the studio's own read of the unit holds (equipment/FloorNoteCard's `useFloorNote`). */
export type FloorReadSummary =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; open: readonly unknown[]; note: unknown | null; flag: unknown | null };

/** At most this many of the studio's open notes are drawn at the machine (FloorNoteCard's own cap). */
export const FLOOR_LINES_SHOWN = 4;

/** How many lines the floor's part of the strip draws. */
export function floorLineCount(read: FloorReadSummary): number {
  if (read.status === "loading") return 0;
  if (read.status === "failed") return 1;
  return (read.flag ? 1 : 0) + Math.min(read.open.length, FLOOR_LINES_SHOWN) + (read.note ? 1 : 0);
}

export interface SafetySummary {
  /** Every line the strip draws: the pill's number. */
  count: number;
  /** A Critical note is among them: the pill carries the Hub's triangle. */
  critical: boolean;
}

/** The strip in one number, for the header's pill and for whether the block is drawn at all. */
export function safetySummary(input: { critical: CriticalRead; watchOuts: number; floor: FloorReadSummary }): SafetySummary {
  const crit = input.critical.state === "ready" ? input.critical.lines.length : input.critical.state === "failed" ? 1 : 0;
  const count = crit + Math.max(0, Math.trunc(input.watchOuts) || 0) + floorLineCount(input.floor);
  return { count, critical: input.critical.state === "ready" && input.critical.lines.length > 0 };
}

/** The line a failed journal read puts in the strip. */
export const CRITICAL_UNREAD = "Critical notes couldn't be checked";

/**
 * Is the strip scrolled away, so the header's pill should show? Its bottom
 * has gone up past the header's bottom: scrolled out of the dialog's
 * scroller, or under the inline pane's sticky header. Measured from the two
 * elements themselves, so it holds whichever box scrolls (the dialog's own,
 * or the app's page on Programming → All Machines, whose top is not the
 * window's) and however tall a wrapping name makes the header.
 */
export function stripScrolledAway(stripBottom: number, headBottom: number): boolean {
  return Number.isFinite(stripBottom) && Number.isFinite(headBottom) && stripBottom <= headBottom + 1;
}
