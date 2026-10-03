/**
 * HOW LONG A HEADS UP IS READ OUT — four of her sessions (notes round,
 * Oct 3 2026).
 *
 * AJ, the client-notes hand-off: "Heads up defaults to four SESSIONS (not
 * days), extendable." A Heads up exists to reach the next trainers who see
 * her, and a clock cannot tell whether anyone has: a client away for three
 * weeks used to come back to a briefing that had already gone quiet, and a
 * client in four times a week heard "a bit sore after the move" a dozen
 * times. So a Heads up with no window of its own is read out at her next
 * four sessions, whoever trains her and wherever.
 *
 * THE RULES, in the order they are asked:
 *
 *   • Only a Heads up that is not closed. A window of its own (until a day,
 *     only on a day, from a day) is read by the one mattering rule, exactly
 *     as before — a dated note says when it stops.
 *   • The count starts at the thread's newest word: the later of when the
 *     note was written and the day it is dated (a note dated ahead —
 *     "surgery on the 14th" — counts from that day), or the thread's latest
 *     update. ADDING AN UPDATE IS HOW A TRAINER EXTENDS IT: "still sore"
 *     is read out at her next four sessions again, the way an update already
 *     brings a hushed note back (dismissals.ts).
 *   • A session counts when it started after that moment. A note written at
 *     the briefing is heard at the session it was written before; one
 *     written mid-session or at the Wrap-up is not heard at that session.
 *   • When her sessions could not be read (still loading, offline with
 *     nothing cached, a refused read) the count is unknown, and the old
 *     clock answers — three weeks — rather than every Heads up ever written
 *     shouting at once or none at all. A failed read is never "no sessions".
 *
 * Pure: no React, no Firebase. `heads-up.test.ts` pins it; the hook
 * (`useClientJournal`) hands it her recent sessions, which it already reads.
 */
import { studioDateKey } from "../../lib/studio-time";
import { toDate, type JournalEntry } from "../../types/journal";
import { mattersOn } from "./mattering";

/** How many of her sessions a Heads up with no window is read out at. */
export const HEADS_UP_SESSIONS = 4;

/**
 * The clock used only when her sessions are unknown (loading, offline, a
 * refused read). It was the whole rule until Oct 3 2026.
 */
export const HEADS_UP_FALLBACK_DAYS = 21;

const DAY_MS = 86_400_000;

/** The session fields a start can be read from, newest writers first. */
export interface SessionStartFields {
  startTime?: unknown;
  clientStartTime?: unknown;
  date?: unknown;
}

/**
 * When a session started, in ms: the server's start, else the iPad's clock
 * at Start, else its studio day at noon (a past session logged by hand).
 * Null when none of them reads.
 */
export function sessionStartMs(session: SessionStartFields): number | null {
  for (const v of [session.startTime, session.clientStartTime, session.date]) {
    const d = toDate(v);
    if (d && !isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

/**
 * The starts that count toward a Heads up's four: every session but one
 * still running, which has not heard it yet — it counts at Finish, so a note
 * read at the briefing of her fourth session stays on the session's flags
 * for the whole twenty minutes (the review of the notes round, Oct 3 2026).
 */
export function countedSessionStarts(sessions: readonly (SessionStartFields & { status?: unknown })[]): number[] {
  return sessionStarts(sessions.filter((s) => s.status !== "In-Progress"));
}

/** Every readable start, oldest first. */
export function sessionStarts(sessions: readonly SessionStartFields[]): number[] {
  const out: number[] = [];
  for (const s of sessions) {
    const ms = sessionStartMs(s);
    if (ms !== null) out.push(ms);
  }
  return out.sort((a, b) => a - b);
}

export type HeadsUpRoot = Pick<JournalEntry, "importance" | "resolvedAt" | "effectiveUntil" | "occurredAt"> &
  Partial<Pick<JournalEntry, "effectiveFrom" | "repeat" | "isArchived" | "createdAt">>;

export interface HeadsUpContext {
  /** Her sessions' starts (any order); null when they could not be read. */
  sessionStarts: readonly number[] | null;
  /** When the thread's newest update was written, if it has one. */
  latestUpdateMs?: number | null;
}

/** True when the note has a window of its own, which the mattering rule reads. */
export function hasWindow(entry: Pick<HeadsUpRoot, "effectiveFrom" | "effectiveUntil">): boolean {
  return Boolean(entry.effectiveUntil || entry.effectiveFrom);
}

/**
 * The moment the count starts: the later of when it was written and the day
 * it is dated, or the thread's newest update when that is later still.
 * Null when the note carries no readable date at all.
 */
export function headsUpCountFrom(root: HeadsUpRoot, latestUpdateMs?: number | null): number | null {
  const written = toDate(root.createdAt) ?? toDate(root.occurredAt);
  const dated = toDate(root.occurredAt);
  const candidates = [written?.getTime(), dated?.getTime(), latestUpdateMs ?? undefined].filter(
    (v): v is number => typeof v === "number" && !isNaN(v),
  );
  return candidates.length ? Math.max(...candidates) : null;
}

export interface HeadsUpCount {
  /** Her sessions since the count started. */
  heard: number;
  /** How many more sessions it is read out at (0 once it has gone quiet). */
  left: number;
  /** The start of the session that used up the last of them, once it has. */
  quietSinceMs: number | null;
}

/** How many of her sessions have heard it, from the moment the count starts. */
export function headsUpCount(fromMs: number, starts: readonly number[]): HeadsUpCount {
  const after = starts.filter((ms) => ms > fromMs).sort((a, b) => a - b);
  const heard = after.length;
  return {
    heard,
    left: Math.max(0, HEADS_UP_SESSIONS - heard),
    quietSinceMs: heard >= HEADS_UP_SESSIONS ? after[HEADS_UP_SESSIONS - 1] : null,
  };
}

/**
 * Is this Heads up (importance `elevated`) still read out at `nowMs`?
 * See the header for the rules.
 */
export function isHeadsUpLive(root: HeadsUpRoot, nowMs: number, ctx?: HeadsUpContext | null): boolean {
  if (root.importance !== "elevated") return false;
  if (root.resolvedAt) return false;
  if (hasWindow(root)) {
    const today = studioDateKey(new Date(nowMs));
    return (
      today !== null &&
      mattersOn(
        { ...root, effectiveFrom: root.effectiveFrom ?? null, isArchived: root.isArchived ?? false },
        today,
      )
    );
  }
  const from = headsUpCountFrom(root, ctx?.latestUpdateMs);
  if (from === null) return false;
  const starts = ctx?.sessionStarts ?? null;
  if (starts === null) return nowMs - from <= HEADS_UP_FALLBACK_DAYS * DAY_MS;
  return headsUpCount(from, starts).heard < HEADS_UP_SESSIONS;
}

/**
 * Where a Heads up with no window stands, for the Notes page's card: how
 * many sessions are left, or the studio day it went quiet. Null when it has
 * a window, is not a Heads up, or her sessions are unknown.
 */
export function headsUpStanding(
  root: HeadsUpRoot,
  ctx: HeadsUpContext,
  tz?: string,
): { left: number } | { quietSince: string } | null {
  if (root.importance !== "elevated" || root.resolvedAt || hasWindow(root)) return null;
  if (ctx.sessionStarts === null) return null;
  const from = headsUpCountFrom(root, ctx.latestUpdateMs);
  if (from === null) return null;
  const count = headsUpCount(from, ctx.sessionStarts);
  if (count.quietSinceMs === null) return { left: count.left };
  const day = studioDateKey(new Date(count.quietSinceMs), tz);
  return day ? { quietSince: day } : null;
}
