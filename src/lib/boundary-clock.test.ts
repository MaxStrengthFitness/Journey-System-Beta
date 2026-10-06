import { describe, expect, it } from "vitest";
import { clockMoved, nextBoundaryAfter, sortBoundaries } from "./boundary-clock";

const ET = "America/New_York";
const at = (iso: string) => Date.parse(iso);

describe("nextBoundaryAfter", () => {
  const sorted = [10, 20, 30];
  it("finds the first boundary strictly after the time", () => {
    expect(nextBoundaryAfter(sorted, 0)).toBe(10);
    expect(nextBoundaryAfter(sorted, 10)).toBe(20);
    expect(nextBoundaryAfter(sorted, 25)).toBe(30);
    expect(nextBoundaryAfter(sorted, 30)).toBeNull();
    expect(nextBoundaryAfter([], 5)).toBeNull();
  });
});

describe("sortBoundaries", () => {
  it("keeps finite instants, ascending, once each", () => {
    expect(sortBoundaries([30, null, 10, undefined, 30, Number.NaN, 20])).toEqual([10, 20, 30]);
  });
});

describe("clockMoved", () => {
  const two = at("2026-09-27T18:00:00Z"); // 2:00 PM Eastern
  const end = at("2026-09-27T19:30:00Z"); // a booking ends at 3:30 PM

  it("stays put between boundaries, minute after minute", () => {
    for (let m = 1; m < 90; m++) expect(clockMoved(two, two + m * 60_000, [end], ET)).toBe(false);
  });

  it("moves once a boundary has been crossed, including exactly on it", () => {
    expect(clockMoved(two, end, [end], ET)).toBe(true);
    expect(clockMoved(two, end + 60_000, [end], ET)).toBe(true);
    // Held after the boundary: that one is behind it.
    expect(clockMoved(end, end + 60_000, [end], ET)).toBe(false);
  });

  it("moves when the studio's day turns at midnight Eastern, not at midnight UTC", () => {
    const beforeMidnight = at("2026-09-28T03:59:00Z"); // 11:59 PM Eastern
    expect(clockMoved(beforeMidnight, at("2026-09-28T04:00:00Z"), [], ET)).toBe(true);
    expect(clockMoved(at("2026-09-27T23:59:00Z"), at("2026-09-28T00:01:00Z"), [], ET)).toBe(false);
  });

  it("moves across the day on both 2026 transition nights", () => {
    expect(clockMoved(at("2026-03-08T04:59:00Z"), at("2026-03-08T05:00:00Z"), [], ET)).toBe(true); // EST midnight
    expect(clockMoved(at("2026-11-01T03:59:00Z"), at("2026-11-01T04:00:00Z"), [], ET)).toBe(true); // EDT midnight
    expect(clockMoved(at("2026-11-01T05:30:00Z"), at("2026-11-01T06:30:00Z"), [], ET)).toBe(false); // 1:30 AM twice
  });

  it("moves when the iPad's clock goes backwards", () => {
    expect(clockMoved(two, two - 1, [], ET)).toBe(true);
  });
});
