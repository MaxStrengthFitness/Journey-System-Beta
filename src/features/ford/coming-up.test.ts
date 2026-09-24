import { describe, expect, it } from "vitest";
import { comingUp, ordinal, studioNoon, type BirthdayRow, type DetailRow } from "./coming-up";
import type { FordEntry } from "./types";

/** Run with TZ=America/New_York: every date here is a local calendar day. */
const TODAY = "2027-03-16";

const detail = (patch: Partial<FordEntry>): FordEntry =>
  ({
    id: "d",
    clientId: "c1",
    studioId: "s1",
    pillar: "family",
    body: "A detail",
    subject: null,
    isPinned: false,
    eventDate: null,
    recurrence: "none",
    opportunity: null,
    occurredAt: new Date(2027, 0, 1, 12),
    createdAt: null,
    updatedAt: null,
    authorId: "uid-jess",
    authorName: "Jess Moreno",
    authorInitials: "JM",
    origin: "profile",
    sessionId: null,
    isArchived: false,
    ...patch,
  }) as FordEntry;

const birthdayOf = (rows: ReturnType<typeof comingUp>) => rows.find((r): r is BirthdayRow => r.kind === "birthday");

describe("studioNoon", () => {
  it("is the day key at local noon, never the day before", () => {
    const d = studioNoon(TODAY);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2027, 2, 16, 12]);
  });
});

describe("the Mindbody birthday", () => {
  it("rolls forward on the studio's day: 17 days, turning 69, soon", () => {
    const b = birthdayOf(comingUp({ dateOfBirth: "1958-04-02", entries: [], todayKey: TODAY }))!;
    expect(b.daysAway).toBe(17);
    expect(b.turning).toBe(69);
    expect(b.urgency).toBe("soon");
    expect([b.when.getMonth(), b.when.getDate()]).toEqual([3, 2]);
    expect(b.linked).toBeNull();
  });

  it("is today, now, on the day", () => {
    const b = birthdayOf(comingUp({ dateOfBirth: "1958-03-16", entries: [], todayKey: TODAY }))!;
    expect(b.daysAway).toBe(0);
    expect(b.urgency).toBe("now");
  });

  it("reads a Mindbody date-time as its calendar day", () => {
    const b = birthdayOf(comingUp({ dateOfBirth: "1958-04-02T00:00:00", entries: [], todayKey: TODAY }))!;
    expect(b.daysAway).toBe(17);
  });

  it("rolls yesterday's birthday to next year", () => {
    const b = birthdayOf(comingUp({ dateOfBirth: "1958-03-15", entries: [], todayKey: TODAY }))!;
    expect(b.when.getFullYear()).toBe(2028);
    expect(b.daysAway).toBe(365);
    expect(b.turning).toBe(70);
    expect(b.urgency).toBe("later");
  });

  it("gives no row for a missing or unreadable date of birth", () => {
    expect(comingUp({ dateOfBirth: undefined, entries: [], todayKey: TODAY })).toEqual([]);
    expect(comingUp({ dateOfBirth: "", entries: [], todayKey: TODAY })).toEqual([]);
    expect(comingUp({ dateOfBirth: "not a date", entries: [], todayKey: TODAY })).toEqual([]);
  });

  it("says no age for a birth year nobody believes", () => {
    const b = birthdayOf(comingUp({ dateOfBirth: "1800-04-02", entries: [], todayKey: TODAY }))!;
    expect(b.turning).toBeNull();
  });
});

describe("urgency, by the same thresholds as FORD's (urgencyOf)", () => {
  it("is now within a week, soon within a month, later after", () => {
    const at = (days: number) => new Date(2027, 2, 16 + days);
    const rows = comingUp({
      dateOfBirth: null,
      entries: [
        detail({ id: "five", eventDate: at(5) }),
        detail({ id: "seventeen", eventDate: at(17) }),
        detail({ id: "forty", eventDate: at(40) }),
      ],
      todayKey: TODAY,
    }) as DetailRow[];
    expect(rows.map((r) => [r.key, r.daysAway, r.urgency])).toEqual([
      ["five", 5, "now"],
      ["seventeen", 17, "soon"],
      ["forty", 40, "later"],
    ]);
  });
});

describe("a FORD detail that is this birthday", () => {
  it("folds into the birthday's row, linked, and leaves the details", () => {
    const own = detail({
      id: "bday",
      subject: "Birthday",
      body: "Birthday",
      eventDate: new Date(2020, 3, 2),
      recurrence: "annual",
      opportunity: { idea: "A card from the floor", status: "idea", ownerTrainerId: null, ownerName: null, plannedFor: null, doneAt: null, outcome: null },
    });
    const rows = comingUp({ dateOfBirth: "1958-04-02", entries: [own], todayKey: TODAY });
    expect(rows).toHaveLength(1);
    expect(birthdayOf(rows)!.linked?.id).toBe("bday");
  });

  it("drops a legacy birthday without linking it (it is read only)", () => {
    const legacy = detail({
      id: "legacy:clientEvents:e1",
      body: "Carol's birthday",
      eventDate: new Date(2019, 3, 2),
      recurrence: "annual",
      isLegacy: true,
    });
    const rows = comingUp({ dateOfBirth: "1958-04-02", entries: [legacy], todayKey: TODAY });
    expect(rows).toHaveLength(1);
    expect(birthdayOf(rows)!.linked).toBeNull();
  });

  it("keeps an annual detail on another day, or not about a birthday", () => {
    const anniversary = detail({ id: "ann", body: "Anniversary", eventDate: new Date(2001, 3, 2), recurrence: "annual" });
    const grandson = detail({ id: "gs", body: "Grandson's birthday", eventDate: new Date(2015, 4, 9), recurrence: "annual" });
    const rows = comingUp({ dateOfBirth: "1958-04-02", entries: [anniversary, grandson], todayKey: TODAY });
    expect(rows.map((r) => r.key)).toEqual(["birthday", "ann", "gs"]);
  });
});

describe("the list", () => {
  it("is sorted by date across the birthday and the details", () => {
    const rows = comingUp({
      dateOfBirth: "1958-04-02",
      entries: [
        detail({ id: "may", eventDate: new Date(2027, 4, 12) }),
        detail({ id: "march", eventDate: new Date(2027, 2, 20) }),
        detail({ id: "april", eventDate: new Date(2027, 3, 18) }),
      ],
      todayKey: TODAY,
    });
    expect(rows.map((r) => r.key)).toEqual(["march", "birthday", "april", "may"]);
  });

  it("leaves out a one-off that has passed, and an archived detail", () => {
    const rows = comingUp({
      dateOfBirth: null,
      entries: [
        detail({ id: "past", eventDate: new Date(2027, 2, 1) }),
        detail({ id: "archived", eventDate: new Date(2027, 3, 1), isArchived: true }),
        detail({ id: "undated" }),
      ],
      todayKey: TODAY,
    });
    expect(rows).toEqual([]);
  });

  it("puts the birthday first on a day it shares with a detail", () => {
    const rows = comingUp({
      dateOfBirth: "1958-04-02",
      entries: [detail({ id: "same", body: "Recital", eventDate: new Date(2027, 3, 2) })],
      todayKey: TODAY,
    });
    expect(rows.map((r) => r.key)).toEqual(["birthday", "same"]);
  });
});

describe("ordinal", () => {
  it("says the English suffix", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 69, 101, 111, 112].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "69th",
      "101st",
      "111th",
      "112th",
    ]);
  });
});
