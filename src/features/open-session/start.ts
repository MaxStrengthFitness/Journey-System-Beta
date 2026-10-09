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
  isAnotherTrainersSession,
  isOpenSession,
  splitInProgress,
  type LiveSessionLike,
  type RememberedSessionData,
} from "../../lib/live-session";
import { forgetOnSignOut } from "../sign-out/memory";

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

/** The open session this iPad started last, on this visit, and where. */
export interface LastOpenStart {
  id: string;
  /** The studio it was started at: the stream is one studio's. */
  studioId: string | null;
}

/**
 * The trainer's own open session here, which Open session goes back to
 * instead of starting another. Null: start one.
 *
 *   1. This trainer's live open session in the studio's sessions stream,
 *      the newest of them, whatever else of theirs is running (a client's
 *      session with a newer heartbeat used to hide it, and a second open
 *      session was started beside it).
 *   2. The one this iPad started last AT THIS STUDIO, while the device still
 *      remembers it and the stream has not said it ended: not in the stream
 *      yet (its write is still on the iPad, offline), or there, live, open
 *      and still this trainer's. One started at another studio is not
 *      followed: the screen here can't find it (the review, Oct 9 2026).
 *   3. After a reload, with nothing started on this visit: the session the
 *      device remembers, as the iPad's own copy holds it
 *      (`rememberedOnDevice`, read by the caller from its cache), while it is
 *      this trainer's live open session at this studio. Offline, a session
 *      just started is in no stream: the stream's query ranges over
 *      `createdAt`, and a write the server has not stamped matches no range.
 *   4. This trainer's newest ABANDONED open session in the stream (an hour
 *      with nothing typed), unless they chose to leave it: the screen asks
 *      whether to carry on with it (the whole-branch review, Oct 9 2026: it
 *      could not be reached from anywhere, and a second one was started).
 *
 * Finished, assigned, discarded, refused or taken over, it is not.
 */
export function runningOpenSessionId(f: {
  /** The studio's sessions stream (the last 24 hours). */
  stream: readonly LiveSessionLike[];
  /** Every id this trainer's sessions may carry (`myTrainerIds`). */
  myIds: readonly string[];
  /** The open session this iPad started last, on this visit. */
  lastStarted: LastOpenStart | null;
  /** The device's remembered session (`peekLiveSessionId`). */
  rememberedId: string | null;
  /** The remembered session as the iPad's own copy holds it, when the stream doesn't (3 above). */
  rememberedOnDevice?: RememberedSessionData | null;
  /** The studio on this iPad. */
  studioId: string | null;
  /** Abandoned open sessions the trainer chose to leave (`declineStaleOpenSession`). */
  declined?: ReadonlySet<string>;
  now?: number;
}): string | null {
  const mineOpen = f.stream.filter(
    (s) => isOpenSession(s) && !!s.trainerId && f.myIds.includes(s.trainerId),
  );
  const { live, stale } = splitInProgress(mineOpen, f.now);
  if (live?.id) return live.id;
  const last = f.lastStarted;
  if (last?.id && f.rememberedId === last.id && (last.studioId ?? null) === (f.studioId ?? null)) {
    const onRecord = f.stream.find((s) => s.id === last.id);
    if (!onRecord) return last.id;
  }
  const remembered = f.rememberedId;
  if (!last && remembered && !f.stream.some((s) => s.id === remembered)) {
    const d = f.rememberedOnDevice;
    if (
      d &&
      d.status === "In-Progress" &&
      isOpenSession(d) &&
      (d.hostedAtStudioId ?? null) === (f.studioId ?? null) &&
      !!d.trainerId &&
      f.myIds.includes(d.trainerId) &&
      splitInProgress([d], f.now).live
    ) {
      return remembered;
    }
  }
  const asked = stale.find((s) => !!s.id && !(f.declined?.has(s.id) ?? false));
  return asked?.id ?? null;
}

/* The abandoned open sessions this person chose to leave on this iPad
   ("Start a new session" in the question): Open session doesn't take them
   back to it again. Forgotten at sign-out (features/sign-out). */
const declinedStale = new Set<string>();
forgetOnSignOut(() => declinedStale.clear());

/** The trainer chose to leave this abandoned open session: it stays as it is, and Open session starts a new one. */
export function declineStaleOpenSession(id: string): void {
  if (id) declinedStale.add(id);
}

/** The abandoned open sessions left on this visit. */
export function declinedStaleOpenSessions(): ReadonlySet<string> {
  return declinedStale;
}

/*
 * A START THE DATABASE REFUSED (the whole-branch review, Oct 9 2026). The
 * Start is issued from the Client Directory, the refusal can come long after
 * (on reconnect, after a whole offline session), and by then the Active
 * Session may hold sets typed into it, each its own write. The screen that
 * holds it says so (the sets are kept: they are the only record of what was
 * lifted) and sends what is still waiting; with no screen to say it, the
 * Start's own toast does.
 */
type RefusalListener = (sessionId: string) => boolean;
const refusalListeners = new Set<RefusalListener>();

/** A screen holding open sessions hears a refused Start; it answers true when it said it. */
export function onOpenSessionRefused(listener: RefusalListener): () => void {
  refusalListeners.add(listener);
  return () => {
    refusalListeners.delete(listener);
  };
}

/** Tell the screens a Start was refused. True when one of them said it, so nothing says it twice. */
export function announceOpenSessionRefused(sessionId: string): boolean {
  let said = false;
  for (const listener of Array.from(refusalListeners)) {
    try {
      if (listener(sessionId)) said = true;
    } catch (error) {
      console.error("[open session] a screen could not take the refused start", error);
    }
  }
  return said;
}

/** The toast when a refused open session had sets typed into it. */
export const OPEN_SESSION_REFUSED_KEPT =
  "The open session didn't start, so it isn't on the record. The sets typed are kept: tell a leader.";

/** The toast when the database refuses the Start. */
export const OPEN_SESSION_REFUSED =
  "The open session didn't start, so it isn't on the record. Check the connection, then press Open session again.";
