import { describe, expect, it } from "vitest";
import { choiceOf, daysMattering, describeWindow, mattersOn, needsReview, nextOccurrence, shapeOf, startDayOf, windowFromChoice, type MatteringFields } from "./mattering";

const TZ = "America/New_York";
const noon = (day: string) => new Date(`${day}T12:00:00-04:00`);
const eod = (day: string) => new Date(`${day}T23:59:59-04:00`);

const note = (over: Partial<MatteringFields> & { importance?: "standard" | "elevated" | "critical" } = {}) => ({
  importance: "critical" as const,
  resolvedAt: null,
  isArchived: false,
  occurredAt: noon("2026-09-01"),
  effectiveFrom: null,
  effectiveUntil: null,
  ...over,
});

describe("the three shapes", () => {
  it("no until is always; from and until on different days is a range; the same day is a day", () => {
    expect(shapeOf(note(), TZ)).toBe("always");
    expect(shapeOf(note({ effectiveFrom: noon("2026-09-20") }), TZ)).toBe("always");
    expect(shapeOf(note({ effectiveUntil: eod("2026-10-01") }), TZ)).toBe("range");
    expect(shapeOf(note({ effectiveFrom: noon("2026-09-20"), effectiveUntil: eod("2026-10-01") }), TZ)).toBe("range");
    expect(shapeOf(note({ effectiveFrom: noon("2026-11-05"), effectiveUntil: eod("2026-11-05") }), TZ)).toBe("day");
  });

  it("starts on effectiveFrom, else the day it was written", () => {
    expect(startDayOf(note(), TZ)).toBe("2026-09-01");
    expect(startDayOf(note({ effectiveFrom: noon("2026-09-20") }), TZ)).toBe("2026-09-20");
  });
});

describe("mattersOn", () => {
  it("an ALWAYS note matters from the day it was written until it is resolved", () => {
    expect(mattersOn(note(), "2026-08-31", TZ)).toBe(false);
    expect(mattersOn(note(), "2026-09-01", TZ)).toBe(true);
    expect(mattersOn(note(), "2027-09-01", TZ)).toBe(true);
    expect(mattersOn(note({ resolvedAt: noon("2026-09-10") }), "2026-09-11", TZ)).toBe(false);
    expect(mattersOn(note({ isArchived: true }), "2026-09-11", TZ)).toBe(false);
  });

  it("a pushed-ahead start waits", () => {
    const n = note({ effectiveFrom: noon("2026-09-20") });
    expect(mattersOn(n, "2026-09-19", TZ)).toBe(false);
    expect(mattersOn(n, "2026-09-20", TZ)).toBe(true);
  });

  it("a RANGE note stops after its until day, inclusive", () => {
    const n = note({ effectiveFrom: noon("2026-09-10"), effectiveUntil: eod("2026-09-30") });
    expect(mattersOn(n, "2026-09-09", TZ)).toBe(false);
    expect(mattersOn(n, "2026-09-10", TZ)).toBe(true);
    expect(mattersOn(n, "2026-09-30", TZ)).toBe(true);
    expect(mattersOn(n, "2026-10-01", TZ)).toBe(false);
  });

  it("a DAY note matters on its day only", () => {
    const n = note({ effectiveFrom: noon("2026-11-05"), effectiveUntil: eod("2026-11-05") });
    expect(mattersOn(n, "2026-11-04", TZ)).toBe(false);
    expect(mattersOn(n, "2026-11-05", TZ)).toBe(true);
    expect(mattersOn(n, "2026-11-06", TZ)).toBe(false);
    expect(mattersOn(n, "2027-11-05", TZ)).toBe(false);
  });

  it("a yearly DAY note comes back every year, never before its first", () => {
    const n = note({ effectiveFrom: noon("2026-11-05"), effectiveUntil: eod("2026-11-05"), repeat: "yearly" });
    expect(mattersOn(n, "2025-11-05", TZ)).toBe(false);
    expect(mattersOn(n, "2026-11-05", TZ)).toBe(true);
    expect(mattersOn(n, "2027-11-05", TZ)).toBe(true);
    expect(mattersOn(n, "2027-11-06", TZ)).toBe(false);
  });

  it("reads the window in the studio's day, not UTC's", () => {
    // 11 PM Eastern on the 5th is the 6th in UTC; the note is still a 5th note.
    const n = note({ effectiveFrom: new Date("2026-11-05T23:00:00-05:00"), effectiveUntil: new Date("2026-11-05T23:59:59-05:00") });
    expect(shapeOf(n, TZ)).toBe("day");
    expect(mattersOn(n, "2026-11-05", TZ)).toBe(true);
    expect(mattersOn(n, "2026-11-06", TZ)).toBe(false);
  });
});

describe("nextOccurrence", () => {
  const bday = note({ effectiveFrom: noon("2026-11-05"), effectiveUntil: eod("2026-11-05"), repeat: "yearly" });
  it("a coming day is itself", () => {
    expect(nextOccurrence(bday, "2026-09-19", TZ)).toBe("2026-11-05");
    expect(nextOccurrence(bday, "2026-11-05", TZ)).toBe("2026-11-05");
  });
  it("a passed yearly day rolls to next year", () => {
    expect(nextOccurrence(bday, "2026-11-06", TZ)).toBe("2027-11-05");
  });
  it("a passed one-off, a range and an always note have no next", () => {
    expect(nextOccurrence(note({ effectiveFrom: noon("2026-09-01"), effectiveUntil: eod("2026-09-01") }), "2026-09-19", TZ)).toBeNull();
    expect(nextOccurrence(note({ effectiveUntil: eod("2026-12-01") }), "2026-09-19", TZ)).toBeNull();
    expect(nextOccurrence(note(), "2026-09-19", TZ)).toBeNull();
  });
});

describe("the 60-day review", () => {
  it("an ALWAYS note that has mattered for 60 days is due a look", () => {
    expect(needsReview(note(), "2026-10-30", TZ)).toBe(false); // 59 days
    expect(needsReview(note(), "2026-10-31", TZ)).toBe(true); // 60
    expect(daysMattering(note(), "2026-10-31", TZ)).toBe(60);
  });
  it("a review restarts the clock", () => {
    expect(needsReview(note({ reviewedAt: noon("2026-10-15") }), "2026-10-31", TZ)).toBe(false);
    expect(needsReview(note({ reviewedAt: noon("2026-10-15") }), "2026-12-14", TZ)).toBe(true);
  });
  it("a range, a day, a resolved note and a standard note are never reviewed", () => {
    expect(needsReview(note({ effectiveUntil: eod("2027-01-01") }), "2026-12-01", TZ)).toBe(false);
    expect(needsReview(note({ effectiveFrom: noon("2026-11-05"), effectiveUntil: eod("2026-11-05"), repeat: "yearly" }), "2026-11-05", TZ)).toBe(false);
    expect(needsReview(note({ resolvedAt: noon("2026-09-02") }), "2026-12-01", TZ)).toBe(false);
    expect(needsReview(note({ importance: "standard" }), "2026-12-01", TZ)).toBe(false);
  });
});

describe("the composer's choice ↔ the fields", () => {
  it("always with no date leaves everything null", () => {
    expect(windowFromChoice({ shape: "always", from: "", until: "", repeat: false })).toEqual({ effectiveFrom: null, effectiveUntil: null, repeat: null });
  });
  it("always with a future start keeps only the start", () => {
    const w = windowFromChoice({ shape: "always", from: "2026-09-20", until: "", repeat: false });
    expect(w.effectiveFrom?.getHours()).toBe(12);
    expect(w.effectiveUntil).toBeNull();
  });
  it("a day is from noon to end of day on that date, with its repeat", () => {
    const w = windowFromChoice({ shape: "day", from: "2026-11-05", until: "", repeat: true });
    expect(w.effectiveFrom?.getDate()).toBe(5);
    expect(w.effectiveUntil?.getHours()).toBe(23);
    expect(w.repeat).toBe("yearly");
  });
  it("a range takes both ends and no repeat", () => {
    const w = windowFromChoice({ shape: "range", from: "2026-09-10", until: "2026-09-30", repeat: true });
    expect(w.effectiveFrom?.getDate()).toBe(10);
    expect(w.effectiveUntil?.getDate()).toBe(30);
    expect(w.repeat).toBeNull();
  });
  it("reads a choice back out of an entry", () => {
    expect(choiceOf(note({ effectiveFrom: noon("2026-11-05"), effectiveUntil: eod("2026-11-05"), repeat: "yearly" }), TZ)).toEqual({ shape: "day", from: "2026-11-05", until: "2026-11-05", repeat: true });
    expect(choiceOf(note({ effectiveUntil: eod("2026-09-30") }), TZ)).toEqual({ shape: "range", from: "", until: "2026-09-30", repeat: false });
  });
  it("describes the window in one line", () => {
    expect(describeWindow(note(), TZ)).toBe("Matters always");
    expect(describeWindow(note({ effectiveFrom: noon("2026-09-20") }), TZ)).toBe("Matters from Sep 20");
    expect(describeWindow(note({ effectiveUntil: eod("2026-09-30") }), TZ)).toBe("Matters until Sep 30");
    expect(describeWindow(note({ effectiveFrom: noon("2026-09-10"), effectiveUntil: eod("2026-09-30") }), TZ)).toBe("Matters Sep 10 – Sep 30");
    expect(describeWindow(note({ effectiveFrom: noon("2026-11-05"), effectiveUntil: eod("2026-11-05"), repeat: "yearly" }), TZ)).toBe("Only on Nov 5, every year");
  });
});
