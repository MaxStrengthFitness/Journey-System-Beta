/**
 * WHAT THE BRIEFING READS OUT — question 1, "what's different about this
 * person", as threads rather than loose notes.
 *
 * Notes round, Sep 2026. The selection is unchanged and deliberately so: a
 * Critical note that matters today, and a Heads up still inside its window.
 * The briefing has one job it can fail at — being wrong once, or being
 * noisy — so this round did not widen what it says. It changed two things
 * about how it says it:
 *
 *   IT SHOWS THE THREAD, not the note. A shoulder note whose latest update
 *     is "MRI on the 31st" is read with that update attached, because the
 *     update IS the new information the briefing exists to deliver.
 *   IT HONOURS DISMISSAL. A trainer who has said "no need to remind me"
 *     does not see it again until something happens to it (see
 *     client-notes/dismissals.ts). Every other trainer still does.
 *
 * `hidden` is what a trainer chose not to be shown, counted so the screen
 * can offer it back. A briefing that quietly withholds something is the
 * failure AJ named — trainers stop opening it and never say why — so the
 * one thing it must never do is hide something with no way to find it.
 *
 * Pure: it is handed the same `criticalEntries` / `headsUpEntries` the hook
 * already decides, and only groups and filters them.
 */
import type { JournalEntry } from "../../types/journal";
import { assembleThreads, zoneOf, type NoteThread } from "../client-notes/threads";
import { threadCategoryOf } from "../client-notes/note-catalog";
import { isDismissed, type NoteDismissals } from "../client-notes/dismissals";

export interface BriefingNotes {
  /** Critical threads that matter today, loudest first as they arrived. */
  critical: NoteThread[];
  /** Heads ups still inside their window, under the critical ones. */
  headsUp: NoteThread[];
  /** How many of the above this trainer has said they already know. */
  hidden: number;
}

/**
 * Pair each entry with its thread. An entry with no thread in hand — a
 * fixture, or a screen that never loaded them — becomes a thread of one, so
 * the briefing never has less to say than it did before this round.
 */
function threadFor(entry: JournalEntry, byId: Map<string, NoteThread>): NoteThread {
  const found = byId.get(entry.id);
  if (found) return found;
  return assembleThreads([entry])[0];
}

export function briefingNotes(
  threads: readonly NoteThread[] | null | undefined,
  criticalEntries: readonly JournalEntry[],
  headsUpEntries: readonly JournalEntry[],
  dismissals: NoteDismissals | null | undefined,
  /** Show the dismissed ones anyway — the trainer asked to see them again. */
  showHidden = false,
): BriefingNotes {
  const byId = new Map((threads ?? []).map((t) => [t.id, t]));
  let hidden = 0;

  const pick = (entries: readonly JournalEntry[]): NoteThread[] => {
    const out: NoteThread[] = [];
    for (const e of entries) {
      const thread = threadFor(e, byId);
      if (!showHidden && isDismissed(thread, dismissals)) {
        hidden += 1;
        continue;
      }
      out.push(thread);
    }
    return out;
  };

  const critical = pick(criticalEntries);
  const headsUp = pick(headsUpEntries);
  return { critical, headsUp, hidden };
}

/**
 * HER STANDING HEALTH CONTEXT — known, not news (notes round, Oct 3 2026).
 *
 * AJ's hand-off: the watch-for read "should lead with what's changed
 * recently, with stable medical backdrop (knee, osteoporosis, high blood
 * pressure) sitting underneath as standing context — known, not news —
 * openable when something looks concerning." Most clients are over 40; the
 * backdrop is real but stable, so it is never read out with the news and
 * never counted in "Before you start" — one folded line under it, a tap away.
 *
 * Health and Incident threads in the Standing zone (an "always" note at
 * plain loudness, not closed), most recently touched first. A loud one is
 * already above, read out with the news; a closed one is history.
 */
export function standingHealth(
  threads: readonly NoteThread[] | null | undefined,
  today: string,
  tz?: string,
): NoteThread[] {
  const out: NoteThread[] = [];
  for (const t of threads ?? []) {
    if (t.root.isArchived) continue;
    const cat = threadCategoryOf(t);
    if (cat !== "health" && cat !== "incident") continue;
    if (zoneOf(t, today, tz) !== "standing") continue;
    out.push(t);
  }
  return out.sort((a, b) => (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0));
}

/** "the latest: MRI on the 31st" — the one line an update adds to a card. */
export function latestUpdateLine(thread: Pick<NoteThread, "updates">): string | null {
  const last = thread.updates[thread.updates.length - 1];
  if (!last) return null;
  const body = (last.body || "").trim();
  return body ? body : null;
}
