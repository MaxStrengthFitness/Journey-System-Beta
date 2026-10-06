import { describe, expect, it } from "vitest";
import { sessionJournalOf } from "./session-journal";
import type { JournalEntry } from "../../types/journal";

const entry = (id: string, sessionId: string | null, extra: Partial<JournalEntry> = {}) =>
  ({ id, sessionId, body: id, ...extra }) as JournalEntry;

describe("sessionJournalOf: a session's notes from the stream already open (R11)", () => {
  it("keeps this session's entries only", () => {
    const read = sessionJournalOf(
      { state: "ready", entries: [entry("a", "s1"), entry("b", "s2"), entry("c", null), entry("d", "s1", { isArchived: true })] },
      "s1",
    );
    expect(read).toEqual({ entries: [entry("a", "s1"), entry("d", "s1", { isArchived: true })], loading: false });
  });

  it("says loading while the stream has not answered, never 'no notes'", () => {
    expect(sessionJournalOf({ state: "loading", entries: null }, "s1")).toEqual({ entries: [], loading: true });
  });

  it("hands the read back to the caller when the stream failed, or there is none, or no session", () => {
    expect(sessionJournalOf({ state: "failed", entries: null }, "s1")).toBeNull();
    expect(sessionJournalOf(undefined, "s1")).toBeNull();
    expect(sessionJournalOf(null, "s1")).toBeNull();
    expect(sessionJournalOf({ state: "ready", entries: [] }, null)).toBeNull();
  });

  it("hands the read back when the stream is not surely the newest (the index-less fallback at its limit)", () => {
    expect(sessionJournalOf({ state: "ready", entries: [entry("a", "s1")], newest: false }, "s1")).toBeNull();
    // Said to be the newest, or not said at all: it answers.
    expect(sessionJournalOf({ state: "ready", entries: [entry("a", "s1")], newest: true }, "s1")?.entries).toHaveLength(1);
  });
});
