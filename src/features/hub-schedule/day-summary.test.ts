/**
 * The Hub's day summary: each day's count with zero left out, a dot for a day
 * with something to celebrate, the list's own chips (six since Get to know),
 * and the spotlight's words.
 */
import { describe, expect, it } from "vitest";
import type { Moment, RunSheetEntry } from "../hub-opportunities/moments-today";
import { eastern, makeBooking } from "../client-directory/fixtures";
import { SUMMARY_FAMILIES, countsByDay, spotWords, stripDays, summaryChips } from "./day-summary";

const entry = (id: string, moments: Array<Pick<Moment, "family" | "kind">>): RunSheetEntry =>
  ({ key: id, clientId: id, moments: moments.map((m) => ({ ...m, chip: m.kind, sentence: m.kind })) }) as unknown as RunSheetEntry;

describe("the week strip", () => {
  const schedules = [
    makeBooking({ clientId: "a", start: eastern("2026-09-28", "09:00") }),
    makeBooking({ clientId: "b", start: eastern("2026-09-28", "09:30") }),
    makeBooking({ clientId: "c", start: eastern("2026-09-28", "10:00"), status: "Cancelled" }),
    makeBooking({ clientId: "", clientName: "Unavailable", start: eastern("2026-09-28", "12:00") }),
    makeBooking({ clientId: "d", start: eastern("2026-09-30", "09:00") }),
  ];

  it("counts each day's sessions: never a cancellation, never Mindbody's Unavailable", () => {
    const counts = countsByDay(schedules, "America/New_York");
    expect(counts.get("2026-09-28")).toBe(2);
    expect(counts.get("2026-09-30")).toBe(1);
  });

  it("leaves a day with nothing booked without a number, and dots only a day that celebrates", () => {
    const days = stripDays(["2026-09-27", "2026-09-28", "2026-09-30"], "2026-09-28", countsByDay(schedules, "America/New_York"), (d) => d === "2026-09-28");
    expect(days.map((d) => [d.weekday, d.date, d.count, d.celebrate, d.isToday])).toEqual([
      ["Sun", 27, null, false, false],
      ["Mon", 28, 2, true, true],
      ["Wed", 30, 1, false, false],
    ]);
  });
});

describe("the chips and the spotlight", () => {
  const entries = [
    entry("belladonna", [
      { family: "read-first", kind: "critical" },
      { family: "celebrate", kind: "milestone" },
      { family: "celebrate", kind: "birthday" },
    ]),
    entry("rosie", [{ family: "celebrate", kind: "birthday" }, { family: "renew", kind: "renew" }]),
    entry("estella", [{ family: "watch", kind: "waiver" }, { family: "welcome", kind: "early-session" }, { family: "get-to-know", kind: "ask-about" }]),
    entry("hama", [{ family: "get-to-know", kind: "ask-about" }]),
    entry("lobelia", []),
  ];

  it("offers the list's own families, in its order: six since Get to know (wave 2 hub)", () => {
    expect(SUMMARY_FAMILIES.map((f) => f.label)).toEqual(["Read first", "Celebrate", "Welcome", "Renew", "Watch", "Get to know"]);
  });

  it("draws a chip only for a family with anyone in it, counting people", () => {
    expect(summaryChips(entries).map((c) => `${c.label} ${c.count}`)).toEqual(["Read first 1", "Celebrate 2", "Welcome 1", "Renew 1", "Watch 1", "Get to know 2"]);
    expect(summaryChips([entry("lobelia", [])])).toEqual([]);
  });

  it("says what the spotlight shows, in words", () => {
    expect(spotWords(entries, "celebrate")).toBe("2 to celebrate: 1 milestone, 2 birthdays");
    expect(spotWords(entries, "watch")).toBe("1 to watch: 1 waiver to sign");
    expect(spotWords(entries, "read-first")).toBe("1 to read first");
    expect(spotWords(entries, "renew")).toBe("1 for a renewal talk");
    expect(spotWords(entries, "get-to-know")).toBe("2 to ask about");
  });
});
