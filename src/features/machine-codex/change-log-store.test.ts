/**
 * THE CHANGE LOG'S WRITER: signed with the Auth uid and the person's name,
 * the definition fields only, never throwing. Firestore is recorded, not
 * sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => ({
  uid: "uid-admin" as string | null,
  adds: [] as Array<{ path: string; data: Record<string, unknown> }>,
  refuse: false,
  trainerName: "Elrond Peredhel" as string | undefined,
}));

vi.mock("../../firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return fx.uid ? { uid: fx.uid, displayName: "elrond" } : null;
    },
  },
}));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") });
  return {
    ...real,
    collection: ref,
    doc: ref,
    serverTimestamp: () => "SERVER_TIME",
    getDoc: async () => ({ exists: () => fx.trainerName !== undefined, data: () => ({ fullName: fx.trainerName }) }),
    addDoc: async (t: { path: string }, data: Record<string, unknown>) => {
      if (fx.refuse) throw new Error("permission-denied");
      fx.adds.push({ path: t.path, data });
      return { id: "new" };
    },
  };
});

import { recordMachineChange } from "./change-log-store";

beforeEach(() => {
  fx.adds = [];
  fx.refuse = false;
  fx.uid = "uid-admin";
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordMachineChange", () => {
  it("appends one signed entry under the machine with the definition fields the save wrote", async () => {
    const ok = await recordMachineChange("m-leg-press", "edited", ["stopRules", "updatedAt", "id", "baselineLoad"]);
    expect(ok).toBe(true);
    expect(fx.adds).toEqual([
      {
        path: "machines/m-leg-press/changes",
        data: {
          at: "SERVER_TIME",
          by: { uid: "uid-admin", name: "Elrond Peredhel" },
          kind: "edited",
          fields: ["baselineLoad", "stopRules"],
        },
      },
    ]);
  });

  it("records a create even with no fields, and nothing for an edit that changed no definition field", async () => {
    expect(await recordMachineChange("m-new", "created", [])).toBe(true);
    expect(fx.adds[0].data.kind).toBe("created");
    fx.adds = [];
    expect(await recordMachineChange("m-leg-press", "edited", ["updatedAt", "status"])).toBe(false);
    expect(fx.adds).toEqual([]);
  });

  it("never throws: nobody signed in, or a refused write, is false and a console warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fx.uid = null;
    expect(await recordMachineChange("m-leg-press", "edited", ["name"])).toBe(false);
    fx.uid = "uid-admin";
    fx.refuse = true;
    expect(await recordMachineChange("m-leg-press", "edited", ["name"])).toBe(false);
    expect(fx.adds).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
