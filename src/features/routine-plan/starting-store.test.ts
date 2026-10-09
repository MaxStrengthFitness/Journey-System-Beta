/**
 * Starting routines and a studio's choice, read and written
 * (starting-store.ts), against a fake Firestore: the two queries and the
 * fields they ask on (the index they need, firestore.indexes.json), an empty
 * answer from the cache kept unknown, a missing choice read as "hasn't
 * chosen", a failed read thrown, and the choice written whole.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Where = { field: string; op: string; value: unknown };
type Snap = { docs: Array<{ id: string; data: () => Record<string, unknown> }>; empty: boolean; metadata: { fromCache: boolean } };

const fake = vi.hoisted(() => ({
  queries: [] as Array<{ path: string; wheres: Where[] }>,
  answers: new Map<string, Snap | Error>(),
  choice: null as Record<string, unknown> | null | Error,
  /** The choice's getDoc answered only from this iPad's cache. */
  choiceFromCache: false,
  writes: [] as Array<{ path: string; data: Record<string, unknown>; opts: unknown }>,
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (ref: { path: string }, ...wheres: Where[]) => ({ path: ref.path, wheres }),
  getDocs: async (q: { path: string; wheres: Where[] }) => {
    fake.queries.push(q);
    const tier = q.wheres.find((w) => w.field === "tier")?.value as string;
    const answer = fake.answers.get(tier);
    if (answer instanceof Error) throw answer;
    return answer ?? { docs: [], empty: true, metadata: { fromCache: false } };
  },
  getDoc: async (ref: { path: string }) => {
    if (fake.choice instanceof Error) throw fake.choice;
    const data = fake.choice;
    return { exists: () => data !== null, data: () => data ?? undefined, ref, metadata: { fromCache: fake.choiceFromCache } };
  },
  setDoc: async (ref: { path: string }, data: Record<string, unknown>, opts?: unknown) => {
    fake.writes.push({ path: ref.path, data, opts });
  },
  serverTimestamp: () => "SERVER_TIME",
}));

import { readStartingChoice, readStartingRoutines, saveStartingChoice } from "./starting-store";

const db = {} as never;

const snap = (docs: Array<Record<string, unknown> & { id: string }>, fromCache = false): Snap => ({
  docs: docs.map(({ id, ...data }) => ({ id, data: () => data })),
  empty: docs.length === 0,
  metadata: { fromCache },
});

const knee = { id: "academy-knee", name: "Knee issues", tier: "company", scope: "global", machineIds: ["m-leg-curl"], start: { dayOne: ["m-leg-curl"], kind: "condition" } };
const ours = { id: "w-walkin", name: "Walk-in", tier: "studio", scope: "westlake", studioId: "westlake", machineIds: ["m-leg-press"], start: { dayOne: ["m-leg-press"] } };

beforeEach(() => {
  fake.queries.length = 0;
  fake.answers.clear();
  fake.choice = null;
  fake.choiceFromCache = false;
  fake.writes.length = 0;
});

describe("readStartingRoutines", () => {
  it("asks for head office's on tier and scope, and the studio's own the same way", async () => {
    fake.answers.set("company", snap([knee]));
    fake.answers.set("studio", snap([ours]));
    const answer = await readStartingRoutines(db, "westlake");
    expect(fake.queries).toEqual([
      {
        path: "routinePresets",
        wheres: [
          { field: "tier", op: "==", value: "company" },
          { field: "scope", op: "==", value: "global" },
        ],
      },
      {
        path: "routinePresets",
        wheres: [
          { field: "tier", op: "==", value: "studio" },
          { field: "scope", op: "==", value: "westlake" },
        ],
      },
    ]);
    expect(answer.known).toBe(true);
    expect(answer.routines.map((r) => r.id)).toEqual(["academy-knee", "w-walkin"]);
  });

  it("reads head office's alone when no studio is named", async () => {
    fake.answers.set("company", snap([knee]));
    const answer = await readStartingRoutines(db, null);
    expect(fake.queries).toHaveLength(1);
    expect(answer.routines.map((r) => r.id)).toEqual(["academy-knee"]);
  });

  it("answers 'none' from the server, but keeps an empty answer from the cache unknown", async () => {
    expect(await readStartingRoutines(db, "westlake")).toEqual({ routines: [], known: true, seeded: false });
    fake.answers.set("company", snap([], true));
    fake.answers.set("studio", snap([], true));
    expect(await readStartingRoutines(db, "westlake")).toEqual({ routines: [], known: false, seeded: false });
    // A cache that holds them is an answer.
    fake.answers.set("company", snap([knee], true));
    expect((await readStartingRoutines(db, "westlake")).known).toBe(true);
  });

  it("throws a failed read, never answers it as none", async () => {
    fake.answers.set("company", new Error("permission-denied"));
    await expect(readStartingRoutines(db, "westlake")).rejects.toThrow("permission-denied");
  });
});

describe("readStartingChoice", () => {
  it("reads the studio's config/startingRoutines", async () => {
    fake.choice = { use: ["academy-knee"], defaultId: "academy-knee", updatedBy: "uid-lee" };
    expect(await readStartingChoice(db, "westlake")).toEqual({ use: ["academy-knee"], defaultId: "academy-knee" });
  });

  it("is 'hasn't chosen' with no document, and a failed read is thrown, never 'hasn't chosen'", async () => {
    expect(await readStartingChoice(db, "westlake")).toEqual({ use: null, defaultId: null });
    fake.choice = new Error("unavailable");
    await expect(readStartingChoice(db, "westlake")).rejects.toThrow("unavailable");
  });

  it("a missing document only the iPad's cache answered is unknown, never 'hasn't chosen'", async () => {
    fake.choiceFromCache = true;
    await expect(readStartingChoice(db, "westlake")).rejects.toThrow(/cache/);
    // A document the cache holds is an answer.
    fake.choice = { use: ["academy-knee"], defaultId: null };
    expect(await readStartingChoice(db, "westlake")).toEqual({ use: ["academy-knee"], defaultId: null });
  });
});

describe("the seed's traces", () => {
  it("says the seed ran when head office's read holds a starting routine, even one switched off", async () => {
    const parked = { id: "academy-knee", name: "Knee issues", tier: "company", scope: "global", machineIds: ["m-leg-curl"], startParked: { dayOne: ["m-leg-curl"] } };
    fake.answers.set("company", snap([parked]));
    expect(await readStartingRoutines(db, "westlake")).toEqual({ routines: [], known: true, seeded: true });
  });
});

describe("saveStartingChoice", () => {
  it("writes the whole document, signed with the Auth uid and the server's time", async () => {
    await saveStartingChoice(db, "westlake", { use: ["academy-knee", "academy-knee"], defaultId: "academy-knee" }, "uid-lee");
    expect(fake.writes).toEqual([
      {
        path: "studios/westlake/config/startingRoutines",
        data: { use: ["academy-knee"], defaultId: "academy-knee", updatedAt: "SERVER_TIME", updatedBy: "uid-lee" },
        opts: undefined,
      },
    ]);
  });

  it("writes 'all of head office's' as null, and refuses with no one signed in or too many ticked", async () => {
    await saveStartingChoice(db, "westlake", { use: null, defaultId: null }, "uid-lee");
    expect(fake.writes[0]!.data).toMatchObject({ use: null, defaultId: null });
    await expect(saveStartingChoice(db, "westlake", { use: null, defaultId: null }, "")).rejects.toThrow(/Sign in again/);
    const tooMany = Array.from({ length: 81 }, (_, i) => `r-${i}`);
    await expect(saveStartingChoice(db, "westlake", { use: tooMany, defaultId: null }, "uid-lee")).rejects.toThrow(/up to 80/);
    expect(fake.writes).toHaveLength(1);
  });
});
