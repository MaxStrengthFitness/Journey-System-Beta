import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../types";
import { bookingState, loggedSessions, slotOver, type BookingLike } from "./booking-state";

const TZ = "America/New_York";
const at = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);
const DAY = "2026-09-24";
const NOW = at(DAY, "12:00");

const booking = (hm: string, over: Partial<BookingLike> = {}, day = DAY): BookingLike => ({
  clientId: "c1",
  startTime: at(day, hm),
  endTime: new Date(at(day, hm).getTime() + 30 * 60_000),
  status: "Scheduled",
  ...over,
});

const session = (over: Partial<WorkoutSession>): WorkoutSession =>
  ({ clientId: "c1", status: "Completed", hostedAtStudioId: "solon", startTime: at(DAY, "09:02"), date: DAY, ...over }) as WorkoutSession;

const logged = (...sessions: WorkoutSession[]) => loggedSessions(sessions, TZ);

describe("bookingState — a Journey session completes the booking", () => {
  it("is completed when a completed Journey session exists for that client on that studio day", () => {
    expect(bookingState(booking("09:00"), logged(session({})), NOW, TZ)).toBe("completed");
  });

  it("matches by the Eastern day: an 8 PM booking and its session are the next day in UTC", () => {
    const evening = booking("20:00", {}, "2026-09-23");
    const s = session({ startTime: new Date("2026-09-24T00:05:00Z"), date: "2026-09-24" }); // 8:05 PM Eastern on the 23rd
    expect(bookingState(evening, logged(s), NOW, TZ)).toBe("completed");
  });

  it("reads a legacy session by its start, not the UTC date it was stored under", () => {
    // Before Sep 10 2026 `date` was the UTC day. The start instant wins.
    const evening = booking("19:30", {}, "2026-01-14");
    const s = session({ startTime: new Date("2026-01-15T00:40:00Z"), date: "2026-01-15" });
    expect(bookingState(evening, logged(s), at("2026-01-15", "09:00"), TZ)).toBe("completed");
  });

  it("is completed per client per day: a double booking with one session reads both done", () => {
    const one = logged(session({}));
    expect(bookingState(booking("09:00"), one, NOW, TZ)).toBe("completed");
    expect(bookingState(booking("15:00"), one, NOW, TZ)).toBe("completed");
  });

  it("a logged session beats a Mindbody no-show — it is proof they trained", () => {
    expect(bookingState(booking("09:00", { status: "No-Show" }), logged(session({})), NOW, TZ)).toBe("completed");
  });

  it("never matches another client, another day, an open session, or a booking with no client", () => {
    const stranger = logged(session({ clientId: "c2" }));
    expect(bookingState(booking("09:00"), stranger, NOW, TZ)).toBe("never-logged");

    const yesterday = logged(session({ startTime: at("2026-09-23", "09:00"), date: "2026-09-23" }));
    expect(bookingState(booking("09:00"), yesterday, NOW, TZ)).toBe("never-logged");

    const open = logged(session({ status: "In-Progress" }));
    expect(bookingState(booking("09:00"), open, NOW, TZ)).toBe("never-logged");

    // Never by name: an unlinked booking cannot be completed by a session that shares its name.
    const byName = logged(session({ clientId: undefined, clientName: "Ann Able" }));
    expect(bookingState(booking("09:00", { clientId: null }), byName, NOW, TZ)).toBe("never-logged");
    expect(bookingState(booking("09:00", { clientId: null }), logged(session({})), NOW, TZ)).toBe("never-logged");
  });
});

describe("bookingState — otherwise, today's rule", () => {
  const none = logged();

  it("a cancellation stays a cancellation, whatever else happened that day", () => {
    expect(bookingState(booking("09:00", { status: "Cancelled" }), logged(session({})), NOW, TZ)).toBe("cancelled");
    expect(bookingState(booking("09:00", { status: "Cancelled" }), null, NOW, TZ)).toBe("cancelled");
  });

  it("honours Mindbody's own Completed and No-Show when someone marked them there", () => {
    expect(bookingState(booking("09:00", { status: "Completed" }), none, NOW, TZ)).toBe("completed");
    expect(bookingState(booking("09:00", { status: "No-Show" }), none, NOW, TZ)).toBe("no-show");
  });

  it("reads the clock: upcoming, in progress, and never logged once the slot and five minutes are over", () => {
    expect(bookingState(booking("14:00"), none, NOW, TZ)).toBe("upcoming");
    expect(bookingState(booking("11:45"), none, NOW, TZ)).toBe("in-progress");
    expect(bookingState(booking("11:27"), none, NOW, TZ)).toBe("in-progress"); // ended 11:57 — inside the slack
    expect(bookingState(booking("11:00"), none, NOW, TZ)).toBe("never-logged");
  });

  it("a booking with no start is upcoming, and one with no end is never judged over", () => {
    expect(bookingState(booking("09:00", { startTime: null }), none, NOW, TZ)).toBe("upcoming");
    expect(bookingState(booking("09:00", { endTime: undefined }), none, NOW, TZ)).toBe("in-progress");
    expect(slotOver(booking("09:00", { endTime: undefined }), NOW)).toBe(false);
  });
});

describe("bookingState — a failed read is unknown, never 'never logged'", () => {
  it("a finished slot with no sessions to read is unknown", () => {
    expect(loggedSessions(null)).toBeNull();
    expect(loggedSessions(undefined)).toBeNull();
    expect(bookingState(booking("09:00"), null, NOW, TZ)).toBe("unknown");
  });

  it("what the clock or Mindbody already knows stays known", () => {
    expect(bookingState(booking("14:00"), null, NOW, TZ)).toBe("upcoming");
    expect(bookingState(booking("11:45"), null, NOW, TZ)).toBe("in-progress");
    expect(bookingState(booking("09:00", { status: "Completed" }), null, NOW, TZ)).toBe("completed");
  });

  it("an empty read is known: nothing logged is never logged", () => {
    expect(bookingState(booking("09:00"), loggedSessions([]), NOW, TZ)).toBe("never-logged");
  });
});
