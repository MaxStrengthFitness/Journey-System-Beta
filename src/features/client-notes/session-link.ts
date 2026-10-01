/**
 * A NOTE'S SESSION — which session a note was written in, carried on the note
 * and said on the Notes page (FileMaker parity, Oct 1 2026).
 *
 * AJ, Oct 1 2026, asked to keep ONE place to write and organise notes rather
 * than notes on a session number and notes on a set: "if made within a
 * session it should link that session and that solves that and then I can see
 * all notes about a clients machine performance and see the session it was
 * associated with."
 *
 * Every note the live session writes already carried `sessionId`. This adds
 * the session's number and studio day beside it (`sessionLinkOf`, used by
 * each writer), so the Notes page can say "From session #12 · Sep 30" without
 * a read per note. For an older note that has only the id, the page looks the
 * session up in the sessions the profile already streams; if it isn't there,
 * the line still says the note came from a session, and the session is read
 * once, on the tap that opens it.
 *
 * The number is a claim about her history, so it is shown only past the
 * session-number gate (`canQuoteSessionNumber`, lib/client-coverage.ts) —
 * "#3" on a twelve-year client is the claim that gate exists to stop.
 *
 * Pure apart from `sessionDayKey`'s time zone; session-link.test.ts.
 */
import type { WorkoutSession } from "../../types";
import type { JournalEntry } from "../../types/journal";
import { sessionNumberTag } from "../../lib/history-claims";
import { sessionDayKey } from "../client-history/model";
import { shortDay } from "./record-selectors";

export interface SessionLinkFields {
  sessionId: string | null;
  sessionNumber: number | null;
  sessionDay: string | null;
}

/** What a note written in this session carries: its id, number and studio day. */
export function sessionLinkOf(
  session: (Partial<WorkoutSession> & { id?: string | null }) | null | undefined,
  fallbackDay?: string | null,
): SessionLinkFields {
  if (!session?.id) return { sessionId: null, sessionNumber: null, sessionDay: null };
  const n = session.sessionNumber;
  return {
    sessionId: session.id,
    sessionNumber: typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.trunc(n) : null,
    sessionDay: sessionDayKey(session as WorkoutSession) ?? fallbackDay ?? null,
  };
}

/**
 * The line under a note written in a session — "From session #12 · Sep 30",
 * "From the session on Sep 30", or "From a session" — or null for a note not
 * written in one. The note's own fields first, then the session if the page
 * holds it.
 */
export function sessionLinkLabel(
  entry: Pick<JournalEntry, "sessionId"> & { sessionNumber?: number | null; sessionDay?: string | null },
  session: Partial<WorkoutSession> | null | undefined,
  quotable: boolean,
  today: string,
): string | null {
  if (!entry.sessionId) return null;
  const n = entry.sessionNumber ?? session?.sessionNumber ?? null;
  const tag = sessionNumberTag(n, quotable);
  const day = entry.sessionDay ?? (session ? sessionDayKey(session as WorkoutSession) : null);
  const when = shortDay(day, today);
  if (tag && when) return `From session ${tag} · ${when}`;
  if (tag) return `From session ${tag}`;
  if (when) return `From the session on ${when}`;
  return "From a session";
}
