import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../../types/journal";
import { assembleThreads } from "./threads";
import { isDismissed, pruneDismissals, withoutDismissed } from "./dismissals";

const at = (iso: string) => new Date(iso);

const entry = (over: Partial<JournalEntry> & { id: string }): JournalEntry =>
  ({
    clientId: "c1",
    studioId: "s1",
    kind: "injury",
    category: null,
    body: "no overhead",
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

describe("a trainer saying they already know", () => {
  it("hides the thread for that trainer and nobody else", () => {
    const [thread] = assembleThreads([entry({ id: "a" })]);
    const mine = { a: at("2026-09-05T16:00:00Z") };
    expect(isDismissed(thread, mine)).toBe(true);
    // Another trainer's briefing reads their own document, which is empty.
    expect(isDismissed(thread, {})).toBe(false);
    expect(isDismissed(thread, null)).toBe(false);
  });

  it("an update brings it back, for everyone who dismissed it", () => {
    const [thread] = assembleThreads([
      entry({ id: "a" }),
      entry({
        id: "u1",
        threadId: "a",
        body: "MRI on the 31st",
        occurredAt: at("2026-09-10T16:00:00Z"),
        updatedAt: at("2026-09-10T16:00:00Z"),
      }),
    ]);
    expect(isDismissed(thread, { a: at("2026-09-05T16:00:00Z") })).toBe(false);
    // Dismissing again, after the update, holds until the next one.
    expect(isDismissed(thread, { a: at("2026-09-11T16:00:00Z") })).toBe(true);
  });

  it("an edit to the note counts as an update — new information is new information", () => {
    const [thread] = assembleThreads([
      entry({ id: "a", updatedAt: at("2026-09-08T16:00:00Z") }),
    ]);
    expect(isDismissed(thread, { a: at("2026-09-05T16:00:00Z") })).toBe(false);
  });

  it("filters a list without reordering it", () => {
    const threads = assembleThreads([
      entry({ id: "a" }),
      entry({ id: "b" }),
      entry({ id: "c" }),
    ]);
    const kept = withoutDismissed(threads, { b: at("2026-09-05T16:00:00Z") });
    expect(kept.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("drops dismissals an update has already overtaken, and leaves other clients' alone", () => {
    const threads = assembleThreads([
      entry({ id: "live", updatedAt: at("2026-09-10T16:00:00Z") }),
      entry({ id: "quiet" }),
    ]);
    const pruned = pruneDismissals(
      {
        live: at("2026-09-05T16:00:00Z"),
        quiet: at("2026-09-05T16:00:00Z"),
        somebodyElse: at("2026-09-05T16:00:00Z"),
      },
      threads,
    );
    expect(Object.keys(pruned).sort()).toEqual(["quiet", "somebodyElse"]);
  });
});
