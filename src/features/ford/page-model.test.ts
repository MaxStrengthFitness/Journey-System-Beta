import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../../types/journal";
import { assembleThreads, type NoteThread } from "../client-notes/threads";
import { notesOnRecord, olderLifeNotesByPillar } from "../client-notes/record-selectors";
import { groupByPillar } from "./ford-rollup";
import {
  detailWhen,
  fordOverview,
  fordSubnavLine,
  gesturesForClient,
  olderNoteMeta,
  pillarItems,
  type PillarItem,
} from "./page-model";
import { comingUp } from "./coming-up";
import type { FordEntry, FordOpportunity } from "./types";

/** Run with TZ=America/New_York. */
const TODAY = "2027-03-16";
const NOW = new Date(2027, 2, 16, 12);

const detail = (patch: Partial<FordEntry> & { id: string }): FordEntry =>
  ({
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

const opp = (status: FordOpportunity["status"], patch: Partial<FordOpportunity> = {}): FordOpportunity => ({
  idea: `An ${status} idea`,
  status,
  ownerTrainerId: null,
  ownerName: null,
  plannedFor: null,
  doneAt: null,
  outcome: null,
  ...patch,
});

const note = (over: Partial<JournalEntry> & { id: string }): JournalEntry =>
  ({
    clientId: "c1",
    studioId: "s1",
    kind: "life",
    category: "Anniversary",
    body: "Anniversary is Oct 12.",
    importance: "standard",
    machineId: null,
    focusId: null,
    threadId: null,
    sessionId: null,
    origin: "manual",
    authorId: "t1",
    authorInitials: "JM",
    authorName: "Jess Moreno",
    occurredAt: new Date(2025, 8, 20, 12),
    createdAt: null,
    updatedAt: null,
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  }) as JournalEntry;

const settledOf = (...entries: JournalEntry[]): NoteThread[] =>
  notesOnRecord(assembleThreads(entries), TODAY, { tz: "America/New_York", lifeOnFord: true }).lifeSettled;

describe("older life notes, placed by Notes' one selector", () => {
  it("files Birthday and Anniversary under Family and Vacation under Recreation", () => {
    const by = olderLifeNotesByPillar(
      settledOf(
        note({ id: "b", category: "Birthday" }),
        note({ id: "a", category: "Anniversary" }),
        note({ id: "v", category: "Vacation" }),
        note({ id: "m", category: "Milestone" }),
        note({ id: "o", category: "Other" }),
        note({ id: "n", category: null }),
      ),
    );
    expect(by.family.map((t) => t.id).sort()).toEqual(["a", "b"]);
    expect(by.recreation.map((t) => t.id)).toEqual(["v"]);
    expect(by.unplaced.map((t) => t.id).sort()).toEqual(["m", "n", "o"]);
  });

  it("leaves surgeries, injuries, the client.events copies and thread updates to others", () => {
    const by = olderLifeNotesByPillar(
      settledOf(
        note({ id: "s", category: "Surgery" }),
        note({ id: "i", category: "Injury" }),
        note({ id: "legacy:clientEvents:e1", isLegacy: true }),
        note({ id: "root" }),
        note({ id: "upd", threadId: "root", body: "They went to Maine." }),
      ),
    );
    const placed = Object.values(by).flat().map((t) => t.id);
    expect(placed).toEqual(["root"]);
  });
});

describe("pillarItems", () => {
  it("merges FORD's moments with the older notes, newest first, and counts both", () => {
    const { buckets } = groupByPillar([
      detail({ id: "fact", isPinned: true, occurredAt: new Date(2026, 0, 1, 12) }),
      detail({ id: "new", occurredAt: new Date(2027, 2, 1, 12) }),
      detail({ id: "old", occurredAt: new Date(2024, 2, 1, 12) }),
    ]);
    const older = settledOf(note({ id: "anniv", occurredAt: new Date(2025, 8, 20, 12) }));
    const list = pillarItems(buckets.find((b) => b.pillar === "family")!, older);
    expect(list.pinned.map((e) => e.id)).toEqual(["fact"]);
    expect(list.items.map((i: PillarItem) => i.key)).toEqual(["new", "note:anniv", "old"]);
    expect(list.total).toBe(4);
  });

  it("still lists the older notes when FORD was not read", () => {
    const list = pillarItems(null, settledOf(note({ id: "anniv" })));
    expect(list.pinned).toEqual([]);
    expect(list.items.map((i) => i.kind)).toEqual(["older-note"]);
    expect(list.total).toBe(1);
  });
});

describe("olderNoteMeta", () => {
  it("says it is an older note, who wrote it and when, always with the year", () => {
    const [t] = settledOf(note({ id: "a" }));
    expect(olderNoteMeta(t)).toBe("From an older note · Jess Moreno · Sep 20, 2025");
  });

  it("says when a closed one was closed, and where an unsigned import came from", () => {
    const [closed] = settledOf(note({ id: "c", resolvedAt: new Date(2025, 9, 3, 12) }));
    expect(olderNoteMeta(closed)).toBe("From an older note · Jess Moreno · Sep 20, 2025 · closed Oct 3, 2025");
    const [imported] = settledOf(
      note({ id: "imp", authorName: "Unknown coach", authorInitials: "—", isLegacy: true, legacySource: "FileMaker notes" }),
    );
    expect(olderNoteMeta(imported)).toBe("From an older note · FileMaker notes · Sep 20, 2025");
  });
});

describe("detailWhen", () => {
  it("rolls an annual date forward and says how far, with its urgency", () => {
    expect(detailWhen({ eventDate: new Date(2019, 2, 21), recurrence: "annual" }, NOW)).toEqual({
      days: 5,
      urgency: "now",
      annual: true,
    });
    expect(detailWhen({ eventDate: new Date(2027, 1, 1), recurrence: "none" }, NOW)).toMatchObject({ days: -43, urgency: "past" });
    expect(detailWhen({ eventDate: null, recurrence: "none" }, NOW)).toBeNull();
  });
});

describe("gesturesForClient", () => {
  it("puts open ones soonest first, undated last, and finished ones newest first", () => {
    const g = gesturesForClient(
      [
        detail({ id: "undated", opportunity: opp("idea") }),
        detail({ id: "may", eventDate: new Date(2027, 4, 12), opportunity: opp("idea") }),
        detail({ id: "planned-apr", opportunity: opp("planned", { plannedFor: new Date(2027, 3, 1), ownerName: "AJ" }) }),
        detail({ id: "done-jan", opportunity: opp("done", { doneAt: new Date(2027, 0, 20) }) }),
        detail({ id: "passed-feb", opportunity: opp("declined"), updatedAt: new Date(2027, 1, 2) }),
        detail({ id: "archived", isArchived: true, opportunity: opp("idea") }),
        detail({ id: "none" }),
      ],
      NOW,
    );
    expect(g.open.map((e) => e.id)).toEqual(["planned-apr", "may", "undated"]);
    expect(g.finished.map((e) => e.id)).toEqual(["passed-feb", "done-jan"]);
  });
});

describe("fordOverview", () => {
  const entries = [
    detail({ id: "fact", isPinned: true, body: "Married to Tom, 41 years this October" }),
    detail({ id: "occ", pillar: "occupation", isPinned: true, body: "31 years as a hygienist" }),
    detail({ id: "idea", pillar: "dreams", body: "The Camino", opportunity: opp("idea") }),
  ];
  const { buckets } = groupByPillar(entries);

  it("leads Occupation with the work sentence, and the others with a standing fact", () => {
    const o = fordOverview({
      status: "ready",
      buckets,
      entries,
      olderByPillar: { family: [], occupation: [], recreation: [], dreams: [] },
      client: { dateOfBirth: "1958-04-02" },
      work: { occupation: "Teacher / Educator", isRetired: true },
      todayKey: TODAY,
    });
    expect(o.pillars.map((p) => [p.pillar, p.lead, p.detailCount])).toEqual([
      ["family", "Married to Tom, 41 years this October", 1],
      ["occupation", "Retired — was on their feet (Teacher / Educator)", 1],
      ["recreation", null, 0],
      ["dreams", "The Camino", 1],
    ]);
    expect(o.pillars.find((p) => p.pillar === "dreams")!.ideas).toBe(1);
    expect(o.comingUp[0].kind).toBe("birthday");
    expect(o.openGestures.map((e) => e.id)).toEqual(["idea"]);
  });

  it("falls back to a standing fact when no work is recorded", () => {
    const o = fordOverview({
      status: "ready",
      buckets,
      entries,
      olderByPillar: null,
      client: {},
      work: {},
      todayKey: TODAY,
    });
    expect(o.pillars.find((p) => p.pillar === "occupation")!.lead).toBe("31 years as a hygienist");
    // The older notes are not known, so neither is the count.
    expect(o.pillars.every((p) => p.detailCount === null)).toBe(true);
  });

  it("gives no FORD line and no count while FORD is not read — the birthday and the work line are the record's", () => {
    const o = fordOverview({
      status: "loading",
      buckets,
      entries,
      olderByPillar: { family: [], occupation: [], recreation: [], dreams: [] },
      client: { dateOfBirth: "1958-04-02" },
      work: { occupation: "Teacher / Educator" },
      todayKey: TODAY,
    });
    expect(o.pillars.find((p) => p.pillar === "family")!.lead).toBeNull();
    expect(o.pillars.find((p) => p.pillar === "occupation")!.lead).toBe("On their feet (Teacher / Educator)");
    expect(o.pillars.every((p) => p.detailCount === null)).toBe(true);
    expect(o.comingUp.map((r) => r.kind)).toEqual(["birthday"]);
    expect(o.openGestures).toEqual([]);
  });

  it("carries In one line once FORD answered, and never before — it is FORD text", () => {
    const line = detail({
      id: "one-line",
      kind: "one-line",
      pillar: null,
      isPinned: true,
      isArchived: true,
      body: "Retired hygienist, pickleball regular",
      occurredAt: new Date(2027, 2, 15, 9),
    });
    const args = {
      buckets,
      entries,
      oneLine: line,
      olderByPillar: null,
      client: {},
      work: {},
      todayKey: TODAY,
    };
    expect(fordOverview({ ...args, status: "ready" }).oneLine).toEqual({
      text: "Retired hygienist, pickleball regular",
      byName: "Jess Moreno",
      at: new Date(2027, 2, 15, 9),
    });
    for (const status of ["loading", "failed", "denied", "off"] as const) {
      expect(fordOverview({ ...args, status }).oneLine, status).toBeNull();
    }
    expect(fordOverview({ ...args, status: "ready", oneLine: null }).oneLine).toBeNull();
  });
});

describe("fordSubnavLine", () => {
  const rows = (dob: string | null, entries: FordEntry[] = []) => comingUp({ dateOfBirth: dob, entries, todayKey: TODAY });

  it("names the birthday within a month", () => {
    expect(fordSubnavLine({ comingUp: rows("1958-04-02"), untagged: 1, count: 6 })).toBe("birthday in 17 days");
    expect(fordSubnavLine({ comingUp: rows("1958-03-16"), untagged: 0, count: 0 })).toBe("birthday today");
    expect(fordSubnavLine({ comingUp: rows("1958-03-17"), untagged: 0, count: 0 })).toBe("birthday tomorrow");
  });

  it("calls a FORD date 'a date', never by a pillar", () => {
    const soon = [detail({ id: "r", body: "Ellie's recital", eventDate: new Date(2027, 2, 28) })];
    expect(fordSubnavLine({ comingUp: rows(null, soon), untagged: 0, count: 1 })).toBe("a date in 12 days");
  });

  it("then what waits to be filed, then how much is on file", () => {
    const far = rows("1958-09-02");
    expect(fordSubnavLine({ comingUp: far, untagged: 1, count: 6 })).toBe("1 to file");
    expect(fordSubnavLine({ comingUp: far, untagged: 0, count: 6 })).toBe("6 details");
    expect(fordSubnavLine({ comingUp: far, untagged: 0, count: 1 })).toBe("1 detail");
    expect(fordSubnavLine({ comingUp: [], untagged: 0, count: 0 })).toBe("nothing on file yet");
  });

  it("says nothing it cannot know", () => {
    expect(fordSubnavLine({ comingUp: [], untagged: 0, count: null })).toBeNull();
  });
});
