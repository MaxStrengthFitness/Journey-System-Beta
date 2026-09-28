import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A REPORT IS FILED UNDER THE AUTH UID (voice review follow-up, Sep 27 2026).
 *
 * The read rule lets a trainer read a report whose `userId` is their Auth
 * uid. Reports were filed under the trainer document's id, which differs on
 * older accounts, so those trainers could never see what became of theirs.
 */

const fx = vi.hoisted(() => ({
  written: [] as Record<string, unknown>[],
  auth: { currentUser: null as null | { uid: string } },
}));
vi.mock("../../firebase", () => ({ db: {}, auth: fx.auth }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  serverTimestamp: () => "now",
  addDoc: async (_ref: unknown, data: Record<string, unknown>) => {
    fx.written.push(data);
    return { id: "r1" };
  },
}));

import { submitFeedback } from "./mutations";

const context = { view: "clients" } as never;

beforeEach(() => {
  fx.written = [];
  fx.auth.currentUser = null;
});

describe("submitFeedback", () => {
  it("files the report under the signed-in Auth uid, not the trainer document's id", async () => {
    fx.auth.currentUser = { uid: "uid-new" };
    await submitFeedback({ kind: "bug", description: "The grid froze", context, author: { id: "old-profile-id", name: "Sara" } });
    expect(fx.written[0].userId).toBe("uid-new");
    expect(fx.written[0].userName).toBe("Sara");
  });

  it("falls back to the trainer's id, then to 'unknown', when nobody is signed in", async () => {
    await submitFeedback({ kind: "idea", description: "A timer", context, author: { id: "t1" } });
    await submitFeedback({ kind: "idea", description: "A timer", context, author: {} });
    expect(fx.written.map((w) => w.userId)).toEqual(["t1", "unknown"]);
  });
});
