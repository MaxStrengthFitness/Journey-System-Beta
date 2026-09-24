/**
 * WRITING TO A THREAD — the three things that can happen to a note after it
 * is written: it deepens, it closes, or it opens again.
 *
 * Notes round, Sep 2026. Read `threads.ts` first for the model. The rules
 * these functions exist to keep in ONE place:
 *
 *   • An update is an ordinary journal entry carrying `threadId`. It
 *     inherits the root's client, studio, kind, category and machine so the
 *     thread reads as one note rather than a pile of unrelated ones.
 *   • An update is written at PLAIN loudness, always. Loudness is the
 *     thread's, and the thread's lives on the root — otherwise a thread
 *     would have as many loudnesses as it has entries and no screen could
 *     say which one it had.
 *   • Closing writes `resolvedAt` on the ROOT, which closes the whole
 *     thread. Any trainer may do it (AJ, Sep 20: no studio-lead sign-off —
 *     the person who heard "it's all healed up" is the one standing there),
 *     and it can always be undone, because a shoulder that flares again is
 *     ordinary and beats starting a parallel note.
 *
 * Nothing here closes a thread on its own. A trainer whose session
 * contradicts a note ADDS to it — see the header of threads.ts for why.
 *
 * Archiving (client codex, the Notes page) takes the WHOLE thread off every
 * screen: the root and every update, in one batch. Archiving the root alone
 * left its updates behind as stray notes of their own (`assembleThreads`
 * promotes an update whose root is not in the load).
 */
import type { JournalEntry, JournalOrigin } from "../../types/journal";
import {
  archiveJournalEntries,
  createJournalEntry,
  resolveJournalEntry,
  type JournalAuthor,
} from "../../hooks/useClientJournal";
import type { NoteThread } from "./threads";

export interface ThreadUpdateOptions {
  /** Back-date an update the way the composer can back-date a note. */
  occurredAt?: Date | null;
  /** The session it was noticed in, when there is one. */
  sessionId?: string | null;
  /** Where it was written. Defaults to the profile. */
  origin?: JournalOrigin;
}

/**
 * Add an update to a thread. Returns the new entry's id, or null when there
 * is nothing to write.
 */
export async function addThreadUpdate(
  root: Pick<JournalEntry, "id" | "clientId" | "studioId" | "kind" | "category" | "machineId">,
  author: JournalAuthor,
  body: string,
  options: ThreadUpdateOptions = {},
): Promise<string | null> {
  const text = (body || "").trim();
  if (!root?.id || !root.clientId || !text) return null;

  return createJournalEntry(root.clientId, root.studioId || "", author, {
    kind: root.kind,
    category: root.category ?? null,
    body: text,
    // Plain, always — the thread's loudness lives on the root.
    importance: "standard",
    machineId: root.machineId ?? null,
    focusId: null,
    threadId: root.id,
    origin: options.origin ?? "manual",
    occurredAt: options.occurredAt ?? null,
    sessionId: options.sessionId ?? null,
  });
}

/** "All healed up." Closes the whole thread by stamping the root. */
export function closeThread(rootId: string): Promise<void> {
  return resolveJournalEntry(rootId, true);
}

/** It flared again. The same thread picks up where it left off. */
export function reopenThread(rootId: string): Promise<void> {
  return resolveJournalEntry(rootId, false);
}

/**
 * Archive a thread — the root and every update, in one batch, so no update is
 * left behind as a note of its own. Only entries this app wrote: an imported
 * row (`isLegacy`) has no journalEntries document to archive, and one missing
 * document would refuse the whole batch.
 */
export function archiveThread(thread: Pick<NoteThread, "root" | "updates">): Promise<void> {
  const ids = [thread.root, ...thread.updates].filter((e) => e?.id && !e.isLegacy).map((e) => e.id);
  return archiveJournalEntries(ids);
}
