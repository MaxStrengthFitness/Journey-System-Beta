import { describe, expect, it } from "vitest";
import {
  HEADS_UP_SESSIONS,
  headsUpCount,
  headsUpCountFrom,
  headsUpStanding,
  isHeadsUpLive,
  sessionStartMs,
  sessionStarts,
} from "./heads-up";

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 3, 10, 30).getTime(); // Oct 3 2026, 10:30 local
const at = (daysAgo: number, hour = 10) => {
  const d = new Date(NOW - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const ms = (d: Date) => d.getTime();

const headsUp = (written: Date, extra: Record<string, unknown> = {}) => ({
  importance: "elevated" as const,
  resolvedAt: null,
  effectiveUntil: null,
  effectiveFrom: null,
  occurredAt: written,
  createdAt: written,
  ...extra,
});

describe("a Heads up is read out at four of her sessions (AJ, Oct 3 2026)", () => {
  it("is four", () => {
    expect(HEADS_UP_SESSIONS).toBe(4);
  });

  it("stays on until four sessions after it was written, however long that takes", () => {
    const note = headsUp(at(40));
    // Three sessions in forty days: still on the briefing (the old clock dropped it at 21 days).
    expect(isHeadsUpLive(note, NOW, { sessionStarts: [ms(at(30)), ms(at(20)), ms(at(2))] })).toBe(true);
    // The fourth takes it off.
    expect(
      isHeadsUpLive(note, NOW, { sessionStarts: [ms(at(30)), ms(at(20)), ms(at(9)), ms(at(2))] }),
    ).toBe(false);
  });

  it("goes quiet after four sessions even inside a week", () => {
    const note = headsUp(at(6, 8));
    const starts = [5, 4, 3, 2].map((d) => ms(at(d)));
    expect(isHeadsUpLive(note, NOW, { sessionStarts: starts })).toBe(false);
  });

  it("does not count sessions from before it was written", () => {
    const note = headsUp(at(3));
    const starts = [30, 20, 10, 5, 4].map((d) => ms(at(d)));
    expect(isHeadsUpLive(note, NOW, { sessionStarts: starts })).toBe(true);
  });

  it("a note written at the briefing is heard at that session; one written mid-session is not", () => {
    const sessionStart = at(1, 10);
    const beforeStart = new Date(ms(sessionStart) - 5 * 60_000);
    const midSession = new Date(ms(sessionStart) + 8 * 60_000);
    expect(headsUpCount(ms(beforeStart), [ms(sessionStart)]).heard).toBe(1);
    expect(headsUpCount(ms(midSession), [ms(sessionStart)]).heard).toBe(0);
  });

  it("an update restarts the count — that is how a trainer keeps it on", () => {
    const note = headsUp(at(20));
    const starts = [18, 15, 12, 9].map((d) => ms(at(d)));
    expect(isHeadsUpLive(note, NOW, { sessionStarts: starts })).toBe(false);
    expect(isHeadsUpLive(note, NOW, { sessionStarts: starts, latestUpdateMs: ms(at(10, 12)) })).toBe(true);
  });

  it("a note dated ahead counts from its day (surgery on the 14th)", () => {
    const written = at(5);
    const surgery = new Date(NOW + 7 * DAY);
    const note = headsUp(written, { occurredAt: surgery, createdAt: written });
    const starts = [4, 3, 2, 1].map((d) => ms(at(d)));
    expect(headsUpCountFrom(note)).toBe(ms(surgery));
    expect(isHeadsUpLive(note, NOW, { sessionStarts: starts })).toBe(true);
  });

  it("a note back-dated when written counts from when it was written, not from its date", () => {
    // "Surgery was on the 14th", written today about a month-old surgery.
    const note = headsUp(at(30), { createdAt: at(0, 9) });
    const starts = [25, 20, 15, 10, 5].map((d) => ms(at(d)));
    expect(isHeadsUpLive(note, NOW, { sessionStarts: starts })).toBe(true);
  });

  it("falls back to the three-week clock while her sessions are unknown, never to 'no sessions'", () => {
    expect(isHeadsUpLive(headsUp(at(10)), NOW, { sessionStarts: null })).toBe(true);
    expect(isHeadsUpLive(headsUp(at(25)), NOW, { sessionStarts: null })).toBe(false);
    expect(isHeadsUpLive(headsUp(at(25)), NOW)).toBe(false);
  });

  it("a window of its own is read by the mattering rule, not the count", () => {
    const until = new Date(NOW + 10 * DAY);
    const note = headsUp(at(30), { effectiveUntil: until });
    const starts = [25, 20, 15, 10, 5].map((d) => ms(at(d)));
    expect(isHeadsUpLive(note, NOW, { sessionStarts: starts })).toBe(true);
  });

  it("only ever a Heads up that is not closed", () => {
    const starts: number[] = [];
    expect(isHeadsUpLive(headsUp(at(1), { importance: "critical" }), NOW, { sessionStarts: starts })).toBe(false);
    expect(isHeadsUpLive(headsUp(at(1), { importance: "standard" }), NOW, { sessionStarts: starts })).toBe(false);
    expect(isHeadsUpLive(headsUp(at(1), { resolvedAt: at(0) }), NOW, { sessionStarts: starts })).toBe(false);
  });

  it("a note with no readable date is not live", () => {
    expect(isHeadsUpLive(headsUp(at(1), { occurredAt: null, createdAt: null }), NOW, { sessionStarts: [] })).toBe(false);
  });
});

describe("headsUpStanding — what the Notes page card says", () => {
  it("counts down the sessions left", () => {
    const note = headsUp(at(10));
    expect(headsUpStanding(note, { sessionStarts: [ms(at(5))] })).toEqual({ left: 3 });
  });

  it("names the day it went quiet: the fourth session's day", () => {
    const note = headsUp(at(20));
    const starts = [18, 15, 12, 9, 2].map((d) => ms(at(d)));
    const standing = headsUpStanding(note, { sessionStarts: starts }, "America/New_York");
    expect(standing).toEqual({ quietSince: "2026-09-24" });
  });

  it("says nothing while her sessions are unknown, or for a dated note", () => {
    expect(headsUpStanding(headsUp(at(10)), { sessionStarts: null })).toBeNull();
    expect(
      headsUpStanding(headsUp(at(10), { effectiveUntil: new Date(NOW + DAY) }), { sessionStarts: [] }),
    ).toBeNull();
  });
});

describe("sessionStartMs — when a session started", () => {
  it("prefers the server's start, then the iPad's clock, then the day at noon", () => {
    const server = new Date(2026, 9, 1, 9, 0);
    expect(sessionStartMs({ startTime: server, clientStartTime: "2026-10-01T13:05:00.000Z", date: "2026-10-01" })).toBe(
      ms(server),
    );
    expect(sessionStartMs({ startTime: null, clientStartTime: "2026-10-01T13:05:00.000Z" })).toBe(
      Date.parse("2026-10-01T13:05:00.000Z"),
    );
    expect(sessionStartMs({ date: "2026-10-01" })).toBe(ms(new Date(2026, 9, 1, 12, 0)));
    expect(sessionStartMs({})).toBeNull();
  });

  it("reads a Firestore-like timestamp and drops the unreadable", () => {
    const ts = { toDate: () => new Date(2026, 9, 2, 8, 0) };
    expect(sessionStarts([{ startTime: ts }, {}, { date: "2026-10-01" }])).toEqual([
      ms(new Date(2026, 9, 1, 12, 0)),
      ms(new Date(2026, 9, 2, 8, 0)),
    ]);
  });
});
