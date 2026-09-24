/**
 * FORD — the pure layer.
 *
 * Everything tested here runs on both the write path (caching the rollup onto
 * the client document) and the read path (rendering before that cache exists),
 * so a disagreement between the two would show up as a chip that contradicts
 * the section right below it. These tests exist to make that impossible.
 */

import { describe, it, expect } from "vitest";
import {
  daysUntil,
  nextOccurrence,
  urgencyOf,
  whenLabel,
  type FordEntry,
} from "./types";
import {
  adaptClientEvents,
  fordStudioIdOf,
  groupByPillar,
  summariseFord,
  upcomingFord,
} from "./ford-rollup";
import type { Client } from "../../types";

/** A fully-formed entry, so each test only states the bit it cares about. */
function entry(patch: Partial<FordEntry> = {}): FordEntry {
  return {
    id: patch.id ?? Math.random().toString(36).slice(2),
    clientId: "c1",
    studioId: "s1",
    pillar: "family",
    body: "Wife is Karen.",
    subject: null,
    isPinned: false,
    eventDate: null,
    recurrence: "none",
    opportunity: null,
    occurredAt: new Date("2026-09-01T12:00:00Z"),
    createdAt: null,
    updatedAt: null,
    authorId: "t1",
    authorName: "Alex Kerr",
    authorInitials: "AK",
    origin: "profile",
    sessionId: null,
    isArchived: false,
    ...patch,
  };
}

/**
 * A calendar day, as a local Date — the way the app's own `toDate()` reads a
 * date-only value.
 *
 * `day("2026-09-20")` is NOT that. A date-ONLY ISO string is parsed as
 * UTC midnight, while a date-TIME with no zone ("2026-09-15T10:00:00") is
 * parsed as local. Mixing the two in one assertion is a test that passes in
 * UTC and fails everywhere west of it: at America/New_York, UTC midnight on
 * the 20th is 8pm on the 19th, so "five days away" measured against a local
 * NOW comes out as four. It failed on a studio PC and passed in CI, which is
 * the worst shape a date bug can have.
 *
 * Local noon is the same guard `toDate()` uses for real date-only data
 * (`src/types/journal.ts`), so this helper is what production actually sees.
 */
const day = (iso: string) => new Date(`${iso}T12:00:00`);

const NOW = new Date("2026-09-15T10:00:00");

describe("dates", () => {
  it("rolls an annual date forward to the next time it comes round", () => {
    // An anniversary recorded in 2019 is not "seven years ago" to a client.
    const recorded = new Date("2019-11-05T00:00:00");
    const next = nextOccurrence(recorded, "annual", NOW);
    expect(next?.getFullYear()).toBe(2026);
    expect(next?.getMonth()).toBe(10); // November
    expect(next?.getDate()).toBe(5);
  });

  it("rolls into next year once this year's date has passed", () => {
    const march = new Date("2020-03-02T00:00:00");
    expect(nextOccurrence(march, "annual", NOW)?.getFullYear()).toBe(2027);
  });

  it("treats a recurring date earlier TODAY as today, not next year", () => {
    const birthday = new Date("1954-09-15T06:00:00");
    const next = nextOccurrence(birthday, "annual", NOW);
    expect(next?.getFullYear()).toBe(2026);
    expect(daysUntil(next, NOW)).toBe(0);
  });

  it("leaves a one-off date alone, including one in the past", () => {
    const graduation = new Date("2026-05-20T00:00:00");
    expect(nextOccurrence(graduation, "none", NOW)).toEqual(graduation);
  });

  it("speaks in sentences rather than counts", () => {
    expect(whenLabel(new Date("2026-09-15T18:00:00"), "none", NOW)).toBe("Today");
    expect(whenLabel(new Date("2026-09-16T09:00:00"), "none", NOW)).toBe("Tomorrow");
    expect(whenLabel(new Date("2026-09-27T09:00:00"), "none", NOW)).toBe("In 12 days");
    expect(whenLabel(new Date("2026-09-14T09:00:00"), "none", NOW)).toBe("Yesterday");
  });

  it("grades urgency by how much time a gesture still has", () => {
    expect(urgencyOf(day("2026-09-18"), "none", NOW)).toBe("now");
    expect(urgencyOf(day("2026-10-05"), "none", NOW)).toBe("soon");
    expect(urgencyOf(day("2026-12-25"), "none", NOW)).toBe("later");
    expect(urgencyOf(day("2026-08-01"), "none", NOW)).toBe("past");
    expect(urgencyOf(null, "none", NOW)).toBe("none");
  });
});

describe("summariseFord", () => {
  it("counts per pillar and keeps unfiled captures separate", () => {
    const s = summariseFord([
      entry({ pillar: "family" }),
      entry({ pillar: "family" }),
      entry({ pillar: "dreams" }),
      entry({ pillar: null, body: "something about a boat" }),
      entry({ pillar: null, body: "and a greenhouse" }),
    ]);
    expect(s.counts.family).toBe(2);
    expect(s.counts.dreams).toBe(1);
    expect(s.counts.recreation).toBe(0);
    expect(s.untagged).toBe(2);
  });

  it("ignores archived details everywhere", () => {
    const s = summariseFord([
      entry({ pillar: "family", isArchived: true }),
      entry({ pillar: null, isArchived: true }),
      entry({
        pillar: "family",
        eventDate: day("2026-09-20"),
        isArchived: true,
      }),
    ]);
    expect(s.counts.family).toBe(0);
    expect(s.untagged).toBe(0);
    expect(s.nextDate).toBeNull();
  });

  it("carries a few pinned lines per pillar, truncated", () => {
    const long = "K".repeat(200);
    const s = summariseFord([
      entry({ pillar: "family", isPinned: true, body: "Wife is Karen." }),
      entry({ pillar: "family", isPinned: true, body: "Two kids, Ethan and Mia." }),
      entry({ pillar: "family", isPinned: true, body: "Dog called Cooper." }),
      entry({ pillar: "family", isPinned: true, body: "A fourth, over the cap." }),
      entry({ pillar: "dreams", isPinned: true, body: long }),
    ]);
    expect(s.pinned.family).toHaveLength(3);
    expect(s.pinned.dreams![0]).toHaveLength(90);
    expect(s.pinned.dreams![0].endsWith("…")).toBe(true);
  });

  it("counts open gestures but not ones already delivered or passed on", () => {
    const opp = (status: any) => ({
      idea: "dinner",
      status,
      ownerTrainerId: null,
      ownerName: null,
      plannedFor: null,
      doneAt: null,
      outcome: null,
    });
    const s = summariseFord([
      entry({ opportunity: opp("idea") }),
      entry({ opportunity: opp("planned") }),
      entry({ opportunity: opp("done") }),
      entry({ opportunity: opp("declined") }),
    ]);
    expect(s.openOpportunities).toBe(2);
  });
});

describe("upcomingFord", () => {
  it("returns dated details soonest first and drops past one-offs", () => {
    const rows = upcomingFord(
      [
        entry({ id: "far", eventDate: day("2026-12-25") }),
        entry({ id: "soon", eventDate: day("2026-09-20") }),
        entry({ id: "gone", eventDate: day("2026-04-01") }),
        entry({ id: "undated" }),
      ],
      { now: NOW },
    );
    expect(rows.map((r) => r.entry.id)).toEqual(["soon", "far"]);
    expect(rows[0].daysAway).toBe(5);
  });

  it("keeps an annual date that has already passed this year, rolled forward", () => {
    const rows = upcomingFord(
      [entry({ id: "bday", eventDate: day("1954-03-02"), recurrence: "annual" })],
      { now: NOW },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].when.getFullYear()).toBe(2027);
  });

  it("honours a window", () => {
    const rows = upcomingFord(
      [
        entry({ id: "in", eventDate: day("2026-09-25") }),
        entry({ id: "out", eventDate: day("2026-11-25") }),
      ],
      { now: NOW, within: 30 },
    );
    expect(rows.map((r) => r.entry.id)).toEqual(["in"]);
  });
});

describe("groupByPillar", () => {
  it("reads standing facts oldest-first and moments newest-first", () => {
    const { buckets } = groupByPillar([
      entry({ id: "fact-old", isPinned: true, occurredAt: day("2024-01-01") }),
      entry({ id: "fact-new", isPinned: true, occurredAt: day("2026-01-01") }),
      entry({ id: "moment-old", occurredAt: day("2026-02-01") }),
      entry({ id: "moment-new", occurredAt: day("2026-09-01") }),
    ]);
    const family = buckets.find((b) => b.pillar === "family")!;
    expect(family.pinned.map((e) => e.id)).toEqual(["fact-old", "fact-new"]);
    expect(family.moments.map((e) => e.id)).toEqual(["moment-new", "moment-old"]);
  });

  it("always returns all four pillars, even empty ones", () => {
    const { buckets } = groupByPillar([]);
    expect(buckets.map((b) => b.pillar)).toEqual([
      "family",
      "occupation",
      "recreation",
      "dreams",
    ]);
  });
});

describe("adaptClientEvents", () => {
  const client = (events: any[]) =>
    ({ id: "c1", homeStudioId: "s1", events }) as unknown as Client;

  it("reads personal events as FORD and drops studio admin ones", () => {
    const out = adaptClientEvents(
      client([
        { id: "e1", date: "2026-11-05", title: "Anniversary", type: "Birthday/Anniversary", priority: "Medium" },
        { id: "e2", date: "2026-10-01", title: "Italy", type: "Vacation", priority: "Low" },
        { id: "e3", date: "2026-09-30", title: "InBody", type: "InBody Scan", priority: "Low" },
        { id: "e4", date: "2026-09-30", title: "Knee scope", type: "Medical", priority: "High" },
      ]),
    );
    expect(out.map((e) => e.pillar)).toEqual(["family", "recreation"]);
    expect(out.every((e) => e.isLegacy)).toBe(true);
    expect(out[0].legacySource).toBe("Profile events");
  });

  it("marks birthdays and anniversaries as recurring, holidays as one-offs", () => {
    const out = adaptClientEvents(
      client([
        { id: "e1", date: "1954-11-05", title: "Anniversary", type: "Birthday/Anniversary", priority: "Low" },
        { id: "e2", date: "2026-10-01", title: "Italy", type: "Vacation", priority: "Low" },
      ]),
    );
    expect(out[0].recurrence).toBe("annual");
    expect(out[1].recurrence).toBe("none");
  });

  it("folds the note into the body and survives a client with no events", () => {
    const out = adaptClientEvents(
      client([
        { id: "e1", date: "2026-11-05", title: "Anniversary", type: "Birthday/Anniversary", priority: "Low", notes: "40th, at Giovanni's" },
      ]),
    );
    expect(out[0].body).toBe("Anniversary — 40th, at Giovanni's");
    expect(adaptClientEvents(null)).toEqual([]);
    expect(adaptClientEvents({ id: "c1" } as Client)).toEqual([]);
  });

  it("never emits an entry with an empty body", () => {
    const out = adaptClientEvents(
      client([{ id: "e1", date: "2026-11-05", title: "", type: "Vacation", priority: "Low" }]),
    );
    expect(out).toEqual([]);
  });
});

describe("fordStudioIdOf", () => {
  // The one studio a detail is stamped with and read back by (client codex,
  // phase 1). The read rule tests resource.data.studioId, so a writer and the
  // reader disagreeing here makes a saved detail invisible.
  it("is the client's home studio, falling back to the older studioId", () => {
    expect(fordStudioIdOf({ id: "c1", homeStudioId: "westlake" } as Client)).toBe("westlake");
    expect(fordStudioIdOf({ id: "c1", homeStudioId: "", studioId: "solon" } as unknown as Client)).toBe("solon");
    expect(
      fordStudioIdOf({ id: "c1", homeStudioId: "westlake", studioId: "solon" } as unknown as Client),
    ).toBe("westlake");
  });

  it("is empty, not a guess, when the client names no studio or is not known yet", () => {
    expect(fordStudioIdOf({ id: "c1" } as Client)).toBe("");
    expect(fordStudioIdOf(null)).toBe("");
    expect(fordStudioIdOf(undefined)).toBe("");
  });

  it("is what the legacy adapter stamps, so a legacy detail sits in the same studio", () => {
    const c = {
      id: "c1",
      homeStudioId: "westlake",
      events: [{ id: "e1", date: "2026-11-05", title: "Anniversary", type: "Birthday/Anniversary", priority: "Low" }],
    } as unknown as Client;
    expect(adaptClientEvents(c)[0].studioId).toBe(fordStudioIdOf(c));
  });
});
