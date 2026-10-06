/**
 * This session's notes, from the journal stream the Active Session already
 * holds (speed round, Oct 5 2026; R11 in its blueprint).
 *
 * The Wrap-up's To-file tray and the session's note sheet each opened their
 * own `journalEntries where sessionId ==` listener, beside the client's
 * journal listener the tracker already runs (useClientJournal, ordered by
 * occurredAt, the newest 300, indexed). A session's notes are the client's
 * newest, so they are always in that stream: they are taken from it in
 * memory, and no second query is made.
 *
 * Returns null when the stream cannot answer (none handed over, no session,
 * the stream FAILED, or it is the index-less fallback that came back at its
 * limit, so not surely the newest): the caller then reads the notes itself,
 * as before.
 * A failed read is unknown, never "no notes". Loading is said as loading.
 */
import type { JournalStream } from "../../hooks/useClientJournal";
import type { JournalEntry } from "../../types/journal";

export interface SessionJournalRead {
  /** This session's entries, archived ones included (each screen decides what it shows). */
  entries: JournalEntry[];
  loading: boolean;
}

export function sessionJournalOf(
  stream: JournalStream | null | undefined,
  sessionId: string | null | undefined,
): SessionJournalRead | null {
  if (!stream || !sessionId) return null;
  if (stream.state === "failed") return null;
  // Some 300 of the client's notes, not the newest: this session's may be missing.
  if (stream.newest === false) return null;
  if (stream.state !== "ready" || !stream.entries) return { entries: [], loading: true };
  return { entries: stream.entries.filter((e) => e.sessionId === sessionId), loading: false };
}
