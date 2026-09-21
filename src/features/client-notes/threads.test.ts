import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../../types/journal";
import {
  assembleThreads,
  isThreadUpdate,
  rootIdOf,
  sortThreads,
  threadsByZone,
  updateCountLabel,
  withoutThreadUpdates,
  zoneOf,
} from "./threads";

const TZ = "America/New_York";
const noon = (day: string) => new Date(`${day}T12:00:00-04:00`);
const eod = (day: string) => new Date(`${day}T23:59:59-04:00`);

const entry = (over: Partial<JournalEntry> & { id: string }): JournalEntry =>
  ({
    clientId: "c1",
    studioId: "westlake",
    kind: "injury",
    category: null,
    body: "note",
    importance: "critical",
    machineId: null,
    focusId: null,
    threadId: null,
    sessionId: null,
    origin: "manual",
    authorId: "t1",
    authorInitials: "AJ",
    authorName: "AJ",
    occurredAt: noon("2026-09-01"),
    createdAt: noon("2026-09-01"),
    updatedAt: noon("2026-09-01"),
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  }) as JournalEntry;

describe("which thread an entry belongs to", () => {
  it("a note is its own root; an update points at one", () => {
    expect(rootIdOf(entry({ id: "a" }))).toBe("a");
    expect(rootIdOf(entry({ id: "b", threadId: "a" }))).toBe("a");
    expect(isThreadUpdate(entry({ id: "a" }))).toBe(false);
    expect(isThreadUpdate(entry({ id: "b", threadId: "a" }))).toBe(true);
  });

  it("a blank threadId is not a thread", () => {
    expect(rootIdOf(entry({ id: "a", threadId: "  " }))).toBe("a");
    expect(rootIdOf(entry({ id: "a", threadId: undefined }))).toBe("a");
  });

  it("withoutThreadUpdates leaves the notes and drops the updates", () => {
    const list = [entry({ id: "a" }), entry({ id: "b", threadId: "a" }), entry({ id: "c" })];
    expect(withoutThreadUpdates(list).map((e) => e.id)).toEqual(["a", "c"]);
  });
});

describe("assembling a thread", () => {
  it("hangs updates off the root, oldest first, and dates it by the last one", () => {
    const threads = assembleThreads([
      entry({ id: "b", threadId: "a", occurredAt: noon("2026-09-10"), body: "MRI on the 31st" }),
      entry({ id: "a", body: "no overhead" }),
      entry({ id: "c", threadId: "a", occurredAt: noon("2026-09-05"), body: "still sore" }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].id).toBe("a");
    expect(threads[0].updates.map((u) => u.body)).toEqual(["still sore", "MRI on the 31st"]);
    expect(threads[0].entries.map((e) => e.id)).toEqual(["a", "c", "b"]);
    expect(threads[0].lastActivityAt?.toISOString()).toBe(noon("2026-09-10").toISOString());
  });

  it("a thread with no updates is dated by the note itself", () => {
    const [t] = assembleThreads([entry({ id: "a", occurredAt: noon("2026-09-03") })]);
    expect(t.updates).toEqual([]);
    expect(t.lastActivityAt?.toISOString()).toBe(noon("2026-09-03").toISOString());
    expect(updateCountLabel(t)).toBeNull();
  });

  it("an orphaned update stands on its own rather than vanishing", () => {
    // Its root is archived or older than the read window. Losing a note
    // because its parent scrolled out of range is the one thing never to do.
    const threads = assembleThreads([entry({ id: "b", threadId: "gone" })]);
    expect(threads.map((t) => t.id)).toEqual(["b"]);
  });

  it("counts its updates in words", () => {
    const one = assembleThreads([entry({ id: "a" }), entry({ id: "b", threadId: "a" })]);
    const two = assembleThreads([
      entry({ id: "a" }),
      entry({ id: "b", threadId: "a" }),
      entry({ id: "c", threadId: "a" }),
    ]);
    expect(updateCountLabel(one[0])).toBe("1 update");
    expect(updateCountLabel(two[0])).toBe("2 updates");
  });

  it("reads resolved off the root, never off an update", () => {
    const [t] = assembleThreads([
      entry({ id: "a", resolvedAt: noon("2026-09-12") }),
      entry({ id: "b", threadId: "a" }),
    ]);
    expect(t.isResolved).toBe(true);
  });
});

const zone = (over: Partial<JournalEntry>, today = "2026-09-20") =>
  zoneOf({ root: entry({ id: "a", ...over }) }, today, TZ);

describe("the three zones", () => {
  it("an always note that shouts is open; at plain loudness it is standing context", () => {
    expect(zone({ importance: "critical" })).toBe("open");
    expect(zone({ importance: "elevated" })).toBe("open");
    expect(zone({ importance: "standard" })).toBe("standing");
  });

  it("a dated window is open while it is current or still coming, and resolved once it has run out", () => {
    expect(zone({ effectiveUntil: eod("2026-09-25") })).toBe("open");
    expect(zone({ effectiveUntil: eod("2026-09-20") })).toBe("open");
    expect(zone({ effectiveUntil: eod("2026-09-19") })).toBe("resolved");
    // Cleared to lift from the 31st: not live yet, but it is coming.
    expect(zone({ effectiveFrom: noon("2026-09-30"), effectiveUntil: eod("2026-10-05") })).toBe("open");
  });

  it("a standard note with a live window is open, not standing — the window is the point", () => {
    expect(zone({ importance: "standard", effectiveUntil: eod("2026-09-25") })).toBe("open");
  });

  it("a one-off day is spent afterwards, unless it comes round every year", () => {
    const surgery = { effectiveFrom: noon("2026-09-30"), effectiveUntil: eod("2026-09-30") };
    expect(zone(surgery)).toBe("open");
    expect(zone(surgery, "2026-10-01")).toBe("resolved");
    const birthday = { ...surgery, repeat: "yearly" as const };
    expect(zone(birthday, "2026-10-01")).toBe("open");
  });

  it("closing or archiving puts it away whatever its window said", () => {
    expect(zone({ resolvedAt: noon("2026-09-12") })).toBe("resolved");
    expect(zone({ isArchived: true })).toBe("resolved");
    expect(zone({ importance: "standard", resolvedAt: noon("2026-09-12") })).toBe("resolved");
  });
});

describe("order within a zone", () => {
  it("critical leads, then heads up, then whatever moved most recently", () => {
    const threads = assembleThreads([
      entry({ id: "quiet", importance: "standard", occurredAt: noon("2026-09-19") }),
      entry({ id: "loud", importance: "critical", occurredAt: noon("2026-09-01") }),
      entry({ id: "middle", importance: "elevated", occurredAt: noon("2026-09-18") }),
    ]);
    expect(sortThreads(threads).map((t) => t.id)).toEqual(["loud", "middle", "quiet"]);
  });

  it("a fresh update outranks a thread that has sat still", () => {
    const threads = assembleThreads([
      entry({ id: "old", importance: "critical", occurredAt: noon("2026-09-02") }),
      entry({ id: "stale", importance: "critical", occurredAt: noon("2026-09-15") }),
      entry({ id: "u", threadId: "old", occurredAt: noon("2026-09-19") }),
    ]);
    expect(sortThreads(threads).map((t) => t.id)).toEqual(["old", "stale"]);
  });

  it("splits into three zones, each sorted, none missing", () => {
    const byZone = threadsByZone(
      assembleThreads([
        entry({ id: "open1", importance: "critical" }),
        entry({ id: "standing1", importance: "standard" }),
        entry({ id: "done1", resolvedAt: noon("2026-09-12") }),
      ]),
      "2026-09-20",
      TZ,
    );
    expect(byZone.open.map((t) => t.id)).toEqual(["open1"]);
    expect(byZone.standing.map((t) => t.id)).toEqual(["standing1"]);
    expect(byZone.resolved.map((t) => t.id)).toEqual(["done1"]);
  });
});
