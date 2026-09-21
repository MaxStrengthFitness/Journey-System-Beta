import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../../types/journal";
import { assembleThreads } from "../client-notes/threads";
import { briefingNotes, latestUpdateLine } from "./briefing-notes";

const at = (iso: string) => new Date(iso);

const entry = (over: Partial<JournalEntry> & { id: string }): JournalEntry =>
  ({
    clientId: "c1",
    studioId: "s1",
    kind: "injury",
    category: null,
    body: "No overhead",
    importance: "critical",
    machineId: null,
    focusId: null,
    threadId: null,
    sessionId: null,
    origin: "manual",
    authorId: "t1",
    authorInitials: "AJ",
    authorName: "AJ",
    occurredAt: at("2026-09-01T16:00:00Z"),
    createdAt: at("2026-09-01T16:00:00Z"),
    updatedAt: at("2026-09-01T16:00:00Z"),
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  }) as JournalEntry;

describe("what the briefing reads out", () => {
  const root = entry({ id: "a" });
  const update = entry({
    id: "u1",
    threadId: "a",
    body: "MRI on the 31st",
    occurredAt: at("2026-09-10T16:00:00Z"),
    updatedAt: at("2026-09-10T16:00:00Z"),
  });
  const heads = entry({ id: "h", importance: "elevated", body: "Away until the 14th" });
  const threads = assembleThreads([root, update, heads]);

  it("reads a note out as its thread, with the update attached", () => {
    const out = briefingNotes(threads, [root], [heads], {});
    expect(out.critical.map((t) => t.id)).toEqual(["a"]);
    expect(out.critical[0].updates).toHaveLength(1);
    expect(latestUpdateLine(out.critical[0])).toBe("MRI on the 31st");
    expect(out.headsUp.map((t) => t.id)).toEqual(["h"]);
    expect(latestUpdateLine(out.headsUp[0])).toBeNull();
    expect(out.hidden).toBe(0);
  });

  it("leaves out what this trainer said they already know, and counts it", () => {
    const out = briefingNotes(threads, [root], [heads], { h: at("2026-09-20T16:00:00Z") });
    expect(out.headsUp).toEqual([]);
    expect(out.hidden).toBe(1);
    // Nothing is hidden without a way back to it.
    const shown = briefingNotes(threads, [root], [heads], { h: at("2026-09-20T16:00:00Z") }, true);
    expect(shown.headsUp.map((t) => t.id)).toEqual(["h"]);
    expect(shown.hidden).toBe(0);
  });

  it("a dismissal is overtaken by the thread's own update", () => {
    // Dismissed on the 5th; the MRI update landed on the 10th.
    const out = briefingNotes(threads, [root], [], { a: at("2026-09-05T16:00:00Z") });
    expect(out.critical.map((t) => t.id)).toEqual(["a"]);
    expect(out.hidden).toBe(0);
  });

  it("says as much as it did before when no threads were loaded", () => {
    const out = briefingNotes(null, [root], [heads], null);
    expect(out.critical.map((t) => t.id)).toEqual(["a"]);
    expect(out.headsUp.map((t) => t.id)).toEqual(["h"]);
  });
});
