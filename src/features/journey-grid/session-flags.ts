/**
 * RED FLAGS FOR THE WHOLE TWENTY MINUTES.
 *
 * Fluidity round, Sep 18 2026. The floor (docs/business/the-floor.md, "Cold
 * starts"): a trainer is often on their SECOND session with a fifty-session
 * client, and the questions are — does she hold her breath, does she use
 * momentum, does she have anything medical that puts her at risk. The
 * briefing answered them; the answers vanished the moment Start was pressed.
 * The session bar carried name, number, trainer and clock; the Now Bar took
 * no client and no notes; a critical note tied to a machine never surfaced
 * when that machine became current.
 *
 * This module decides WHAT to show, so the screens only draw it:
 *
 *   sessionFlags   — everything worth a marker, and the count for it
 *   machineFlags   — what is tied to THIS machine: the one line on the Now
 *                    Bar when it becomes current
 *   flagLineOf     — that line, as a sentence
 *
 * Small marker, tappable for more, never a blocking dialog — AJ: "I really
 * don't want clutter."
 *
 * PURE MODULE.
 */

import type { JournalEntry } from "../../types/journal";
import {
  generalWatchOuts,
  machineSpecificWatchOuts,
  machineWatchOuts,
  type NamedWatchOut,
  type WatchOut,
  type WatchOutMachine,
} from "../../lib/clinical-watchouts";
import { clipText } from "../../lib/clip-text";

export interface SessionFlagSources {
  /** `client.clinicalFlags` — ids into the clinical matrix. */
  clinicalFlags?: readonly string[] | null;
  /** From `useClientJournal`: critical, unresolved, inside their window. */
  criticalEntries?: readonly JournalEntry[] | null;
  /** From `useClientJournal`: Heads ups still inside their window. */
  headsUpEntries?: readonly JournalEntry[] | null;
  /**
   * The studio's floor, so a condition that names machines can say which of
   * THIS floor's machines it means. Absent, the matrix's own names are used.
   */
  floor?: readonly WatchOutMachine[] | null;
}

export interface SessionFlags {
  /** Watch-outs that apply to every set (no machine named). */
  general: WatchOut[];
  /** Watch-outs that name machines, with the machines in words. */
  onMachines: NamedWatchOut[];
  critical: JournalEntry[];
  headsUp: JournalEntry[];
  /**
   * The number on the marker: the conditions, critical notes and heads-ups
   * the sheet lists — nothing it would not show. It used to count every
   * clinical flag id while the sheet showed only the every-machine ones, so a
   * client whose one condition names machines (osteoporosis) read "1" and
   * opened an empty sheet.
   */
  count: number;
  /**
   * Crimson: a critical note, or an absolute contraindication. Only those —
   * crimson is the colour of "this is the one that matters".
   */
  severe: boolean;
  /** Plum: a high-risk condition, when nothing is severe. */
  caution: boolean;
}

export function sessionFlags(src: SessionFlagSources): SessionFlags {
  const general = generalWatchOuts(src.clinicalFlags);
  const onMachines = machineSpecificWatchOuts(src.clinicalFlags, src.floor ?? []);
  const critical = [...(src.criticalEntries ?? [])];
  const headsUp = [...(src.headsUpEntries ?? [])];
  // One per condition, however many rules it carries — and only conditions
  // the matrix knows, so a stale flag id never counts something unshown.
  const conditions = new Set([...general, ...onMachines].map((w) => w.flagId)).size;
  const count = conditions + critical.length + headsUp.length;
  // "alert" is the matrix's absolute contraindication; "caution" its high risk.
  const watchOuts = [...general, ...onMachines];
  const severe = critical.length > 0 || watchOuts.some((w) => w.tone === "alert");
  const caution = !severe && watchOuts.some((w) => w.tone === "caution");
  return { general, onMachines, critical, headsUp, count, severe, caution };
}

export interface MachineFlags {
  watchOuts: WatchOut[];
  /** Critical first, then heads-ups, each tied to this machine by id. */
  notes: JournalEntry[];
}

export function machineFlags(
  machine: WatchOutMachine | null | undefined,
  src: SessionFlagSources,
): MachineFlags {
  if (!machine?.id) return { watchOuts: [], notes: [] };
  const id = machine.id;
  const tied = (list: readonly JournalEntry[] | null | undefined) =>
    (list ?? []).filter((e) => e.machineId === id);
  return {
    watchOuts: machineWatchOuts(src.clinicalFlags, machine),
    notes: [...tied(src.criticalEntries), ...tied(src.headsUpEntries)],
  };
}

/**
 * critical — crimson: a critical note, or an absolute contraindication.
 * caution  — plum: a high-risk condition.
 * elevated — amber: a heads-up, or a condition that needs a modification.
 */
export type FlagTone = "critical" | "caution" | "elevated";

export interface FlagLine {
  tone: FlagTone;
  text: string;
  /** How many more things are tied to this machine beyond the one shown. */
  more: number;
}

const LINE_MAX = 72;

/**
 * The one line under the settings when a machine becomes current.
 *
 * A tied note wins over a watch-out — a trainer wrote it about THIS client
 * on THIS machine ("holds her breath here — CJ, 3 Sep"); the matrix is
 * about the condition. Critical wins over elevated. Anything else tied to
 * the machine is a count, one tap away.
 */
export function flagLineOf(
  mf: MachineFlags,
  when: (entry: JournalEntry) => string,
): FlagLine | null {
  const total = mf.notes.length + mf.watchOuts.length;
  if (total === 0) return null;
  const note = mf.notes[0];
  if (note) {
    const who = note.authorInitials ? ` — ${note.authorInitials}` : "";
    const day = when(note);
    return {
      tone: note.importance === "critical" ? "critical" : "elevated",
      text: `${clipText(note.body.trim(), LINE_MAX)}${who}${day ? `, ${day}` : ""}`,
      more: total - 1,
    };
  }
  const w = mf.watchOuts[0];
  return {
    tone: w.tone === "alert" ? "critical" : w.tone === "caution" ? "caution" : "elevated",
    text: `${w.condition}: ${clipText(w.instruction.trim(), LINE_MAX)}`,
    more: total - 1,
  };
}
