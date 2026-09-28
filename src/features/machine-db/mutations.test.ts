/**
 * THE OFFER AND THE DECISION — what each write sends (Sep 28 2026).
 *
 * A studio's tap OFFERS (shareStatus "pending") and never sets `shared`; a
 * take-back clears both; only an administrator's decision sets `shared`
 * true. firestore.rules enforces the same (shareDecisionOk), so a wrong shape
 * here would fail on every iPad.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
const signedIn = vi.hoisted(() => ({ uid: "uid-eowyn" as string | null }));

vi.mock("../../firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return signedIn.uid ? { uid: signedIn.uid } : null;
    },
  },
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    writes.push({ path: ref.path, data });
  },
  setDoc: async () => {},
  serverTimestamp: () => "NOW",
  deleteField: () => "DELETE",
}));

const { decideOffer, setMachineOffer, setNoteOffer, setTipOffer } = await import("./mutations");

beforeEach(() => {
  writes.length = 0;
  signedIn.uid = "uid-eowyn";
});

const where = { keys: ["m-leg-press"], studioName: "Westlake" };

describe("offering", () => {
  it("offers a note for review without sharing it", async () => {
    await setNoteOffer("westlake", "machine__m-leg-press", true, where);
    expect(writes).toEqual([
      {
        path: "studios/westlake/wiki/machine__m-leg-press",
        data: {
          shareStatus: "pending",
          sharedKeys: ["m-leg-press"],
          studioName: "Westlake",
          shareRequestedAt: "NOW",
          shareRequestedBy: "uid-eowyn",
        },
      },
    ]);
    expect(writes[0].data).not.toHaveProperty("shared");
  });

  it("takes a tip back: not shared, no offer standing", async () => {
    await setTipOffer("westlake", "tip1", false, where);
    expect(writes).toEqual([
      { path: "studios/westlake/playbook/tip1", data: { shared: false, sharedKeys: [], shareStatus: "DELETE" } },
    ]);
  });

  it("offers the studio's own machine, and takes it back", async () => {
    await setMachineOffer("westlake", "sm-westlake-sled", true, "Westlake");
    expect(writes[0].path).toBe("studios/westlake/roster/sm-westlake-sled");
    expect(writes[0].data).toMatchObject({ shareStatus: "pending", sharedStudioName: "Westlake", sharedBy: "uid-eowyn" });
    expect(writes[0].data).not.toHaveProperty("shared");
    await setMachineOffer("westlake", "sm-westlake-sled", false, "Westlake");
    expect(writes[1].data).toMatchObject({ shared: false, shareStatus: "DELETE" });
  });
});

describe("deciding", () => {
  it("shares a machine with the day it was listed", async () => {
    signedIn.uid = "uid-admin";
    await decideOffer("machine", "westlake", "sm-westlake-sled", "share");
    expect(writes[0]).toEqual({
      path: "studios/westlake/roster/sm-westlake-sled",
      data: {
        shared: true,
        shareStatus: "approved",
        shareReviewedBy: "uid-admin",
        shareReviewedAt: "NOW",
        shareReviewNote: "DELETE",
        sharedAt: "NOW",
      },
    });
  });

  it("keeps a no's note to 300 characters", async () => {
    signedIn.uid = "uid-admin";
    await decideOffer("note", "westlake", "machine__m-leg-press", "decline", "x".repeat(400));
    expect((writes[0].data.shareReviewNote as string).length).toBe(300);
    expect(writes[0].data).toMatchObject({ shared: false, shareStatus: "declined" });
  });

  it("refuses to decide for nobody", async () => {
    signedIn.uid = null;
    await expect(decideOffer("tip", "westlake", "tip1", "share")).rejects.toThrow("Sign in again");
    expect(writes).toHaveLength(0);
  });
});
