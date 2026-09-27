/**
 * Sections per sort key. Run with TZ=America/New_York: the edges are studio
 * days, and the late-evening cases are exactly where UTC and Eastern disagree.
 */
import { describe, expect, it } from "vitest";
import { buildDirectoryRow, buildDirectoryRows, type DirectoryRow } from "./row";
import { SORTS, bucketOf, nextSortForTap, sectionRows, sortRows, sortWords, type SortSpec } from "./buckets";
import { NOW, TODAY, eastern, makeBooking, makeClient, makeContext } from "./fixtures";
import { addDays } from "../client-history/model";

const B = { today: TODAY, now: NOW, bookingsAsOf: "1:05 PM", horizonDays: 8 };

function lastInRow(daysAgo: number, id = `r${daysAgo}`, firstName = "Test"): DirectoryRow {
  return buildDirectoryRow(makeClient({ id, firstName, lastSessionDate: addDays(TODAY, -daysAgo) }), makeContext());
}

const labels = (rows: DirectoryRow[], key: SortSpec["key"]) => rows.map((r) => bucketOf(r, key, B).label);

describe("last in sections", () => {
  it("draws the edges on studio days", () => {
    const rows = [0, 1, 7, 8, 14, 15, 28, 29, 91, 92].map((d) => lastInRow(d));
    expect(labels(rows, "lastIn")).toEqual([
      "Today",
      "Last 7 days",
      "Last 7 days",
      "8\u201314 days ago",
      "8\u201314 days ago",
      "15\u201328 days ago",
      "15\u201328 days ago",
      "1\u20133 months ago",
      "1\u20133 months ago",
      "More than 3 months ago",
    ]);
  });

  it("keeps Before Journey, Nothing recorded and Unknown last, in that order, both ways", () => {
    const rows = [
      buildDirectoryRow(makeClient({ id: "u" }), makeContext()),
      buildDirectoryRow(makeClient({ id: "n", clientsNumberOfVisitsAtSite: 1 }), makeContext()),
      buildDirectoryRow(makeClient({ id: "b", priorHistory: { sessions: 40, through: "2026-08-31", source: "filemaker" } }), makeContext()),
      lastInRow(3, "k3"),
      lastInRow(40, "k40"),
    ];
    const desc = sectionRows(rows, { key: "lastIn", dir: "desc" }, B).map((s) => s.label);
    expect(desc).toEqual(["Last 7 days", "1\u20133 months ago", "Before Journey", "Nothing recorded", "Unknown"]);
    const asc = sectionRows(rows, { key: "lastIn", dir: "asc" }, B).map((s) => s.label);
    expect(asc).toEqual(["1\u20133 months ago", "Last 7 days", "Before Journey", "Nothing recorded", "Unknown"]);
  });

  it("orders inside a section by the day, ties by the name she goes by", () => {
    const rows = [lastInRow(5, "a", "Zoe"), lastInRow(2, "b", "Mary"), lastInRow(5, "c", "Anne")];
    expect(sortRows(rows, { key: "lastIn", dir: "desc" }, B).map((r) => r.name.goesBy)).toEqual(["Mary", "Anne", "Zoe"]);
    expect(sortRows(rows, { key: "lastIn", dir: "asc" }, B).map((r) => r.name.goesBy)).toEqual(["Anne", "Zoe", "Mary"]);
  });
});

describe("next booking sections", () => {
  it("11:30 PM Eastern is still today; 12:30 AM is tomorrow (UTC would say otherwise)", () => {
    const ctx = makeContext({
      schedules: [
        makeBooking({ clientId: "late", start: eastern(TODAY, "23:30") }),
        makeBooking({ clientId: "early", start: eastern("2026-09-28", "00:30") }),
      ],
    });
    const late = buildDirectoryRow(makeClient({ id: "late" }), ctx);
    const early = buildDirectoryRow(makeClient({ id: "early" }), ctx);
    expect(late.next.day).toBe(TODAY);
    expect(bucketOf(late, "next", B).label).toBe("Today");
    expect(early.next.day).toBe("2026-09-28");
    expect(bucketOf(early, "next", B).label).toBe("Tomorrow");
  });

  it("names every section, unknowns last with the time the bookings were read", () => {
    const ctx = makeContext({
      schedules: [
        makeBooking({ clientId: "d3", start: eastern("2026-09-30", "10:00") }),
        makeBooking({ clientId: "d8", start: eastern("2026-10-05", "10:00") }),
      ],
    });
    const rows = [
      buildDirectoryRow(makeClient({ id: "d3" }), ctx),
      buildDirectoryRow(makeClient({ id: "d8" }), ctx),
      buildDirectoryRow(makeClient({ id: "far", renewal: { nextBookingDate: "2026-11-20" } as never }), ctx),
      buildDirectoryRow(makeClient({ id: "none" }), ctx),
      buildDirectoryRow(makeClient({ id: "unk" }), makeContext({ bookingsFresh: false })),
    ];
    expect(sectionRows(rows, { key: "next", dir: "asc" }, B).map((s) => s.label)).toEqual([
      "Next 7 days",
      "8\u201330 days",
      "Later",
      "Nothing booked (next 8 days)",
      "Unknown (bookings as of 1:05 PM)",
    ]);
  });
});

describe("sessions left, total, age and height sections", () => {
  const svc = (remaining: number) => ({ s: { serviceId: 1, name: "96 PIF", count: 96, remaining } });
  it("left: fewest first, Unknown last", () => {
    const rows = [0, 3, 8, 40].map((n) => buildDirectoryRow(makeClient({ id: `l${n}`, mindbodyServices: svc(n) as never }), makeContext()));
    rows.push(buildDirectoryRow(makeClient({ id: "unread" }), makeContext()));
    expect(sectionRows(rows, { key: "left", dir: "asc" }, B).map((s) => s.label)).toEqual([
      "None left",
      "1\u20134 left",
      "5\u201312 left",
      "13 or more",
      "Unknown",
    ]);
    expect(sectionRows(rows, { key: "left", dir: "desc" }, B).map((s) => s.label).at(-1)).toBe("Unknown");
  });

  it("total: never a New section", () => {
    const prior = (sessions: number) => ({ sessions, through: "2026-08-31", source: "filemaker" as const });
    const rows = [
      buildDirectoryRow(makeClient({ id: "t1", sessionCount: 612, priorHistory: prior(600) }), makeContext()),
      buildDirectoryRow(makeClient({ id: "t2", sessionCount: 3, clientsNumberOfVisitsAtSite: 3 }), makeContext()),
      buildDirectoryRow(makeClient({ id: "t3", sessionCount: 1 }), makeContext()),
    ];
    const secs = sectionRows(rows, { key: "total", dir: "desc" }, B).map((s) => s.label);
    expect(secs).toEqual(["500 or more", "Fewer than 50", "Unknown"]);
    expect(secs.join(" ")).not.toMatch(/new/i);
  });

  it("age: oldest first by decade, Not on file last either way", () => {
    const dob = ["1931-01-15", "1944-06-01", "1980-02-02"];
    const rows = dob.map((d, i) => buildDirectoryRow(makeClient({ id: `a${i}`, dateOfBirth: d }), makeContext()));
    rows.push(buildDirectoryRow(makeClient({ id: "nodob" }), makeContext()));
    expect(sectionRows(rows, { key: "age", dir: "desc" }, B).map((s) => s.label)).toEqual(["90s", "80s", "Under 50", "Not on file"]);
    expect(sectionRows(rows, { key: "age", dir: "asc" }, B).map((s) => s.label)).toEqual(["Under 50", "80s", "90s", "Not on file"]);
  });

  it("height: one section per inch", () => {
    const rows = ["5'6\"", "5 ft 6", "6'1\"", ""].map((h, i) => buildDirectoryRow(makeClient({ id: `h${i}`, height: h }), makeContext()));
    const secs = sectionRows(rows, { key: "height", dir: "desc" }, B);
    expect(secs.map((s) => [s.label, s.rows.length])).toEqual([
      ["6\u20321\u2033", 1],
      ["5\u20326\u2033", 2],
      ["Not on file", 1],
    ]);
  });

  it("name: by the name she goes by, and by last name", () => {
    const rows = buildDirectoryRows(
      [
        makeClient({ id: "1", firstName: "Judith", nickname: "Judy", lastName: "Zane" }),
        makeClient({ id: "2", firstName: "Anne", lastName: "Young" }),
        makeClient({ id: "3", firstName: "Bob", lastName: "Adams" }),
      ],
      makeContext(),
    );
    expect(sortRows(rows, { key: "name", dir: "asc" }, B).map((r) => r.name.goesBy)).toEqual(["Anne", "Bob", "Judy"]);
    expect(sortRows(rows, { key: "lastName", dir: "asc" }, B).map((r) => r.name.last)).toEqual(["Adams", "Young", "Zane"]);
    expect(sectionRows(rows, { key: "name", dir: "asc" }, B).map((s) => s.label)).toEqual(["A", "B", "J"]);
  });
});

describe("sort words and taps", () => {
  it("says the direction in words", () => {
    expect(sortWords({ key: "lastIn", dir: "desc" })).toBe("Last in: most recent first");
    expect(sortWords({ key: "left", dir: "asc" })).toBe("Sessions left: fewest first");
    expect(sortWords({ key: "age", dir: "asc" })).toBe("Age: youngest first");
  });

  it("a second tap on the same column reverses it; a new column starts at its default", () => {
    expect(nextSortForTap({ key: "lastIn", dir: "desc" }, "lastIn")).toEqual({ key: "lastIn", dir: "asc" });
    expect(nextSortForTap({ key: "lastIn", dir: "desc" }, "next")).toEqual({ key: "next", dir: SORTS.next.defaultDir });
  });
});
