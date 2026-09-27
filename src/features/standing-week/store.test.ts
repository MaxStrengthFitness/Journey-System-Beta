import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The standing week's writes (voice-review round, Sep 27 2026). The fake
 * refuses undefined anywhere in a write, the way Firestore's browser library
 * does, so a blank the editor leaves can't reach the database as a failed save.
 */

const fake = vi.hoisted(() => ({
  writes: [] as { op: "set" | "delete"; path: string; data?: Record<string, unknown>; options?: unknown }[],
}));

function findUndefined(value: unknown, path: string): string | null {
  if (value === undefined) return path || "(root)";
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = findUndefined(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const hit = findUndefined(v, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  return null;
}

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-sam" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    ...real,
    doc: ref,
    collection: ref,
    setDoc: async (r: { path: string }, data: Record<string, unknown>, options?: unknown) => {
      const hole = findUndefined(data, "");
      if (hole) throw new Error(`Function setDoc() called with invalid data. Unsupported field value: undefined (found in field ${hole})`);
      fake.writes.push({ op: "set", path: r.path, data, options });
    },
    deleteDoc: async (r: { path: string }) => {
      fake.writes.push({ op: "delete", path: r.path });
    },
    serverTimestamp: () => ({ __server: true }),
  };
});

import { agreeWeek, agreementWrite, proposalWrite, proposeWeek, removeWeek, type WeekOwner } from "./store";
import type { StandingWeek } from "./week";

const owner: WeekOwner = { studioId: "solon", trainerUid: "uid-sam", trainerId: "t-sam", trainerName: "  Sam Lee " };
const sam = { uid: "uid-sam", name: "Sam Lee" };
const pat = { uid: "uid-pat", name: "Pat Doe" };
const judyMon = { id: "r1", weekday: 1, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" };
const week: StandingWeek = { hours: [{ weekday: 1, from: "07:00", to: "13:00" }], regulars: [judyMon], note: undefined };

beforeEach(() => {
  fake.writes.length = 0;
});

describe("a proposal", () => {
  it("is the trainer's week, signed by them, with nothing undefined", async () => {
    await proposeWeek(owner, week, sam);
    expect(fake.writes).toHaveLength(1);
    const w = fake.writes[0];
    expect(w.path).toBe("studios/solon/standingWeeks/uid-sam");
    expect(w.options).toEqual({ merge: true });
    expect(w.data).toEqual({
      studioId: "solon",
      trainerUid: "uid-sam",
      trainerId: "t-sam",
      trainerName: "Sam Lee",
      proposed: { hours: [{ weekday: 1, from: "07:00", to: "13:00" }], regulars: [judyMon] },
      proposedAt: { __server: true },
      proposedBy: { id: "uid-sam", name: "Sam Lee" },
    });
  });

  it("writes only the fields the rules let a trainer write", () => {
    expect(Object.keys(proposalWrite(owner, week, sam)).sort()).toEqual(
      ["proposed", "proposedAt", "proposedBy", "studioId", "trainerId", "trainerName", "trainerUid"],
    );
  });

  it("can be taken back", async () => {
    await proposeWeek(owner, null, sam);
    expect(fake.writes[0].data).toMatchObject({ proposed: null });
  });
});

describe("an agreement", () => {
  it("is signed by the leader, and brings the proposal into line with it", async () => {
    await agreeWeek(owner, week, pat);
    const w = fake.writes[0];
    expect(w.options).toEqual({ merge: true });
    expect(w.data).toMatchObject({
      final: { hours: [{ weekday: 1, from: "07:00", to: "13:00" }], regulars: [judyMon] },
      finalAt: { __server: true },
      finalBy: { id: "uid-pat", name: "Pat Doe" },
    });
    expect(w.data!.proposed).toEqual(w.data!.final);
  });

  it("never signs a proposal in the trainer's name", () => {
    const w = agreementWrite(owner, week, pat);
    expect(w).not.toHaveProperty("proposedBy");
    expect(w).not.toHaveProperty("proposedAt");
  });
});

describe("removing a week", () => {
  it("deletes the trainer's document at the studio", async () => {
    await removeWeek("solon", "uid-sam");
    expect(fake.writes).toEqual([{ op: "delete", path: "studios/solon/standingWeeks/uid-sam" }]);
  });
});
