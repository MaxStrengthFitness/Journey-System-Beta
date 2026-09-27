import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The whole-read record's write (Sep 27 2026). The fake keeps a batch's
 * writes only when it commits, refuses undefined anywhere in a write the way
 * Firestore's browser library does, and can be told to refuse a commit.
 */

type Write = { path: string; data: Record<string, unknown>; options: unknown };
const fake = vi.hoisted(() => ({
  commits: [] as { path: string; data: Record<string, unknown>; options: unknown }[][],
  refuse: 0,
  batches: 0,
  /** Holds a commit open until released, to make two pulls overlap. */
  hold: null as null | Promise<void>,
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
  return {
    ...real,
    doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
    arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
    writeBatch: () => {
      fake.batches += 1;
      const pending: Write[] = [];
      return {
        set: (ref: { path: string }, data: Record<string, unknown>, options?: unknown) => {
          const hole = findUndefined(data, "");
          if (hole) throw new Error(`Function WriteBatch.set() called with invalid data. Unsupported field value: undefined (found in field ${hole})`);
          pending.push({ path: ref.path, data, options });
        },
        commit: async () => {
          if (fake.hold) await fake.hold;
          if (fake.refuse > 0) {
            fake.refuse -= 1;
            throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
          }
          fake.commits.push(pending);
        },
      };
    },
  };
});

import { recordCoverage, type CoverageInput } from "./coverage-record";
import { forgetPersonalMemory } from "../sign-out/memory";

/** Sun Sep 27 2026, 9:00 AM Eastern. */
const SUN_9AM = Date.parse("2026-09-27T13:00:00Z");
const near = (over: Partial<CoverageInput> = {}): CoverageInput => ({
  studioId: "westlake",
  window: { start: "2026-09-27", end: "2026-09-28" },
  answer: { windowComplete: true },
  startedAt: SUN_9AM,
  timeZone: "America/New_York",
  ...over,
});
const written = () => fake.commits.flat();

beforeEach(() => {
  fake.commits.length = 0;
  fake.refuse = 0;
  fake.batches = 0;
  fake.hold = null;
  forgetPersonalMemory();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("recording a whole read", () => {
  it("adds today and tomorrow to the month's document: one merge, no read, nothing undefined", async () => {
    expect(await recordCoverage(near())).toBe("recorded");
    expect(fake.commits).toHaveLength(1);
    expect(written()).toEqual([
      {
        path: "studios/westlake/scheduleCoverage/2026-09",
        data: { days: { __arrayUnion: ["2026-09-27", "2026-09-28"] } },
        options: { merge: true },
      },
    ]);
  });

  it("writes the two months' documents in one batch across a month's end", async () => {
    // Wed Sep 30, 11:30 PM Eastern: today is still the 30th, tomorrow Oct 1.
    const res = await recordCoverage(near({ window: { start: "2026-09-30", end: "2026-10-30" }, startedAt: Date.parse("2026-10-01T03:30:00Z") }));
    expect(res).toBe("recorded");
    expect(fake.commits).toHaveLength(1);
    expect(written().map((w) => [w.path, w.data])).toEqual([
      ["studios/westlake/scheduleCoverage/2026-09", { days: { __arrayUnion: ["2026-09-30"] } }],
      ["studios/westlake/scheduleCoverage/2026-10", { days: { __arrayUnion: ["2026-10-01"] } }],
    ]);
  });

  it("records a back-read's past days", async () => {
    await recordCoverage(near({ window: { start: "2026-08-31", end: "2026-09-26" } }));
    expect(written().map((w) => w.path)).toEqual([
      "studios/westlake/scheduleCoverage/2026-08",
      "studios/westlake/scheduleCoverage/2026-09",
    ]);
    expect((written()[1].data.days as { __arrayUnion: string[] }).__arrayUnion).toHaveLength(26);
  });
});

describe("a partial answer", () => {
  it("records nothing, and touches nothing", async () => {
    expect(await recordCoverage(near({ answer: { windowComplete: false } }))).toBe("nothing");
    expect(await recordCoverage(near({ answer: {} }))).toBe("nothing");
    expect(await recordCoverage(near({ answer: null }))).toBe("nothing");
    expect(await recordCoverage(near({ answer: { windowComplete: true, sweepDeferred: 1, settledWithMonth: false } }))).toBe("nothing");
    expect(fake.batches).toBe(0);
    expect(written()).toEqual([]);
  });

  it("records nothing without a studio, or a window", async () => {
    expect(await recordCoverage(near({ studioId: null }))).toBe("nothing");
    expect(await recordCoverage(near({ studioId: "  " }))).toBe("nothing");
    expect(await recordCoverage(near({ studioId: "a/b" }))).toBe("nothing");
    expect(await recordCoverage(near({ window: { start: "", end: "" } }))).toBe("nothing");
    expect(fake.batches).toBe(0);
  });
});

describe("never the same day twice from one iPad", () => {
  it("writes only the new day when the next pull comes round", async () => {
    await recordCoverage(near());
    // Thirty minutes on: the same two days, nothing written.
    expect(await recordCoverage(near({ startedAt: SUN_9AM + 30 * 60_000 }))).toBe("nothing");
    // Monday morning: today (the 28th) was written yesterday as tomorrow; only the 29th is new.
    await recordCoverage(near({ window: { start: "2026-09-28", end: "2026-09-29" }, startedAt: SUN_9AM + 24 * 3_600_000 }));
    expect(fake.commits).toHaveLength(2);
    expect(fake.commits[1]).toEqual([
      { path: "studios/westlake/scheduleCoverage/2026-09", data: { days: { __arrayUnion: ["2026-09-29"] } }, options: { merge: true } },
    ]);
  });

  it("keeps each studio's days apart", async () => {
    await recordCoverage(near());
    await recordCoverage(near({ studioId: "solon" }));
    expect(written().map((w) => w.path)).toEqual([
      "studios/westlake/scheduleCoverage/2026-09",
      "studios/solon/scheduleCoverage/2026-09",
    ]);
  });

  it("holds the days while a write is in flight, so a Refresh during the background pull doesn't write them too", async () => {
    let release!: () => void;
    fake.hold = new Promise<void>((r) => {
      release = r;
    });
    const first = recordCoverage(near());
    const second = recordCoverage(near({ window: { start: "2026-09-27", end: "2026-10-05" } }));
    expect(await second).toBe("nothing");
    release();
    expect(await first).toBe("recorded");
    expect(fake.commits).toHaveLength(1);
  });

  it("writes them again after a sign-out, once", async () => {
    await recordCoverage(near());
    forgetPersonalMemory();
    await recordCoverage(near());
    await recordCoverage(near());
    expect(fake.commits).toHaveLength(2);
  });
});

describe("a failed write", () => {
  it("says nothing to the trainer, leaves nothing written, and lets the next pull try again", async () => {
    fake.refuse = 1;
    const res = await recordCoverage(near({ window: { start: "2026-09-30", end: "2026-10-30" }, startedAt: Date.parse("2026-10-01T03:30:00Z") }));
    expect(res).toBe("failed");
    // All or nothing: neither month's document was written.
    expect(written()).toEqual([]);
    expect(console.warn).toHaveBeenCalledTimes(1);
    // Not remembered, so the same days go again, both months at once.
    expect(await recordCoverage(near({ window: { start: "2026-09-30", end: "2026-10-30" }, startedAt: Date.parse("2026-10-01T03:30:00Z") }))).toBe("recorded");
    expect(written().map((w) => w.path)).toEqual([
      "studios/westlake/scheduleCoverage/2026-09",
      "studios/westlake/scheduleCoverage/2026-10",
    ]);
  });

  it("never rejects, whatever the answer holds", async () => {
    await expect(recordCoverage({ studioId: "westlake", window: undefined, answer: { windowComplete: true }, startedAt: NaN })).resolves.toBe("nothing");
    await expect(recordCoverage(near({ window: { start: 20260927 as unknown as string, end: "2026-09-28" } }))).resolves.toBe("nothing");
  });
});
