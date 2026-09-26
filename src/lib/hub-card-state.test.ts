import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../types";
import { loggedSessions, type BookingLike } from "./booking-state";
import { hubCardRecedes, hubCardState, sessionsByClientDay } from "./hub-card-state";

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

const nothing = loggedSessions([], TZ);
const logged = (...sessions: WorkoutSession[]) => loggedSessions(sessions, TZ);

describe("hubCardState — the card stays live until the booking is done", () => {
  it("is live while the booking is ahead", () => {
    expect(hubCardState(booking("15:00"), nothing, NOW, { tz: TZ })).toBe("live");
  });

  it("is live in its slot with nothing started — the trainer running a few minutes late still sees the flags", () => {
    expect(hubCardState(booking("11:45"), nothing, NOW, { tz: TZ })).toBe("live");
  });

  it("stays live through the five minutes' slack after the slot", () => {
    // 11:25–11:55, now 12:00: over by five minutes exactly, not more.
    expect(hubCardState(booking("11:25"), nothing, NOW, { tz: TZ })).toBe("live");
  });

  it("is done the moment a completed Journey session exists for that client that day", () => {
    // Ran early and pressed End Session inside the slot.
    expect(hubCardState(booking("11:40"), logged(session({ startTime: at(DAY, "11:38") })), NOW, { tz: TZ })).toBe("done");
  });

  it("reads 'not logged' once the slot is over and nothing was logged", () => {
    expect(hubCardState(booking("11:00"), nothing, NOW, { tz: TZ })).toBe("not-logged");
  });

  it("claims nothing when the sessions could not be read: past, never 'not logged'", () => {
    expect(hubCardState(booking("11:00"), null, NOW, { tz: TZ })).toBe("past");
  });

  it("keeps a slot in progress live even while the sessions are still loading", () => {
    expect(hubCardState(booking("11:45"), null, NOW, { tz: TZ })).toBe("live");
  });

  it("a session open for the client is in session — past the slot too, because it is still going", () => {
    expect(hubCardState(booking("11:00"), nothing, NOW, { sessionOpen: true, tz: TZ })).toBe("in-session");
    expect(hubCardState(booking("11:45"), nothing, NOW, { sessionOpen: true, tz: TZ })).toBe("in-session");
  });

  it("a Mindbody no-show or a cancellation recedes and says nothing", () => {
    expect(hubCardState(booking("09:00", { status: "No-Show" }), nothing, NOW, { tz: TZ })).toBe("past");
    expect(hubCardState(booking("09:00", { status: "Cancelled" }), nothing, NOW, { tz: TZ })).toBe("past");
  });
});

describe("hubCardState — booked twice in a day (AJ, Sep 24)", () => {
  const morning = logged(session({ startTime: at(DAY, "09:02") }));

  it("the later card does not recede before its own start, although the morning's session was logged", () => {
    expect(hubCardState(booking("16:00"), morning, NOW, { tz: TZ })).toBe("live");
  });

  it("once its start has passed, the per-day rule stands: done", () => {
    expect(hubCardState(booking("16:00"), morning, at(DAY, "16:10"), { tz: TZ })).toBe("done");
  });
});

describe("hubCardRecedes", () => {
  it("fades what is over and nothing else", () => {
    expect(hubCardRecedes("live")).toBe(false);
    expect(hubCardRecedes("in-session")).toBe(false);
    expect(hubCardRecedes("done")).toBe(true);
    expect(hubCardRecedes("not-logged")).toBe(true);
    expect(hubCardRecedes("past")).toBe(true);
  });
});

describe("sessionsByClientDay", () => {
  it("finds the client's session on the booking's studio day, not the iPad's", () => {
    // 8:05 PM Eastern on the 23rd is already the 24th in UTC.
    const evening = session({ id: "s1", startTime: new Date("2026-09-24T00:05:00Z"), date: "2026-09-23" });
    const find = sessionsByClientDay([evening], TZ);
    expect(find("c1", "2026-09-23")?.id).toBe("s1");
    expect(find("c1", "2026-09-24")).toBeNull();
  });

  it("does not hand this morning's session to tomorrow's booking", () => {
    const find = sessionsByClientDay([session({ id: "s1", status: "In-Progress" })], TZ);
    expect(find("c1", DAY)?.id).toBe("s1");
    expect(find("c1", "2026-09-25")).toBeNull();
  });

  it("keeps the newest of a day (the stream is newest first) and never matches another client", () => {
    const find = sessionsByClientDay(
      [
        session({ id: "restart", status: "In-Progress", startTime: at(DAY, "09:10") }),
        session({ id: "first", status: "In-Progress", startTime: at(DAY, "09:02") }),
        session({ id: "other", clientId: "c2" }),
      ],
      TZ,
    );
    expect(find("c1", DAY)?.id).toBe("restart");
    expect(find("c2", DAY)?.id).toBe("other");
    expect(find("c3", DAY)).toBeNull();
    expect(find(null, DAY)).toBeNull();
    expect(find("c1", null)).toBeNull();
  });
});
