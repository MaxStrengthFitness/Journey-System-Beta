/**
 * WHAT HAPPENED TO A BOOKING — the one answer, for every screen that reads a
 * booking's outcome for operations.
 *
 * AJ, Sep 24 2026: "We don't currently have the resources to build a two-way
 * webhook with Mindbody to pull in 'Completed' statuses. Manual marking in
 * Mindbody is fine. For the Operations Overview, let's change the logic: if a
 * session is successfully logged in Journey for a client on a given day,
 * consider it 'Completed' for operational tracking."
 *
 * WHY THIS EXISTS. The schedule pull-sync (`lib/mindbody-api-sync.ts`) and the
 * webhook write a booking as "Scheduled" or "Cancelled" and nothing else, and
 * End Session writes the SESSION, never the booking. So no booking in
 * Firestore is ever "Completed" or "No-Show": asked on its own, a booking read
 * every finished slot as never logged on the Overview (Done and No-shows were
 * always 0, and Needs you could never reach zero), and as a visit on the
 * attendance watch. Journey's own session is the evidence the booking cannot
 * carry.
 *
 * THE RULE, in order:
 *
 *   1. Cancelled in Mindbody → cancelled. A cancellation is a fact about the
 *      booking; the Changes list holds it against its day whatever else the
 *      client did that day.
 *   2. A COMPLETED Journey session for the same client — matched by
 *      `clientId`, never by name — on the same studio day → completed. Per
 *      client per day, as AJ set it: a client booked twice with one session
 *      logged reads both done. It beats a Mindbody "No-Show", because a
 *      logged session is proof they trained.
 *   3. Mindbody said Completed or No-Show (manual marking there; the sync does
 *      not carry it today, the type allows it) → that. A LATE CANCEL (since
 *      Oct 2 2026 anyone at the studio marks one, "Late cancel · session
 *      taken", lib/late-cancels.ts; it was a leader's "didn't come") is the
 *      same as Mindbody's No-Show (wave 2, Sep 28 2026; AJ: "all yes"): a
 *      leader who chased a session nobody logged and learned she didn't come
 *      marks it on Operations → Today (`studios/{s}/bookingMarks/{bookingId}`,
 *      `noShow: true`), and from then on it is a no-show everywhere this rule
 *      is asked with the marks: not a visit, not "never logged", and off
 *      Needs you. A logged session still beats it (rule 2), so a session
 *      logged later for that day makes it done again, whatever was marked.
 *   4. Otherwise the clock, the Overview's rule since the floor snapshot: not
 *      started → upcoming; started, slot not over (five minutes' slack) → in
 *      progress; slot over → never logged.
 *   5. …except that when Journey's sessions could not be read (or have not
 *      arrived yet), a finished slot is UNKNOWN. A failed read is unknown,
 *      never "never logged".
 *
 * An "In-Progress" session does not complete a booking: End Session has not
 * been pressed, and a session left open past its slot is exactly what a
 * leader should chase. Deleting a session removes its document (the History
 * pop-up, the tracker), so a deleted session is simply absent from the read.
 *
 * PURE. The caller reads the sessions — one bounded query scoped to the studio
 * (or to the one client), never one query per client — and hands them over
 * through `loggedSessions`, which indexes them once. The marks, likewise, are
 * one bounded read of the studio's `bookingMarks` (by `day`), indexed once by
 * `bookingMarks`. A caller that doesn't read them passes nothing, and a
 * marked booking then reads as it did before the mark (never logged).
 */
import type { ScheduleEntry, WorkoutSession } from "../types";
import { sessionDayKey } from "../features/client-history/model";
import { studioDateKey, toDate } from "./studio-time";

export type BookingState =
  | "cancelled"
  | "completed"
  | "no-show"
  /** The start time has not arrived. */
  | "upcoming"
  /** Started, and the slot (plus five minutes) is not over. */
  | "in-progress"
  /** The slot is over and nothing says it happened — the one to chase. */
  | "never-logged"
  /** The slot is over and Journey's sessions could not be read. */
  | "unknown";

/** What a booking needs to carry. Any schedule-shaped row fits. */
export interface BookingLike {
  /** The booking's document id (Mindbody's appointment id): what a leader's mark is keyed by. */
  id?: string | null;
  clientId?: string | null;
  startTime: unknown;
  endTime?: unknown;
  status: ScheduleEntry["status"] | string;
}

/** What a session needs to carry to say "this client trained that day". */
export type SessionLike = Pick<WorkoutSession, "status"> & Partial<WorkoutSession>;

/**
 * The client-days Journey holds a completed session for. Built once from a
 * list of sessions; `null` in its place means the list is not known.
 */
export interface LoggedSessions {
  has(clientId: string, day: string): boolean;
  /**
   * False when the list may be missing sessions: only the iPad's cache has
   * answered so far (useSessions' `sessionsKnown`, speed round R16). A cache
   * can miss a session but cannot invent a finished one, so what `has` finds
   * is still logged; what it does not find proves nothing, and a finished
   * slot reads "unknown", never "never logged". Absent means complete.
   */
  readonly complete?: boolean;
}

/**
 * The bookings a studio's leaders marked "didn't come" (`studios/{s}/bookingMarks`,
 * keyed by the booking's id). Built once from a read of the marks; `null` in
 * its place means the marks weren't read, and nothing is taken as marked.
 */
export interface BookingMarks {
  noShow(bookingId: string): boolean;
}

/** Index a read of the marks. Only a mark that says `noShow: true` counts. */
export function bookingMarks(rows: ReadonlyArray<{ id: string; noShow?: unknown }> | null | undefined): BookingMarks | null {
  if (!rows) return null;
  const ids = new Set<string>();
  for (const r of rows) if (r && r.noShow === true && typeof r.id === "string" && r.id) ids.add(r.id);
  return { noShow: (id) => ids.has(id) };
}

/** Five minutes of slack: a session that ran two minutes over is not an operational problem. */
export const SLOT_SLACK_MS = 5 * 60_000;

const keyOf = (clientId: string, day: string) => `${clientId}|${day}`;

/**
 * Index a read of sessions by client and studio day. Only COMPLETED sessions
 * with a client count. Pass `null` or `undefined` for a read that failed or
 * has not arrived — the answer is then `null`, which `bookingState` reads as
 * unknown rather than as "nothing logged". Pass `complete: false` for a list
 * only the cache has answered: its sessions count, its gaps prove nothing.
 */
export function loggedSessions(
  sessions: ReadonlyArray<SessionLike> | null | undefined,
  tz?: string,
  { complete = true }: { complete?: boolean } = {},
): LoggedSessions | null {
  if (!sessions) return null;
  const days = new Set<string>();
  for (const s of sessions) {
    if (s.status !== "Completed" || !s.clientId) continue;
    const day = sessionDayKey(s as WorkoutSession, tz);
    if (day) days.add(keyOf(s.clientId, day));
  }
  return { has: (clientId, day) => days.has(keyOf(clientId, day)), complete };
}

/**
 * A MINDBODY "UNAVAILABLE" BLOCK: a trainer's time blocked off, not a booking
 * (Openings round, Sep 27 2026; docs/rounds/2026-09-27-openings.md).
 *
 * Such a row reaches the schedule with "Unavailable" where a client's name
 * would be, and the Calendar, the Hub and Relay already draw it as blocked
 * time by this same test on the client name (the Hub card, CalendarView,
 * relay/board/now-context). Nothing in the sync writes one on purpose, so
 * scripts/openings-report.ts counts them before anything relies on them.
 *
 * A staff block is never a booking: it never takes, keeps or moves a
 * standing-week slot (standing-week/check.ts), never shows in Operations →
 * Changes (admin/changes/changes.ts), and never counts on Openings.
 */
export function isStaffBlock(booking: { clientName?: string | null } | null | undefined): boolean {
  return /unavailab/i.test(booking?.clientName ?? "");
}

/** The booking's studio day, `yyyy-mm-dd`, or null when it has no readable start. */
export function bookingDay(booking: BookingLike, tz?: string): string | null {
  return studioDateKey(toDate(booking.startTime as never), tz);
}

/** Has the slot finished, with the five minutes' slack? False when there is no end time. */
export function slotOver(booking: BookingLike, now: Date): boolean {
  const end = toDate(booking.endTime as never);
  return !!end && end.getTime() + SLOT_SLACK_MS < now.getTime();
}

/**
 * The booking's operational state on the studio's Eastern day. `logged` is
 * `loggedSessions(...)` over the sessions read for that day (or that client);
 * `null` when they could not be read. `marks` is `bookingMarks(...)` over the
 * studio's marks, when the caller read them.
 */
export function bookingState(
  booking: BookingLike,
  logged: LoggedSessions | null,
  now: Date,
  tz?: string,
  marks?: BookingMarks | null,
): BookingState {
  if (booking.status === "Cancelled") return "cancelled";

  if (logged && booking.clientId) {
    const day = bookingDay(booking, tz);
    if (day && logged.has(booking.clientId, day)) return "completed";
  }
  if (booking.status === "Completed") return "completed";
  if (booking.status === "No-Show") return "no-show";
  // A leader marked it "didn't come" (rule 3): only a logged session, above, outranks it.
  if (marks && booking.id && marks.noShow(booking.id)) return "no-show";

  const start = toDate(booking.startTime as never);
  if (!start || start > now) return "upcoming";
  if (!slotOver(booking, now)) return "in-progress";
  return logged && logged.complete !== false ? "never-logged" : "unknown";
}

/** How far ahead "Now and the next 30 min" reaches (hub-opportunities/moments-today.ts timeFact). */
const NEXT_HALF_HOUR_MS = 30 * 60_000;

/**
 * The instants at which what a screen says about these bookings can change
 * with the time alone (lib/boundary-clock.ts, the iPad round, Oct 2026): each
 * booking's start less half an hour (it joins "now and the next 30 min"), its
 * start (no longer upcoming; no longer "still to come"), its end, or half an
 * hour after the start when it has none (the row model's slot: Next moves on,
 * "Earlier today"), and its end plus the slack (`slotOver`: in progress
 * becomes not logged). Every bookingState, the Directory's rows, the Hub's
 * moments and Operations' day facts change only at these.
 */
export function bookingBoundaries(entries: Iterable<BookingLike> | null | undefined): number[] {
  const out: number[] = [];
  for (const b of entries ?? []) {
    if (!b) continue;
    const start = toDate(b.startTime as never)?.getTime();
    if (typeof start === "number") out.push(start - NEXT_HALF_HOUR_MS, start, start + NEXT_HALF_HOUR_MS);
    const end = toDate(b.endTime as never)?.getTime();
    if (typeof end === "number") out.push(end, end + SLOT_SLACK_MS + 1);
  }
  return out;
}
