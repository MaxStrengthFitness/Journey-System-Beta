/**
 * EDITING A SESSION THAT ALREADY HAPPENED — the pure half.
 *
 * Round: history editing + past-session entry, Sep 17 2026.
 *
 * Until this round the History tab let a trainer change the numbers on a set
 * that was already recorded, and nothing else. It could not add a machine the
 * session missed, could not take one off that was never done, and — the part
 * AJ asked for in capitals — it left no mark at all that anyone had been in
 * there. A session edited three weeks later read exactly like one recorded on
 * the floor at the time.
 *
 * Four things live here, all pure, so the arithmetic can be tested without
 * Firestore (see session-edits.test.ts):
 *
 *   1. THE STAMP. Who last changed the session, when, and how many times it
 *      has been changed. Written on the SESSION document, not on the sets,
 *      because the question a leader asks is "has anyone been in this session"
 *      — one answer, on the thing they opened.
 *
 *   2. THE MACHINE VOTE DELTA. `client.machineStats.<id>.timesPerformed` is a
 *      running total kept at write time (lib/client-rollups.ts) — one vote per
 *      machine per completed session, performed sets only. Adding a machine to
 *      a past session has to cast that vote and removing one has to take it
 *      back, or the profile's "performed 14 times" drifts away from the
 *      history behind it, silently, one edit at a time.
 *
 *   3. WHICH SESSIONS OWN COUNTERS. A "Log past session" backfill written
 *      before Sep 17 2026 never incremented anything, so deleting one must not
 *      decrement anything. From this round a manual entry DOES count, and says
 *      so on the document (`countsTowardTotals`). The flag is the only safe
 *      way to tell the two apart after the fact.
 *
 *   4. THE SHAPE OF A SET added by hand, so the session dialog and the
 *      past-session form write the same document.
 */

import type { ExerciseLog } from "../../types";
import { isPerformedLog, type OutcomeLog } from "../../lib/set-outcome";
import { isBackfilledSession, type HistorySession } from "./model";

/* ------------------------------------------------------------------ *
 * The stamp
 * ------------------------------------------------------------------ */

/** Who made the change. Resolved from the signed-in user — never typed in. */
export interface EditActor {
  /** The Auth uid. The rules pin identity to this, not to `trainer.id`. */
  uid: string | null;
  name: string | null;
  initials: string | null;
}

/** The Firestore operations a caller supplies, kept as a seam for the tests. */
export interface FieldOps {
  increment: (n: number) => unknown;
  serverTimestamp: () => unknown;
}

/** Plain-value implementation for the tests. */
export const plainFieldOps: FieldOps = {
  increment: (n) => n,
  serverTimestamp: () => "SERVER_TIMESTAMP",
};

/**
 * The update object that marks a session as having been edited after the
 * fact. `editCount` increments so a session edited five times says five,
 * even though only the last editor's name is kept — the name answers "who do
 * I ask about this", the count answers "how much has this been handled".
 */
export function editStampUpdate(actor: EditActor, ops: FieldOps): Record<string, unknown> {
  return {
    editedAt: ops.serverTimestamp(),
    editedById: actor.uid ?? null,
    editedByName: actor.name ?? null,
    editedByInitials: actor.initials ?? null,
    editCount: ops.increment(1),
  };
}

export interface EditStamp {
  /** Whatever the document holds — a Firestore Timestamp, an ISO string, or null. */
  at: unknown;
  byName: string | null;
  byInitials: string | null;
  count: number;
}

/**
 * The stamp on a session, or null when nobody has edited it. A session with
 * neither an `editedAt` nor a positive `editCount` has never been through the
 * edit path: a 0 and a missing field mean the same thing, and neither is an
 * edit.
 */
export function editStampOf(session: HistorySession | null | undefined): EditStamp | null {
  if (!session) return null;
  const raw = session as unknown as Record<string, unknown>;
  const at = raw.editedAt ?? null;
  const count = Number(raw.editCount ?? 0) || 0;
  if (at === null && count <= 0) return null;
  return {
    at,
    byName: (raw.editedByName as string) || null,
    byInitials: (raw.editedByInitials as string) || null,
    count,
  };
}

/** A Firestore Timestamp, an ISO string or a Date, as a Date. Null when unreadable. */
export function stampDate(at: unknown): Date | null {
  if (!at) return null;
  if (at instanceof Date) return Number.isNaN(at.getTime()) ? null : at;
  const anyAt = at as { toDate?: () => Date; seconds?: number };
  if (typeof anyAt.toDate === "function") {
    const d = anyAt.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof anyAt.seconds === "number") return new Date(anyAt.seconds * 1000);
  const d = new Date(String(at));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "Edited by AJ on Sep 17" — the line under the session title. Deliberately
 * short: the badge says THAT it was edited, this says by whom. A stamp with
 * no readable date still says who, because half an answer beats none.
 */
export function formatEditStamp(stamp: EditStamp | null, tz?: string): string {
  if (!stamp) return "";
  const who = stamp.byName || stamp.byInitials || "someone";
  const d = stampDate(stamp.at);
  const when = d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz }) : null;
  const times = stamp.count > 1 ? ` · ${stamp.count} edits` : "";
  return when ? `Edited by ${who} on ${when}${times}` : `Edited by ${who}${times}`;
}

/* ------------------------------------------------------------------ *
 * Machine votes
 * ------------------------------------------------------------------ */

/** The shape a vote is counted off: a machine, and whether the set counted. */
export interface VoteLog extends OutcomeLog {
  machineId?: string | null;
}

/** One vote per machine per session — the same rule client-rollups.ts applies. */
function votedMachineIds(logs: readonly VoteLog[]): Set<string> {
  const ids = new Set<string>();
  for (const log of logs) {
    const id = (log.machineId || "").trim();
    if (!id) continue;
    if (!isPerformedLog(log)) continue;
    ids.add(id);
  }
  return ids;
}

/**
 * What an edit does to `machineStats.<id>.timesPerformed`, machine by machine.
 *
 * Both sides are the session's WHOLE set list — before the edit and after it
 * — rather than the added and removed rows, because a machine can be voted on
 * by one of its two sets: dropping the performed one while the other stays
 * takes the vote back even though the machine is still in the session.
 *
 * Returns only the machines whose vote actually moved. An edit that changed a
 * weight returns {} and costs the client document nothing.
 */
export function machineVoteDelta(
  before: readonly VoteLog[],
  after: readonly VoteLog[],
): Record<string, number> {
  const was = votedMachineIds(before);
  const now = votedMachineIds(after);
  const delta: Record<string, number> = {};
  for (const id of now) if (!was.has(id)) delta[id] = 1;
  for (const id of was) if (!now.has(id)) delta[id] = -1;
  return delta;
}

/** The delta as Firestore dot-path increments, ready for `batch.update`. */
export function machineStatsUpdate(delta: Record<string, number>, ops: FieldOps): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const [machineId, n] of Object.entries(delta)) {
    if (!n) continue;
    updates[`machineStats.${machineId}.timesPerformed`] = ops.increment(n);
  }
  return updates;
}

/* ------------------------------------------------------------------ *
 * Which sessions own the client's counters
 * ------------------------------------------------------------------ */

/**
 * Did this session ever add to `sessionCount` / `completedSessions` / the
 * trainer tally / the machine stats?
 *
 * A live session always did. A backfill did not until Sep 17 2026, and from
 * that date says so on itself. So an old backfill answers false and a new one
 * answers true, which is exactly what delete has to know: taking back a count
 * that was never given breaks the "In Journey since" rule from the other end.
 */
export function ownsClientCounters(session: HistorySession | null | undefined): boolean {
  if (!session) return false;
  if (session.status !== "Completed") return false;
  if (!isBackfilledSession(session)) return true;
  return (session as unknown as Record<string, unknown>).countsTowardTotals === true;
}

/* ------------------------------------------------------------------ *
 * New sets on an old session
 * ------------------------------------------------------------------ */

export interface NewSetSeed {
  clientId: string;
  sessionId: string;
  machineId: string;
  weight?: string;
  reps?: string;
  seconds?: string;
  isHold?: boolean;
  repQuality?: 1 | 2 | 3 | null;
  studioId?: string;
  homeStudioId?: string;
  clientHomeStudioId?: string;
}

/**
 * The document for a set added by hand, live-flow shaped.
 *
 * `outcome` is decided here rather than left to `outcomeOf`'s legacy rule,
 * because a machine typed into a past session is a claim someone is making on
 * purpose: with a count it is a performed set, without one it is a machine
 * that was named and not done. Saying so explicitly means no later reader has
 * to guess what a zero meant.
 *
 * No `createdAt` — the caller adds `serverTimestamp()`, which is what every
 * other writer of exerciseLogs does and what the createdAt range queries need.
 */
export function newSetDoc(seed: NewSetSeed): Omit<ExerciseLog, "createdAt"> {
  const hold = Boolean(seed.isHold);
  const reps = (seed.reps ?? "").trim();
  const seconds = (seed.seconds ?? "").trim();
  const count = hold ? seconds : reps;
  const performed = Number(count) > 0;
  const doc: Omit<ExerciseLog, "createdAt"> = {
    clientId: seed.clientId,
    sessionId: seed.sessionId,
    machineId: seed.machineId,
    weight: (seed.weight ?? "").trim() || "0",
    reps: hold ? "0" : reps || "0",
    seconds: hold ? seconds || "0" : "0",
    isStaticHold: hold,
    isTSC: hold,
    outcome: performed ? "performed" : "skipped",
    machineSettings: {},
    studioId: seed.studioId || "",
    homeStudioId: seed.homeStudioId || "",
    clientHomeStudioId: seed.clientHomeStudioId || "",
  };
  if (!performed) doc.skipReason = "unknown";
  if (performed && seed.repQuality) doc.repQuality = seed.repQuality;
  return doc;
}
