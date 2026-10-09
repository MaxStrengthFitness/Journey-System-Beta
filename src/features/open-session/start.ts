/**
 * STARTING AN OPEN SESSION (the open session round, Oct 9 2026; findings 2
 * and 6 of `docs/rounds/2026-10-09-open-session.md`).
 *
 * The Client Directory's **Open session** starts a session before the client
 * is chosen. Its Start used to await `addDoc`, then one `setDoc` per seeded
 * machine, so offline the screen never moved and a second tap made a second
 * session. It seeded six machines by Title Case names the floor spells in
 * capitals, and where one matched it left a ghost weight "0". It was signed
 * without a start time on the iPad's clock, a heartbeat or its starter, and
 * the device never remembered it, so once left there was no way back to it.
 *
 * Now it is ONE write, issued and never awaited, and the screen moves in the
 * same tap. The session records an empty list (`sessionMachineIds: []`):
 * nothing is seeded and no weight is written. What it records is only what
 * the trainer adds.
 *
 * While the trainer's own open session is still running, Open session goes
 * back to it (`runningOpenSessionId`) and starts nothing: a second one left
 * the first In-Progress for ever.
 */

import {
  findMyLiveSession,
  isAnotherTrainersSession,
  isOpenSession,
  splitInProgress,
  type LiveSessionLike,
} from "../../lib/live-session";

/** A second tap inside this window opens the session just started instead of making another. */
export const OPEN_SESSION_GUARD_MS = 3000;

export interface OpenSessionStarter {
  /** The trainer document's id: what every Start writes as `trainerId`. */
  id?: string | null;
  fullName?: string | null;
  initials?: string | null;
}

export interface OpenSessionFacts {
  trainer: OpenSessionStarter;
  /** The sign-in uid: the trainer id when the trainer document has none. */
  uid: string;
  /** Where the session is run: the iPad's studio. */
  studioId: string;
  /** The studio's day, `YYYY-MM-DD`. */
  date: string;
  /** The iPad's clock, ISO: the timer runs from it until the server's start time arrives. */
  nowIso: string;
  /** `serverTimestamp()`, passed in so this stays pure. */
  stamp: unknown;
}

/**
 * The session document an open session starts with. Its fields are the ones
 * a client Start writes for the same facts (`WorkoutTrackerView`'s
 * `startNewSession`), with no client and an empty list. Nothing in it is
 * `undefined`, which Firestore refuses.
 */
export function openSessionPayload(f: OpenSessionFacts): Record<string, unknown> {
  const trainerId = (f.trainer.id || "").trim() || f.uid;
  return {
    isUnassigned: true,
    sessionType: "Standard",
    sessionNumber: 0,
    date: f.date,
    hostedAtStudioId: f.studioId,
    clientHomeStudioId: null,
    isCrossTrain: false,
    // The session's own list, empty: the floor is not today's list.
    sessionMachineIds: [],
    trainerInitials: (f.trainer.initials || "").trim() || "??",
    trainerName: f.trainer.fullName || "",
    trainerId,
    // As a client Start writes it: the trainer document's id, like trainerId.
    startedByTrainerId: trainerId,
    status: "In-Progress",
    // Timer bookkeeping on the document, as a client Start keeps it.
    pausedAt: null,
    totalPausedMs: 0,
    clientStartTime: f.nowIso,
    lastHeartbeatAt: f.stamp,
    startTime: f.stamp,
    createdAt: f.stamp,
  };
}

/**
 * A tap while the last Start is still inside its window opens that session
 * again rather than making another (a double tap, or a tap after the leave
 * question held the first one back).
 */
export function isSecondTap(last: { at: number } | null, now: number): boolean {
  return !!last && now - last.at < OPEN_SESSION_GUARD_MS;
}

/**
 * The trainer's own open session still running here, which Open session goes
 * back to instead of starting another. Null: start one.
 *
 * The studio's sessions stream answers first (`findMyLiveSession`). It holds
 * a session only once the database has it, so the one this iPad started last
 * counts too while the device still remembers it and the stream has not
 * said it ended: not in the stream yet (its write is still on the iPad,
 * offline), or there, live, open and still this trainer's. Finished,
 * assigned, discarded, refused, taken over or abandoned, it is not.
 */
export function runningOpenSessionId(f: {
  /** The studio's sessions stream (the last 24 hours). */
  stream: readonly LiveSessionLike[];
  /** Every id this trainer's sessions may carry (`myTrainerIds`). */
  myIds: readonly string[];
  /** The open session this iPad started last, on this visit. */
  lastStartedId: string | null;
  /** The device's remembered session (`peekLiveSessionId`). */
  rememberedId: string | null;
  now?: number;
}): string | null {
  const mine = findMyLiveSession(f.stream, f.myIds, f.now);
  if (mine?.id && isOpenSession(mine)) return mine.id;
  const id = f.lastStartedId;
  if (!id || f.rememberedId !== id) return null;
  const onRecord = f.stream.find((s) => s.id === id);
  if (!onRecord) return id;
  const live = splitInProgress([onRecord], f.now).live;
  return live && isOpenSession(live) && !isAnotherTrainersSession(live, f.myIds) ? id : null;
}

/** The toast when the database refuses the Start. */
export const OPEN_SESSION_REFUSED =
  "The open session didn't start, so it isn't on the record. Check the connection, then press Open session again.";
