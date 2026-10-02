/**
 * NOTES ABOUT HER ON ONE MACHINE — ONE LIST (the Atlas answers, Oct 2 2026:
 * "Notes about her on one machine: in her journal, shown on the machine
 * sheet").
 *
 * Until now a machine note was written twice: onto
 * `clientMachineSettings.machineNotes` (the list the machine sheet, the
 * grid's alert and the codex read) and into her journal as an `equipment`
 * entry. Two copies drift: archiving the journal's left the sheet's, and a
 * note written in the journal about a machine (the session's note sheet,
 * "about this machine") never reached the sheet at all.
 *
 * Now her journal is the one store. A new machine note is a journal entry
 * carrying `machineId`; every reader takes this module's list, which is her
 * journal's notes on that machine (not archived) plus, for old data, the
 * legacy `machineNotes` items that have no journal copy (most do: the
 * double-write ran from the equipment round on). Nothing is migrated in the
 * database; the old list is read, never written again.
 *
 * Pure.
 */
import type { MachineNote } from "../../types";
import type { JournalEntry } from "../../types/journal";

/** A note on the machine sheet, from either store. */
export interface MachineNoteView extends MachineNote {
  /** Set when the note is a journal entry: Remove archives it there. */
  journalEntryId?: string;
}

function millis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  }
  const o = v as { toMillis?: () => number; seconds?: number };
  if (typeof o.toMillis === "function") return o.toMillis();
  if (typeof o.seconds === "number") return o.seconds * 1000;
  return 0;
}

function iso(v: unknown): string {
  const ms = millis(v);
  return ms ? new Date(ms).toISOString() : "";
}

/** The note's own words, without the "Leg Press — " the journal copy carries for context. */
export function machineNoteWords(body: string, machineName: string): string {
  let t = (body ?? "").trim();
  const name = (machineName ?? "").trim();
  for (const dash of [" — ", " - ", " – "]) {
    if (name && t.startsWith(name + dash)) {
      t = t.slice(name.length + dash.length);
      break;
    }
  }
  if (t.toLowerCase().startsWith("maintenance: ")) t = t.slice("maintenance: ".length);
  return t.trim();
}

/** Her journal's notes on this machine, newest first, as the sheet draws them. */
export function journalNotesOnMachine(entries: readonly JournalEntry[], machineId: string, machineName: string): MachineNoteView[] {
  return entries
    .filter((e) => e && e.machineId === machineId && !e.isArchived && (e.body ?? "").trim() !== "")
    .map((e) => ({
      id: `journal:${e.id}`,
      journalEntryId: e.id,
      content: machineNoteWords(e.body, machineName),
      authorId: e.authorId,
      authorName: e.authorName ?? "",
      timestamp: iso(e.occurredAt ?? (e as { createdAt?: unknown }).createdAt),
      isImportant: e.importance === "critical" || e.importance === "elevated",
    }))
    .sort((a, b) => millis(b.timestamp) - millis(a.timestamp));
}

/**
 * The one list: the journal's notes on the machine, then the legacy items
 * with no journal copy (same words). `journal` null means her journal is not
 * read (yet): then the legacy list alone, which is what the sheet showed
 * before.
 */
export function machineNotesFor(input: {
  machineId: string;
  machineName: string;
  legacy: readonly MachineNote[] | null | undefined;
  journal: readonly JournalEntry[] | null;
}): MachineNoteView[] {
  const legacy = [...(input.legacy ?? [])];
  if (!input.journal) return legacy.sort((a, b) => millis(b.timestamp) - millis(a.timestamp));
  const fromJournal = journalNotesOnMachine(input.journal, input.machineId, input.machineName);
  // A legacy item whose journal copy exists — even archived — is that note:
  // archiving it in the journal takes it off the sheet too.
  const words = new Set(
    input.journal
      .filter((e) => e && e.machineId === input.machineId)
      .map((e) => machineNoteWords(e.body ?? "", input.machineName).toLowerCase()),
  );
  const oldOnly = legacy.filter((n) => !words.has(machineNoteWords(n.content ?? "", input.machineName).toLowerCase()));
  return [...fromJournal, ...oldOnly].sort((a, b) => millis(b.timestamp) - millis(a.timestamp));
}

/** Any note on this machine the team marked important (the grid's alert). */
export function hasImportantMachineNote(input: Parameters<typeof machineNotesFor>[0]): boolean {
  return machineNotesFor(input).some((n) => n.isImportant);
}
