import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AN INITIATIVE NEVER CARRIES A BLANK (voice-review round, Sep 27 2026).
 *
 * Relay's Network form and Team's "Route to team" sent `dueOn: undefined`
 * on their default "No date" and `perTrainer: undefined` on "No number".
 * Firestore's browser library refuses a document holding `undefined` before
 * the write leaves the iPad, so a network launch posted at "0 of N studios"
 * and a routed cohort said "check your connection". The render test's
 * addDoc accepted undefined, so nothing caught it.
 *
 * The fake below refuses undefined anywhere in a write, the way the real
 * library does, and createRequest must still post.
 */

const fake = vi.hoisted(() => ({
  writes: [] as { path: string; data: Record<string, unknown> }[],
}));

function findUndefined(value: unknown, path: string): string | null {
  if (value === undefined) return path || "(root)";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const hit = findUndefined(v, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = findUndefined(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
  }
  return null;
}

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-ann" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    ...real,
    collection: ref,
    doc: ref,
    addDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      const hole = findUndefined(data, "");
      if (hole) throw new Error(`Function addDoc() called with invalid data. Unsupported field value: undefined (found in field ${hole})`);
      fake.writes.push({ path: r.path, data });
      return { id: `req-${fake.writes.length}` };
    },
    serverTimestamp: () => ({ __server: true }),
  };
});

import { createRequest } from "./requests";
import { targetForWrite } from "./initiatives";

const author = { id: "uid-ann", name: "Ann Leader" };

beforeEach(() => {
  fake.writes.length = 0;
});

describe("targetForWrite", () => {
  it("leaves out what was not chosen instead of writing undefined", () => {
    expect(targetForWrite({ action: "assessment", perTrainer: undefined, dueOn: undefined })).toEqual({ action: "assessment" });
  });

  it("keeps 0 as 'no number, participation only'", () => {
    expect(targetForWrite({ action: "inbody", perTrainer: 0 })).toEqual({ action: "inbody", perTrainer: 0 });
  });

  it("keeps a chosen count and a day", () => {
    expect(targetForWrite({ action: "progress-report", perTrainer: 5, dueOn: "2026-10-03" })).toEqual({
      action: "progress-report",
      perTrainer: 5,
      dueOn: "2026-10-03",
    });
  });

  it("rounds a count into range and drops one that isn't a number", () => {
    expect(targetForWrite({ perTrainer: -2 })).toEqual({ perTrainer: 0 });
    expect(targetForWrite({ perTrainer: 2.6 })).toEqual({ perTrainer: 3 });
    expect(targetForWrite({ perTrainer: Number.NaN })).toEqual({});
  });

  it("keeps only a YYYY-MM-DD day", () => {
    expect(targetForWrite({ dueOn: "" })).toEqual({});
    expect(targetForWrite({ dueOn: "Friday" })).toEqual({});
  });
});

describe("createRequest — an initiative with the form's default choices", () => {
  it("posts with 'No date' and 'No number' (the Network form's and Route to team's defaults)", async () => {
    const id = await createRequest({
      studioId: "westlake",
      author,
      kind: "initiative",
      title: "Five progress reports each",
      target: { action: "assessment", perTrainer: undefined, dueOn: undefined },
      priority: "normal",
      expiry: "none",
    });
    expect(id).toBe("req-1");
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0].path).toBe("studios/westlake/taskRequests");
    expect(fake.writes[0].data.target).toEqual({ action: "assessment" });
  });

  it("keeps the count and the day when they were chosen", async () => {
    await createRequest({
      studioId: "solon",
      author,
      kind: "initiative",
      title: "InBody for everyone",
      target: { action: "inbody", perTrainer: 3, dueOn: "2026-10-10" },
    });
    expect(fake.writes[0].data.target).toEqual({ action: "inbody", perTrainer: 3, dueOn: "2026-10-10" });
  });

  it("never writes a target on a request that isn't an initiative", async () => {
    await createRequest({
      studioId: "solon",
      author,
      kind: "question",
      title: "Anyone free at 4?",
      target: { action: "inbody", perTrainer: 3 },
    });
    expect(fake.writes[0].data).not.toHaveProperty("target");
  });
});
