import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../types/journal";
import { criticalNoteLabel, criticalNotesByClient, criticalNotesOn } from "./hub-critical-notes";

const TZ = "America/New_York";
/** Noon Eastern on a studio day — never UTC midnight, which is the evening before. */
const noon = (day: string) => new Date(`${day}T12:00:00-04:00`);
const endOf = (day: string) => new Date(`${day}T23:59:59-04:00`);

const THURSDAY = "2026-09-24";
const FRIDAY = "2026-09-25";

let n = 0;
const note = (over: Partial<JournalEntry> = {}): JournalEntry =>
  ({
    id: `n${++n}`,
    clientId: "c1",
    studioId: "solon",
    kind: "injury",
    category: null,
    body: "Left shoulder: no overhead pressing",
    importance: "critical",
    threadId: null,
    occurredAt: noon("2026-09-10"),
    effectiveFrom: null,
    effectiveUntil: null,
    repeat: null,
    resolvedAt: null,
    isArchived: false,
    ...over,
  }) as JournalEntry;

describe("criticalNotesByClient — one read, grouped for every card on screen", () => {
  it("groups Critical roots by client and keeps whatever their window, for the card to decide", () => {
    const a = note({ clientId: "c1" });
    const b = note({ clientId: "c2", effectiveUntil: endOf("2026-09-01") });
    const grouped = criticalNotesByClient([a, b]);
    expect(grouped.get("c1")).toEqual([a]);
    expect(grouped.get("c2")).toEqual([b]);
  });

  it("leaves out a Heads up and a plain note — the Hub's triangle is Critical only", () => {
    const grouped = criticalNotesByClient([note({ importance: "elevated" }), note({ importance: "standard" })]);
    expect(grouped.size).toBe(0);
  });

  it("never counts a thread's update, even one that says critical: loudness lives on the root", () => {
    const root = note({ id: "root" });
    const update = note({ id: "u1", threadId: "root" });
    expect(criticalNotesByClient([root, update]).get("c1")).toEqual([root]);
  });

  it("drops an entry with no client — it cannot belong to a card", () => {
    expect(criticalNotesByClient([note({ clientId: "" })]).size).toBe(0);
  });
});

describe("criticalNotesOn — the briefing's rule, asked about the booking's day", () => {
  it("an 'always' Critical note lights every card from the day it was written", () => {
    const always = note();
    expect(criticalNotesOn([always], THURSDAY, TZ)).toEqual([always]);
    expect(criticalNotesOn([always], "2026-09-09", TZ)).toEqual([]);
  });

  it("a closed thread lights nothing — any trainer may close one, and that is the whole thread", () => {
    expect(criticalNotesOn([note({ resolvedAt: noon("2026-09-20") })], THURSDAY, TZ)).toEqual([]);
  });

  it("an archived thread lights nothing", () => {
    expect(criticalNotesOn([note({ isArchived: true })], THURSDAY, TZ)).toEqual([]);
  });

  it("a window that ran out before the booking lights nothing; one that covers it does", () => {
    const ended = note({ effectiveUntil: endOf("2026-09-23") });
    const running = note({ effectiveUntil: endOf(THURSDAY) });
    expect(criticalNotesOn([ended], THURSDAY, TZ)).toEqual([]);
    expect(criticalNotesOn([running], THURSDAY, TZ)).toEqual([running]);
  });

  it("a window that opens on Friday leaves Thursday's card alone and lights Friday's", () => {
    const fromFriday = note({ occurredAt: noon(THURSDAY), effectiveFrom: noon(FRIDAY) });
    expect(criticalNotesOn([fromFriday], THURSDAY, TZ)).toEqual([]);
    expect(criticalNotesOn([fromFriday], FRIDAY, TZ)).toEqual([fromFriday]);
  });

  it("a one-day note lights only its day, and a yearly one its anniversary", () => {
    const once = note({ effectiveFrom: noon(FRIDAY), effectiveUntil: endOf(FRIDAY) });
    expect(criticalNotesOn([once], THURSDAY, TZ)).toEqual([]);
    expect(criticalNotesOn([once], FRIDAY, TZ)).toEqual([once]);

    const yearly = note({ effectiveFrom: noon("2025-09-24"), effectiveUntil: endOf("2025-09-24"), repeat: "yearly" });
    expect(criticalNotesOn([yearly], THURSDAY, TZ)).toEqual([yearly]);
    expect(criticalNotesOn([yearly], FRIDAY, TZ)).toEqual([]);
  });

  it("puts the newest note first", () => {
    const older = note({ occurredAt: noon("2026-09-01") });
    const newer = note({ occurredAt: noon("2026-09-20") });
    expect(criticalNotesOn([older, newer], THURSDAY, TZ)).toEqual([newer, older]);
  });

  it("says nothing without notes or without a day", () => {
    expect(criticalNotesOn(null, THURSDAY, TZ)).toEqual([]);
    expect(criticalNotesOn(undefined, THURSDAY, TZ)).toEqual([]);
    expect(criticalNotesOn([note()], null, TZ)).toEqual([]);
  });

  it("filters again even when handed an unsorted mix, so a caller cannot slip a Heads up through", () => {
    expect(criticalNotesOn([note({ importance: "elevated" }), note({ threadId: "other" })], THURSDAY, TZ)).toEqual([]);
  });
});

describe("criticalNoteLabel — what the triangle says", () => {
  it("is every note in whole sentences, never clipped", () => {
    const long = "Pacemaker fitted in August. No chest-compression machines, and stop the set at the first sign of dizziness — call the studio leader.";
    const label = criticalNoteLabel([note({ body: "Left shoulder: no overhead pressing" }), note({ body: long })]);
    expect(label).toBe(`Critical: Left shoulder: no overhead pressing · Critical: ${long}`);
    expect(label).not.toContain("…");
  });

  it("is null when there is nothing, and plain words for a note with no body", () => {
    expect(criticalNoteLabel([])).toBeNull();
    expect(criticalNoteLabel([note({ body: "  " })])).toBe("Critical note");
  });
});
