/**
 * "No longer matters", with an optional one-line reason (Oct 2 2026). The
 * reason goes on the thread as an ordinary update BEFORE the root closes, so
 * the next trainer reads why it closed; no reason, nothing added.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ order: [] as string[], created: [] as any[], resolved: [] as any[] }));

vi.mock("../../hooks/useClientJournal", () => ({
  createJournalEntry: async (clientId: string, studioId: string, author: unknown, draft: any) => {
    calls.order.push("update");
    calls.created.push({ clientId, studioId, author, draft });
    return "u1";
  },
  resolveJournalEntry: async (id: string, resolved: boolean) => {
    calls.order.push("close");
    calls.resolved.push({ id, resolved });
  },
  archiveJournalEntries: async () => {},
  unarchiveJournalEntries: async () => {},
}));

import { closeThreadNoLongerMatters, noLongerMattersLine } from "./thread-write";

const root = { id: "n1", clientId: "c1", studioId: "s1", kind: "preference", category: null, machineId: null } as const;
const author = { id: "uid-ann", initials: "AJ", fullName: "Ann Jones" };

beforeEach(() => {
  calls.order.length = 0;
  calls.created.length = 0;
  calls.resolved.length = 0;
});

describe("closeThreadNoLongerMatters", () => {
  it("writes the reason on the thread, then closes it", async () => {
    await closeThreadNoLongerMatters(root as any, author, "  She moved\nto mornings. ");
    expect(calls.order).toEqual(["update", "close"]);
    expect(calls.created[0].draft).toMatchObject({
      threadId: "n1",
      body: "No longer matters: She moved to mornings.",
      importance: "standard",
    });
    expect(calls.resolved).toEqual([{ id: "n1", resolved: true }]);
  });

  it("closes with nothing added when no reason is given", async () => {
    await closeThreadNoLongerMatters(root as any, author, "   ");
    expect(calls.order).toEqual(["close"]);
  });

  it("says the line only when there is a reason", () => {
    expect(noLongerMattersLine(null)).toBeNull();
    expect(noLongerMattersLine("Healed.")).toBe("No longer matters: Healed.");
  });
});
