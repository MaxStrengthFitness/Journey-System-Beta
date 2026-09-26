/**
 * THE LIVE-SESSION FAILSAFE (tracker round, Sep 2026).
 *
 * The audit's "one thing to add": if the app crashes, the browser reloads,
 * or a trainer simply logs back in, the bottom tab must take them straight
 * back into the session they were running — no client directory, no
 * profile, no "Take over" slot.
 *
 * Two nets, because either alone has a hole:
 *
 *   1. The studio's 24-hour `sessions` stream. `findMyLiveSession` picks
 *      the caller's own In-Progress session out of it. This works the
 *      moment the stream arrives, with no extra read — but it depends on
 *      the heartbeat (a session whose heartbeat is older than 60 minutes
 *      reads as abandoned, see `isSessionValid`).
 *   2. The device. `rememberLiveSession` writes the session id to
 *      localStorage when a session starts; `forgetLiveSession` clears it
 *      when the session finishes or is discarded. The tracker's takeover
 *      effect already reads this key and adopts the session by a direct
 *      `getDoc`, so it works before the stream has arrived. (It used to
 *      survive a stale heartbeat too; since Sep 24 it does not — below.)
 *
 * The key name is the one `ClientProfileView`'s "Take over" has always
 * written, so nothing else needs to change to keep working.
 *
 * STALE SESSIONS ARE NEVER ADOPTED WITHOUT ASKING (Sep 24 2026). The
 * profile hid an In-Progress session whose heartbeat was over 60 minutes
 * old and offered Start, but the Active Session adopted ANY In-Progress
 * session for the client, and the remembered id above was followed however
 * old it was. So Start the next morning quietly reopened yesterday's
 * abandoned session and that day's sets went into it, under yesterday's
 * date. Every reader now splits a client's In-Progress sessions with
 * `splitInProgress`, which applies `isSessionValid`:
 *
 *   - `live` is carried on with, as before, without asking.
 *   - `stale` is never carried on with unless the trainer chooses to. The
 *     Active Session asks (resume it, or start a new one); the profile says
 *     it is there and offers Discard. Nothing closes or deletes it by
 *     itself, and nothing stops a trainer starting.
 *
 * The device's remembered id is followed only while its session is live. A
 * stale one is still reached from its client, where the question is asked.
 */

import { getMillis, isSessionValid } from "./utils";
import { formatStudioTime, studioDayKeyOf, toDate, type DateLike } from "./studio-time";

export const LIVE_SESSION_KEY = "max_strength_active_session_id";

export interface LiveSessionLike {
  id?: string;
  status?: string;
  trainerId?: string;
  startedByTrainerId?: string;
  clientId?: string;
  clientName?: string;
  lastHeartbeatAt?: unknown;
  createdAt?: unknown;
}

/**
 * When the session last showed it was running: its heartbeat, else its
 * creation. A session whose clock is still a pending server write reads as
 * `now` — it was written a moment ago.
 */
export function lastSignOfLife(session: LiveSessionLike, now: number = Date.now()): number {
  return getMillis(session.lastHeartbeatAt) || getMillis(session.createdAt) || now;
}

export interface InProgressSplit<T> {
  /** The session to carry on with, without asking. Newest sign of life wins
   *  when (wrongly) more than one is running. */
  live: T | null;
  /** In-Progress sessions the heartbeat rule calls abandoned, newest first.
   *  Never carried on with unless the trainer chooses to. */
  stale: T[];
}

/**
 * THE ONE ANSWER to "which of these In-Progress sessions is running?" —
 * the profile's Start button, the Active Session's adoption and the bottom
 * tab all read it, so they cannot disagree about a session again. Sessions
 * that are not In-Progress are ignored.
 */
export function splitInProgress<T extends LiveSessionLike>(
  sessions: readonly T[],
  now: number = Date.now(),
): InProgressSplit<T> {
  const live: T[] = [];
  const stale: T[] = [];
  for (const s of sessions) {
    if (s.status !== "In-Progress") continue;
    (isSessionValid(s, now) ? live : stale).push(s);
  }
  const newestFirst = (a: T, b: T) => lastSignOfLife(b, now) - lastSignOfLife(a, now);
  live.sort(newestFirst);
  stale.sort(newestFirst);
  return { live: live[0] ?? null, stale };
}

/**
 * The caller's own In-Progress session, if the stream holds one that is
 * still alive. Newest heartbeat wins when (wrongly) more than one exists.
 * Takes one id, or every id the caller's sessions may carry (`myTrainerIds`).
 */
export function findMyLiveSession<T extends LiveSessionLike>(
  sessions: readonly T[],
  trainerId: string | readonly string[] | null | undefined,
  now: number = Date.now(),
): T | undefined {
  const ids = typeof trainerId === "string" ? [trainerId] : (trainerId ?? []);
  if (ids.length === 0) return undefined;
  const mine = sessions.filter((s) => !!s.trainerId && ids.includes(s.trainerId) && !!s.clientId);
  return splitInProgress(mine, now).live ?? undefined;
}

/* ------------------------------------------------------------------ *
 * WHOSE SESSION IS THIS (session record, Sep 26 2026).
 *
 * A second iPad used to open a running session as if it were its own, so a
 * head trainer looking in could type over the trainer's sets, and two
 * Finishes counted everything twice. AJ, on the Screen Atlas: leaders
 * "don't have to be able to edit anything but they should be able to like
 * kind of follow along", and "the big thing is I still want trainers to be
 * able to hop back into a session in the event of a iPad dying". So the
 * trainer running a session records it, from any iPad they sign in on, and
 * everyone else watches it, live, until they choose to take it over.
 * ------------------------------------------------------------------ */

/**
 * Every id this person's sessions may carry. Start writes the trainer
 * document's id, which differs from the sign-in uid on older accounts, and a
 * profile claimed from a placeholder began under another id
 * (features/trainer-identity). Any of them is "me".
 */
export function myTrainerIds(
  trainer: { id?: string | null; authUid?: string | null; claimedFromId?: string | null } | null | undefined,
  uid?: string | null,
): string[] {
  const ids = [trainer?.id, trainer?.authUid, trainer?.claimedFromId, uid]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(ids));
}

/**
 * True when another trainer is running the session, so this iPad watches it
 * rather than recording into it. A session with no trainer on it, or a
 * person the app cannot identify, is never someone else's: failing that way
 * would lock a trainer out of their own session, the one thing that must
 * always work.
 */
export function isAnotherTrainersSession(
  session: { trainerId?: string | null } | null | undefined,
  myIds: readonly string[],
): boolean {
  const runner = (session?.trainerId || "").trim();
  if (!runner || myIds.length === 0) return false;
  return !myIds.includes(runner);
}

export interface TakeOverPatch {
  trainerId: string;
  trainerName: string;
  trainerInitials: string;
  startedByTrainerId?: string;
}

/**
 * What a take-over writes on the session. It becomes the new trainer's to
 * record and finish, and Finish has always credited whoever finishes (it
 * writes `trainerId`, lib/sync-utils.ts): the trainer who ran the rest of the
 * session gets it. The trainer who started it stays on it as
 * `startedByTrainerId`, which Start has always written; a session from
 * before that field gets it now, from the trainer being replaced.
 */
export function takeOverPatch(
  session: { trainerId?: string | null; startedByTrainerId?: string | null },
  me: { id: string; fullName?: string | null; initials?: string | null },
): TakeOverPatch {
  const patch: TakeOverPatch = {
    trainerId: me.id,
    trainerName: me.fullName || "",
    trainerInitials: me.initials || "??",
  };
  const starter = (session.startedByTrainerId || "").trim();
  const runner = (session.trainerId || "").trim();
  return !starter && runner ? { ...patch, startedByTrainerId: runner } : patch;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function rememberLiveSession(sessionId: string): void {
  storage()?.setItem(LIVE_SESSION_KEY, sessionId);
}

export function forgetLiveSession(sessionId?: string): void {
  const s = storage();
  if (!s) return;
  // Only clear our own id — a second tab may have started another session.
  if (!sessionId || s.getItem(LIVE_SESSION_KEY) === sessionId) {
    s.removeItem(LIVE_SESSION_KEY);
  }
}

export function peekLiveSessionId(): string | null {
  return storage()?.getItem(LIVE_SESSION_KEY) ?? null;
}

/* ------------------------------------------------------------------ *
 * The words for a stale session — what the Active Session's question and
 * the profile's notice say about it.
 * ------------------------------------------------------------------ */

export interface StaleSessionFacts extends LiveSessionLike {
  /** The studio day its sets are recorded under (`YYYY-MM-DD`). */
  date?: string;
  trainerInitials?: string;
  startTime?: unknown;
  clientStartTime?: string;
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function shiftDayKey(key: string, days: number): string {
  const [, y, m, d] = key.match(DAY_KEY)!;
  return new Date(Date.UTC(+y, +m - 1, +d + days)).toISOString().slice(0, 10);
}

function startedAt(session: StaleSessionFacts): Date | null {
  return (
    toDate(session.startTime as DateLike) ??
    toDate(session.clientStartTime) ??
    toDate(session.createdAt as DateLike)
  );
}

/**
 * The studio day a session's sets are recorded under, as a person says it:
 * "today", "yesterday", or "Wed, Sep 23" (with the year when it is not this
 * year). Null when the session carries no day at all.
 */
export function sessionDayWords(session: StaleSessionFacts, todayKey: string): string | null {
  const key =
    (session.date && studioDayKeyOf(session.date)) || studioDayKeyOf(startedAt(session));
  if (!key || !DAY_KEY.test(key)) return null;
  if (key === todayKey) return "today";
  if (DAY_KEY.test(todayKey) && key === shiftDayKey(todayKey, -1)) return "yesterday";
  const [, y, m, d] = key.match(DAY_KEY)!;
  const sameYear = todayKey.slice(0, 4) === y;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(+y, +m - 1, +d, 12)));
}

/**
 * "Started yesterday at 9:04 AM by JC." — any part it cannot know is left
 * out, and a session that says nothing about its start gets no line at all.
 */
export function staleSessionStartedLine(session: StaleSessionFacts, todayKey: string): string {
  const day = sessionDayWords(session, todayKey);
  const at = startedAt(session);
  const time = at ? formatStudioTime(at, undefined, "") : "";
  const by = (session.trainerInitials || "").trim();
  if (!day && !time && !by) return "";
  const dayPart = !day ? "" : day === "today" || day === "yesterday" ? ` ${day}` : ` on ${day}`;
  return `Started${dayPart}${time ? ` at ${time}` : ""}${by ? ` by ${by}` : ""}.`;
}

/** "Judy" from "Judy Daus" — the tab has room for one word. */
export function liveSessionTabLabel(session: LiveSessionLike | undefined): string {
  if (!session) return "Start Session";
  const first = (session.clientName || "").trim().split(/\s+/)[0];
  return first ? `Session · ${first}` : "Active Session";
}
