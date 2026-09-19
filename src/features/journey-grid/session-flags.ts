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
  machineWatchOuts,
  type WatchOut,
} from "../../lib/clinical-watchouts";
import { clipText } from "../../lib/clip-text";

export interface SessionFlagSources {
  /** `client.clinicalFlags` — ids into the clinical matrix. */
  clinicalFlags?: readonly string[] | null;
  /** From `useClientJournal`: critical, unresolved, inside their window. */
  criticalEntries?: readonly JournalEntry[] | null;
  /** From `useClientJournal`: Heads ups still inside their window. */
  headsUpEntries?: readonly JournalEntry[] | null;
}

export interface SessionFlags {
  /** Watch-outs that apply to every set (no machine named). */
  general: WatchOut[];
  critical: JournalEntry[];
  headsUp: JournalEntry[];
  /** How many machines carry a machine-specific watch-out or a tied note. */
  count: number;
  /** Critical notes or any high-risk condition: the marker goes red. */
  severe: boolean;
}

export function sessionFlags(src: SessionFlagSources): SessionFlags {
  const general = generalWatchOuts(src.clinicalFlags);
  const critical = [...(src.criticalEntries ?? [])];
  const headsUp = [...(src.headsUpEntries ?? [])];
  const conditions = (src.clinicalFlags ?? []).length;
  const count = conditions + critical.length + headsUp.length;
  // "alert" is the matrix's absolute contraindication; "caution" its high risk.
  const severe = critical.length > 0 || general.some((w) => w.tone === "alert" || w.tone === "caution");
  return { general, critical, headsUp, count, severe };
}

export interface MachineFlags {
  watchOuts: WatchOut[];
  /** Critical first, then heads-ups, each tied to this machine by id. */
  notes: JournalEntry[];
}

export function machineFlags(
  machine: { id?: string | null; name?: string | null; fullName?: string | null } | null | undefined,
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

export type FlagTone = "critical" | "elevated";

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
    tone: w.tone === "alert" || w.tone === "caution" ? "critical" : "elevated",
    text: `${w.condition}: ${clipText(w.instruction.trim(), LINE_MAX)}`,
    more: total - 1,
  };
}
