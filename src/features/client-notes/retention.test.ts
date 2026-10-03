import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalEntry } from "../../types/journal";

const calls = vi.hoisted(() => ({ created: [] as unknown[], updates: [] as unknown[] }));
vi.mock("../../hooks/useClientJournal", () => ({
  createJournalEntry: vi.fn(async (...args: unknown[]) => {
    calls.created.push(args);
    return "new-root";
  }),
}));
vi.mock("./thread-write", () => ({
  addThreadUpdate: vi.fn(async (...args: unknown[]) => {
    calls.updates.push(args);
    return "new-update";
  }),
}));

import { openRetentionThread, retentionThreads, writeRetentionConversation } from "./retention";

let seq = 0;
const e = (over: Partial<JournalEntry>): JournalEntry =>
  ({
    id: `r${++seq}`,
    clientId: "c1",
    studioId: "s1",
    kind: "retention",
    category: null,
    body: "b",
    importance: "elevated",
    machineId: null,
    focusId: null,
    sessionId: null,
    origin: "manual",
    authorId: "t",
    authorInitials: "T",
    authorName: "Lee Leader",
    occurredAt: new Date(2026, 8, 1, 12),
    createdAt: null,
    updatedAt: null,
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  }) as JournalEntry;

const author = { id: "uid-lee", initials: "LL", fullName: "Lee Leader" };

beforeEach(() => {
  calls.created.length = 0;
  calls.updates.length = 0;
});

describe("retention conversations are notes (AJ's answer 1A, Oct 3 2026)", () => {
  it("finds her Retention threads among any of her notes, newest first, and the open one", () => {
    const old = e({ id: "old", occurredAt: new Date(2026, 5, 1), resolvedAt: new Date(2026, 5, 20) });
    const cur = e({ id: "cur", occurredAt: new Date(2026, 8, 20) });
    const upd = e({ id: "cur-u", threadId: "cur", occurredAt: new Date(2026, 8, 25) });
    const other = e({ id: "knee", kind: "injury" });
    const threads = retentionThreads([old, cur, upd, other]);
    expect(threads.map((t) => t.id)).toEqual(["cur", "old"]);
    expect(threads[0].updates.map((u) => u.id)).toEqual(["cur-u"]);
    expect(openRetentionThread(threads)?.id).toBe("cur");
    expect(openRetentionThread(retentionThreads([old]))).toBeNull();
  });

  it("never lets an update stand in for a root it lost to a capped read (the review, Oct 3 2026)", () => {
    // The newest notes held this update but not its (closed, older) root.
    const orphan = e({ id: "late-u", threadId: "gone-root", occurredAt: new Date(2026, 8, 25) });
    expect(retentionThreads([orphan])).toEqual([]);
    expect(openRetentionThread(retentionThreads([orphan]))).toBeNull();
  });

  it("adds a conversation to the open thread, so the story reads in one place", async () => {
    const threads = retentionThreads([e({ id: "cur" })]);
    const id = await writeRetentionConversation({
      clientId: "c1",
      studioId: "s1",
      author,
      text: "  She'll renew if the 7am slot stays.  ",
      open: openRetentionThread(threads),
    });
    expect(id).toBe("new-update");
    expect(calls.created).toHaveLength(0);
    const [root, who, text, options] = calls.updates[0] as [JournalEntry, typeof author, string, { origin: string }];
    expect(root.id).toBe("cur");
    expect(who).toEqual(author);
    expect(text).toBe("She'll renew if the 7am slot stays.");
    expect(options).toEqual({ origin: "manual" });
  });

  it("starts a new thread at Heads up when none is open, filed at her home studio", async () => {
    await writeRetentionConversation({ clientId: "c1", studioId: "home", author, text: "Thinking of cancelling.", open: null });
    const [clientId, studioId, , draft] = calls.created[0] as [string, string, unknown, Record<string, unknown>];
    expect(clientId).toBe("c1");
    expect(studioId).toBe("home");
    expect(draft).toMatchObject({ kind: "retention", importance: "elevated", body: "Thinking of cancelling.", origin: "manual" });
  });

  it("writes nothing for an empty box", async () => {
    expect(await writeRetentionConversation({ clientId: "c1", studioId: "s1", author, text: "   ", open: null })).toBeNull();
    expect(calls.created).toHaveLength(0);
    expect(calls.updates).toHaveLength(0);
  });
});
