/**
 * RETENTION CONVERSATIONS ARE NOTES (notes round, Oct 3 2026).
 *
 * AJ: "studio leaders might take notes on a client about their retention...
 * we have those retention conversations, and that kind of needs to get into
 * our notes as well", and his answer 1A: the whole team reads them, on her
 * record. A leader's case (studios/{s}/cases) stays the leaders' working
 * record of who is catching her and what happens next; what was SAID — by
 * her, to her — is a Retention note, and a note is a thread: the first
 * conversation opens it, every later one is an update on it, so the whole
 * story of whether she stays reads in one place, oldest first, on her Notes
 * ("Is she staying with us?"), on the next trainers' briefing while it is a
 * live Heads up, and on the studio's leaders' Today.
 *
 * Which thread a conversation joins: her newest Retention thread that is not
 * closed. None open (the first conversation, or the last story ended with
 * "booked again" and someone closed it) starts a new one, at Heads up.
 *
 * Pure apart from the one write, which goes through the journal's own
 * writers (createJournalEntry, addThreadUpdate) like every note.
 */
import { createJournalEntry, type JournalAuthor } from "../../hooks/useClientJournal";
import type { JournalEntry } from "../../types/journal";
import { DEFAULT_IMPORTANCE } from "./note-catalog";
import { addThreadUpdate } from "./thread-write";
import { assembleThreads, type NoteThread } from "./threads";

/**
 * Her Retention threads, newest first, from any list of her journal entries
 * (roots and updates). A thread whose root was not in the list (an old
 * thread past a capped read) is left out rather than an update standing in
 * for its root: a conversation added to it would hang off an update, which
 * no screen draws, and a closed story could look open.
 */
export function retentionThreads(entries: readonly JournalEntry[]): NoteThread[] {
  const mine = entries.filter((e) => e.kind === "retention" && !e.isArchived);
  return assembleThreads(mine).filter((t) => !t.root.threadId).sort(
    (a, b) => (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0),
  );
}

/** The thread a new conversation joins: her newest Retention thread still open, or none. */
export function openRetentionThread(threads: readonly NoteThread[]): NoteThread | null {
  return threads.find((t) => !t.root.resolvedAt && !t.root.isArchived) ?? null;
}

/**
 * Write one conversation onto her record: an update on her open Retention
 * thread, or the first note of a new one (Heads up). Returns the new entry's
 * id, or null when there was nothing to write.
 */
export async function writeRetentionConversation(input: {
  clientId: string;
  /** Her home studio: every note about her is filed there (Oct 2 2026). */
  studioId: string;
  author: JournalAuthor;
  text: string;
  open: NoteThread | null;
}): Promise<string | null> {
  const text = input.text.trim();
  if (!input.clientId || !text) return null;
  if (input.open) {
    return addThreadUpdate(input.open.root, input.author, text, { origin: "manual" });
  }
  return createJournalEntry(input.clientId, input.studioId, input.author, {
    kind: "retention",
    category: null,
    body: text,
    importance: DEFAULT_IMPORTANCE.retention,
    machineId: null,
    focusId: null,
    origin: "manual",
  });
}
