/**
 * "NO NEED TO REMIND ME" — per-trainer dismissal, and why it is not a fade.
 *
 * Notes round, Sep 2026. The problem AJ put: loudness is binary — flagged or
 * not — and the briefing needs familiar context to get QUIETER once known,
 * which is a third state a binary flag cannot express. A shoulder note is
 * critical to a trainer who has never met this client and background to the
 * one who has had them twice a week for a year. Same note, same day,
 * different reader.
 *
 * The app could have guessed — faded an item after it had been shown three
 * times. AJ's call was that the trainer decides instead, and the reason it
 * is better is that "I have read this" is only half of it: the other half is
 * "that is not my part of this client" — a trainer who only ever runs the B
 * routine hiding something that belongs to A. No amount of counting
 * impressions discovers that.
 *
 * THE THREE RULES, and each one is load-bearing:
 *   • A dismissal is PER TRAINER. It is one person saying what they already
 *     know, never an edit to the note. Nobody else's briefing changes.
 *   • ANY UPDATE BRINGS IT BACK, for everyone who dismissed it. New
 *     information overrides every dismissal — which is what makes dismissing
 *     safe to offer at all, and why `lastTouchedAt` counts an edit and not
 *     only a new update.
 *   • DISMISSALS ARE PRIVATE. No trainer sees who dismissed what; there is
 *     nothing to gain by showing it. That is why they live in one document
 *     per trainer (`noteDismissals/{uid}`) rather than on the note.
 *
 * Loudness therefore stays binary, and the quietening moves into per-trainer
 * curation. Each trainer's briefing becomes theirs without anyone editing
 * the note underneath it.
 *
 * Pure. The document is read and written in `dismissal-store.ts`.
 */
import type { NoteThread } from "./threads";

/** thread id → when this trainer said they did not need reminding. */
export type NoteDismissals = Record<string, Date | null>;

/**
 * Has this trainer dismissed this thread, and has nothing happened since?
 *
 * A dismissal older than the thread's last change has been overtaken, and
 * the thread is live again — for everyone, without anyone clearing anything.
 */
export function isDismissed(
  thread: Pick<NoteThread, "id" | "lastTouchedAt">,
  dismissals: NoteDismissals | null | undefined,
): boolean {
  const at = dismissals?.[thread.id];
  if (!at) return false;
  const touched = thread.lastTouchedAt?.getTime() ?? 0;
  return touched <= at.getTime();
}

/** The threads this trainer still wants to be shown, order kept. */
export function withoutDismissed<T extends Pick<NoteThread, "id" | "lastTouchedAt">>(
  threads: readonly T[],
  dismissals: NoteDismissals | null | undefined,
): T[] {
  return threads.filter((t) => !isDismissed(t, dismissals));
}

/**
 * Dismissals that have been overtaken by an update carry no meaning any
 * more, so the store drops them the next time it writes. Keeps one
 * trainer's document from growing for ever.
 */
export function pruneDismissals(
  dismissals: NoteDismissals,
  threads: readonly Pick<NoteThread, "id" | "lastTouchedAt">[],
): NoteDismissals {
  const known = new Map(threads.map((t) => [t.id, t]));
  const out: NoteDismissals = {};
  for (const [id, at] of Object.entries(dismissals)) {
    if (!at) continue;
    const thread = known.get(id);
    // A thread this client's notes no longer carry is left alone: it may
    // belong to another client entirely.
    if (thread && !isDismissed(thread, dismissals)) continue;
    out[id] = at;
  }
  return out;
}
