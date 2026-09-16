import { describe, expect, it } from "vitest";
import { HEADS_UP_WINDOW_DAYS, isHeadsUpLive } from "../../hooks/useClientJournal";

const DAY = 86_400_000;
const NOW = new Date(2026, 8, 16, 10, 30).getTime(); // Sep 16 2026, 10:30 local
const daysAgo = (n: number) => new Date(NOW - n * DAY);

describe("isHeadsUpLive — a Heads up stays on the briefing while it matters", () => {
  const base = { importance: "elevated" as const, resolvedAt: null, effectiveUntil: null, occurredAt: daysAgo(1) };

  it("is three weeks", () => {
    expect(HEADS_UP_WINDOW_DAYS).toBe(21);
  });

  it("is live inside the window and gone after it", () => {
    expect(isHeadsUpLive({ ...base, occurredAt: daysAgo(0) }, NOW)).toBe(true);
    expect(isHeadsUpLive({ ...base, occurredAt: daysAgo(20) }, NOW)).toBe(true);
    expect(isHeadsUpLive({ ...base, occurredAt: daysAgo(22) }, NOW)).toBe(false);
  });

  it("honours an until day: today counts, yesterday does not", () => {
    // A note from a month ago with an until of today is still read out this morning.
    const untilToday = new Date(2026, 8, 16, 23, 59, 59);
    expect(isHeadsUpLive({ ...base, occurredAt: daysAgo(40), effectiveUntil: untilToday }, NOW)).toBe(true);
    const untilYesterday = new Date(2026, 8, 15, 23, 59, 59);
    expect(isHeadsUpLive({ ...base, occurredAt: daysAgo(1), effectiveUntil: untilYesterday }, NOW)).toBe(false);
    const untilNextWeek = new Date(2026, 8, 23, 12);
    expect(isHeadsUpLive({ ...base, occurredAt: daysAgo(40), effectiveUntil: untilNextWeek }, NOW)).toBe(true);
  });

  it("only ever says yes to a Heads up that is not resolved", () => {
    expect(isHeadsUpLive({ ...base, importance: "critical" }, NOW)).toBe(false);
    expect(isHeadsUpLive({ ...base, importance: "standard" }, NOW)).toBe(false);
    expect(isHeadsUpLive({ ...base, resolvedAt: daysAgo(0) }, NOW)).toBe(false);
  });

  it("a note dated ahead is live", () => {
    expect(isHeadsUpLive({ ...base, occurredAt: new Date(NOW + 4 * DAY) }, NOW)).toBe(true);
  });

  it("a note with no readable date is not", () => {
    expect(isHeadsUpLive({ ...base, occurredAt: null }, NOW)).toBe(false);
  });
});
