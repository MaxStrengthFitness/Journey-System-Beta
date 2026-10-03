import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../../types/journal";
import { ASK_ORDER, askLenses, isRightNow, mostNamedPart, nowBreakdown } from "./ask";
import { assembleThreads } from "./threads";

const TODAY = "2026-10-03";
const day = (d: string, h = 12) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd, h);
};

let seq = 0;
function entry(over: Partial<JournalEntry>): JournalEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    clientId: "c1",
    studioId: "s1",
    kind: "coaching",
    category: null,
    body: `note ${seq}`,
    importance: "standard",
    machineId: null,
    focusId: null,
    sessionId: null,
    origin: "manual",
    authorId: "t1",
    authorInitials: "JC",
    authorName: "Jess Coach",
    occurredAt: day("2026-08-01"),
    createdAt: day("2026-08-01"),
    updatedAt: day("2026-08-01"),
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  };
}

const her = { object: "her", possessive: "her", subject: "she", plural: false };

describe("what's going on right now", () => {
  const ctx = (crit: string[] = [], hu: string[] = []) => ({
    criticalIds: new Set(crit),
    headsUpIds: new Set(hu),
    today: TODAY,
  });
  const one = (over: Partial<JournalEntry>) => assembleThreads([entry(over)])[0];

  it("is the briefing's own selection first: Critical that matters today, a Heads up still read out", () => {
    const crit = one({ id: "c", importance: "critical" });
    const hu = one({ id: "h", importance: "elevated" });
    expect(isRightNow(crit, ctx(["c"]))).toBe(true);
    expect(isRightNow(hu, ctx([], ["h"]))).toBe(true);
    // A Heads up that has gone quiet is not "right now" because of its loudness alone.
    expect(isRightNow(hu, ctx())).toBe(false);
  });

  it("is a window that covers today, or starts within a month (a surgery, a trip) — not one further out", () => {
    expect(isRightNow(one({ effectiveFrom: day("2026-10-01"), effectiveUntil: day("2026-10-10", 23) }), ctx())).toBe(true);
    expect(isRightNow(one({ effectiveFrom: day("2026-10-20"), effectiveUntil: day("2026-10-25", 23) }), ctx())).toBe(true);
    expect(isRightNow(one({ effectiveFrom: day("2026-12-20"), effectiveUntil: day("2026-12-25", 23) }), ctx())).toBe(false);
    // A yearly day coming round within the month.
    expect(isRightNow(one({ effectiveFrom: day("2025-10-15"), effectiveUntil: day("2025-10-15", 23), repeat: "yearly" }), ctx())).toBe(true);
  });

  it("is a Health, Incident or Retention note from the last two weeks that is still open", () => {
    expect(isRightNow(one({ kind: "injury", occurredAt: day("2026-09-25"), createdAt: day("2026-09-25") }), ctx())).toBe(true);
    expect(isRightNow(one({ kind: "retention", occurredAt: day("2026-09-30"), createdAt: day("2026-09-30") }), ctx())).toBe(true);
    expect(isRightNow(one({ kind: "injury", occurredAt: day("2026-09-01"), createdAt: day("2026-09-01") }), ctx())).toBe(false);
    expect(isRightNow(one({ kind: "coaching", occurredAt: day("2026-10-02"), createdAt: day("2026-10-02") }), ctx())).toBe(false);
    expect(
      isRightNow(one({ kind: "injury", occurredAt: day("2026-10-01"), createdAt: day("2026-10-01"), resolvedAt: day("2026-10-02") }), ctx()),
    ).toBe(false);
  });

  it("is an open question from Relay", () => {
    expect(isRightNow(one({ kind: "question", importance: "elevated" }), ctx())).toBe(true);
  });

  it("says what it holds by why, never by quoting a note", () => {
    const threads = assembleThreads([
      entry({ id: "c", importance: "critical", body: "Post-op: no overhead." }),
      entry({ id: "h", importance: "elevated" }),
      entry({ id: "w", effectiveFrom: day("2026-10-20"), effectiveUntil: day("2026-10-25", 23) }),
      entry({ id: "r", kind: "retention", occurredAt: day("2026-09-30"), createdAt: day("2026-09-30") }),
    ]);
    const line = nowBreakdown(threads, { criticalIds: new Set(["c"]), headsUpIds: new Set(["h"]), today: TODAY });
    expect(line).toBe("1 Critical · 1 Heads up · 1 coming up · 1 more");
    expect(line).not.toContain("overhead");
  });
});

describe("the questions", () => {
  const threads = assembleThreads([
    entry({ id: "knee1", kind: "injury", bodyParts: [{ part: "knee", side: "left" }] }),
    entry({ id: "knee2", kind: "incident", bodyParts: [{ part: "knee", side: "left" }], resolvedAt: day("2026-09-01") }),
    entry({ id: "cue", kind: "coaching", category: "Pace", machineId: "leg" }),
    entry({ id: "pad", kind: "equipment", machineId: "row" }),
    entry({ id: "fan", kind: "preference" }),
    entry({ id: "renew", kind: "retention", body: "Not sure about May." }),
    entry({ id: "bday", kind: "life", category: "Birthday" }),
  ]);
  const lenses = askLenses({
    threads,
    criticalIds: new Set(),
    headsUpIds: new Set(),
    machines: [
      { id: "leg", name: "Leg Press" },
      { id: "row", name: "Compound Row" },
    ],
    today: TODAY,
    pronouns: her,
    pageLines: { body: "2 watch-outs", account: "95 sessions left", ford: "birthday in 17 days", story: "since 2019" },
    known: true,
  });
  const lens = (id: string) => lenses.find((l) => l.id === id)!;

  it("are always the same seven, in the same order, in her pronouns", () => {
    expect(ASK_ORDER).toEqual(["now", "health", "train", "staying", "life", "story", "all"]);
    expect(lenses.map((l) => l.question)).toEqual([
      "What's going on with her right now?",
      "Her health",
      "How to train her",
      "Is she staying with us?",
      "Her life",
      "Her time here",
      "Every note",
    ]);
    const him = askLenses({
      threads: [],
      criticalIds: new Set(),
      headsUpIds: new Set(),
      machines: [],
      today: TODAY,
      pronouns: { object: "him", possessive: "his", subject: "he", plural: false },
      known: true,
    });
    expect(him[0].question).toBe("What's going on with him right now?");
    expect(him[3].question).toBe("Is he staying with us?");
  });

  it("are views over the notes' facets: one note can answer two questions, and is never copied", () => {
    expect(lens("health").threads.map((t) => t.id).sort()).toEqual(["knee1", "knee2"]);
    expect(lens("train").threads.map((t) => t.id).sort()).toEqual(["cue", "fan", "pad"]);
    expect(lens("staying").threads.map((t) => t.id)).toEqual(["renew"]);
    expect(lens("life").threads.map((t) => t.id)).toEqual(["bday"]);
    expect(lens("all").threads).toHaveLength(7);
    expect(lens("story").threads).toEqual([]);
    expect(lens("story").showsNotes).toBe(false);
  });

  it("say how much is behind each, before it is tapped", () => {
    expect(lens("health").preview).toBe("1 note · left knee in 2 · 2 watch-outs");
    expect(lens("train").preview).toBe("3 notes · 2 machines");
    expect(lens("staying").preview).toBe("1 note · 95 sessions left");
    expect(lens("life").preview).toBe("birthday in 17 days");
    expect(lens("story").preview).toBe("since 2019");
    expect(lens("all").preview).toBe("7 notes");
  });

  it("open the page that goes deeper, never a second copy of it", () => {
    expect(lenses.map((l) => l.door?.page ?? null)).toEqual([null, "body", "goals", "account", "ford", "story", null]);
  });

  it("say nothing they can't stand behind while the notes are unknown", () => {
    const unknown = askLenses({
      threads,
      criticalIds: new Set(),
      headsUpIds: new Set(),
      machines: [],
      today: TODAY,
      pronouns: her,
      known: false,
    });
    expect(unknown.filter((l) => l.id !== "life" && l.id !== "story").every((l) => l.preview === null)).toBe(true);
  });
});

describe("mostNamedPart", () => {
  it("names the part her notes name most, only when it is named twice or more", () => {
    const two = assembleThreads([
      entry({ kind: "injury", bodyParts: [{ part: "knee", side: "left" }] }),
      entry({ kind: "incident", bodyParts: [{ part: "knee", side: "left" }, { part: "neck", side: null }] }),
    ]);
    expect(mostNamedPart(two)).toBe("left knee in 2");
    expect(mostNamedPart(two.slice(0, 1))).toBeNull();
  });
});
