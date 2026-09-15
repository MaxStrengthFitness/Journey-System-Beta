import { describe, expect, it } from "vitest";
import type { ClientFocus } from "../../types/journal";
import {
  FOCUS_SNAPSHOT_MAX,
  focusLine,
  focusSnapshotFrom,
  focusWeeks,
  newestActiveCategory,
  snapshotLine,
  sortFocuses,
} from "./focus-history";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });
const asOf = new Date("2026-09-15T12:00:00");

const focus = (over: Partial<ClientFocus>): ClientFocus =>
  ({
    id: "f",
    clientId: "c",
    studioId: "s",
    trainerId: "t",
    trainerName: "Austin Jurgens",
    trainerInitials: "AJ",
    category: "Pace",
    intent: "Slow the lowering phase on the leg press",
    targetMachineId: null,
    status: "active",
    startedAt: ts("2026-08-24T12:00:00"),
    reviewDueAt: null,
    passedAt: null,
    lastExtendedAt: null,
    extensionCount: 0,
    checkInCount: 0,
    lastCheckInAt: null,
    createdAt: null,
    updatedAt: ts("2026-09-01T15:00:00"),
    ...over,
  }) as ClientFocus;

describe("focusWeeks", () => {
  it("an active focus runs to the report date", () => {
    expect(focusWeeks(focus({}), asOf)).toBe(3);
  });

  it("a passed focus runs to the day it passed", () => {
    expect(
      focusWeeks(focus({ status: "passed", startedAt: ts("2026-06-01T12:00:00"), passedAt: ts("2026-06-23T12:00:00") }), asOf),
    ).toBe(3);
  });

  it("a retired focus runs to its last update", () => {
    expect(
      focusWeeks(focus({ status: "retired", startedAt: ts("2026-06-01T12:00:00"), updatedAt: ts("2026-06-10T12:00:00") }), asOf),
    ).toBe(1);
  });

  it("is unknown, not zero, when a date is missing or backwards", () => {
    expect(focusWeeks(focus({ startedAt: null }), asOf)).toBeNull();
    expect(focusWeeks(focus({ status: "passed", passedAt: null, updatedAt: null }), asOf)).toBeNull();
    expect(focusWeeks(focus({ status: "retired", updatedAt: ts("2026-01-01T00:00:00") }), asOf)).toBeNull();
  });
});

describe("focusLine", () => {
  it("reads as a sentence", () => {
    expect(focusLine(focus({}), asOf)).toBe("Pace — in progress for 3 weeks · set by AJ");
    expect(
      focusLine(
        focus({ status: "passed", startedAt: ts("2026-06-01T12:00:00"), passedAt: ts("2026-06-23T12:00:00") }),
        asOf,
      ),
    ).toBe("Pace — achieved after 3 weeks · set by AJ");
    expect(
      focusLine(
        focus({ status: "retired", category: "Path", startedAt: ts("2026-06-01T12:00:00"), updatedAt: ts("2026-06-03T12:00:00") }),
        asOf,
      ),
    ).toBe("Path — retired after less than a week · set by AJ");
  });

  it("drops what it doesn't know rather than guessing", () => {
    expect(focusLine(focus({ startedAt: null, trainerInitials: "" }), asOf)).toBe("Pace — in progress");
    expect(focusLine(focus({ status: "passed", startedAt: ts("2026-06-01T12:00:00"), passedAt: ts("2026-06-08T13:00:00") }), asOf)).toBe(
      "Pace — achieved after 1 week · set by AJ",
    );
  });
});

describe("sortFocuses", () => {
  it("puts active focuses first, newest start first, then the most recently ended", () => {
    const list = [
      focus({ id: "old-pass", status: "passed", passedAt: ts("2026-03-01T12:00:00"), startedAt: ts("2026-02-01T12:00:00") }),
      focus({ id: "active-old", startedAt: ts("2026-07-01T12:00:00") }),
      focus({ id: "new-pass", status: "passed", passedAt: ts("2026-08-01T12:00:00"), startedAt: ts("2026-07-01T12:00:00") }),
      focus({ id: "active-new", startedAt: ts("2026-09-01T12:00:00") }),
    ];
    expect(sortFocuses(list, asOf).map((f) => f.id)).toEqual(["active-new", "active-old", "new-pass", "old-pass"]);
    // Pure: the input order is untouched.
    expect(list[0].id).toBe("old-pass");
  });
});

describe("focusSnapshotFrom", () => {
  it("keeps only category, status, weeks and initials — nothing personal", () => {
    const [entry] = focusSnapshotFrom([focus({})], asOf);
    expect(entry).toEqual({ category: "Pace", status: "active", weeks: 3, trainerInitials: "AJ" });
    const text = JSON.stringify(focusSnapshotFrom([focus({})], asOf));
    expect(text).not.toContain("leg press");
    expect(text).not.toContain("Austin");
  });

  it("drops focuses with a category or status the rules don't allow", () => {
    const bad = [focus({ category: "Personal" as any }), focus({ status: "deleted" as any })];
    expect(focusSnapshotFrom(bad, asOf)).toEqual([]);
  });

  it("is capped", () => {
    const many = Array.from({ length: FOCUS_SNAPSHOT_MAX + 4 }, (_, i) => focus({ id: `f${i}` }));
    expect(focusSnapshotFrom(many, asOf)).toHaveLength(FOCUS_SNAPSHOT_MAX);
  });

  it("reads back as the same sentence", () => {
    const [entry] = focusSnapshotFrom([focus({})], asOf);
    expect(snapshotLine(entry)).toBe(focusLine(focus({}), asOf));
    expect(snapshotLine({ category: "Posture", status: "passed", weeks: null, trainerInitials: "" })).toBe(
      "Posture — achieved",
    );
  });
});

describe("newestActiveCategory", () => {
  it("is the P of the most recently started active focus", () => {
    const list = [
      focus({ category: "Posture", startedAt: ts("2026-07-01T12:00:00") }),
      focus({ category: "Purpose", startedAt: ts("2026-09-01T12:00:00") }),
      focus({ category: "Path", status: "passed", startedAt: ts("2026-09-10T12:00:00"), passedAt: ts("2026-09-12T12:00:00") }),
    ];
    expect(newestActiveCategory(list, asOf)).toBe("Purpose");
  });

  it("is null when nothing is active", () => {
    expect(newestActiveCategory([focus({ status: "retired" })], asOf)).toBeNull();
    expect(newestActiveCategory([], asOf)).toBeNull();
  });
});
