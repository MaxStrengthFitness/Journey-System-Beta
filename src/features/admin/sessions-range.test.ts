/**
 * The closed-days keep (speed round, Oct 5 2026; R26): the part of a read
 * before the studio's today is kept for a while, per studio, and forgotten at
 * sign-out; today is read every time.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Where = { field: string; op: string; value: unknown };
const fake = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; hostedAtStudioId: string; createdAt: Date }>,
  reads: [] as Array<{ studio: string; from: number; to: number | null; max: number }>,
}));

vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  Timestamp: { fromMillis: (ms: number) => ({ ms }) },
  collection: () => ({}),
  query: (_c: unknown, ...cs: Array<Where | { n: number } | object>) => ({ cs }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: () => ({}),
  limit: (n: number) => ({ n }),
  getDocsFromServer: vi.fn(),
  getDocs: async (q: { cs: Array<Record<string, any>> }) => {
    const studio = q.cs.find((c) => c.field === "hostedAtStudioId")?.value as string;
    const from = (q.cs.find((c) => c.field === "createdAt" && c.op === ">=")?.value as { ms: number }).ms;
    const toC = q.cs.find((c) => c.field === "createdAt" && c.op === "<=");
    const to = toC ? (toC.value as { ms: number }).ms : null;
    const max = q.cs.find((c) => typeof c.n === "number")!.n as number;
    fake.reads.push({ studio, from, to, max });
    const rows = fake.rows
      .filter((r) => r.hostedAtStudioId === studio && r.createdAt.getTime() >= from && (to === null || r.createdAt.getTime() <= to))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, max);
    return { size: rows.length, docs: rows.map((r) => ({ id: r.id, data: () => r })) };
  },
}));

import { forgetPersonalMemory } from "../sign-out/memory";
import { CLOSED_KEEP_MS, forgetClosedSessions, readSessionsInRange } from "./sessions-range";

const NOW = new Date("2026-10-05T16:00:00Z"); // noon Eastern, Monday
const TODAY_START = new Date("2026-10-05T04:00:00Z").getTime();
const day = (n: number) => TODAY_START - n * 86_400_000;

beforeEach(() => {
  forgetClosedSessions();
  fake.reads = [];
  fake.rows = [
    { id: "today", hostedAtStudioId: "solon", createdAt: new Date("2026-10-05T14:00:00Z") },
    { id: "friday", hostedAtStudioId: "solon", createdAt: new Date("2026-10-02T14:00:00Z") },
    { id: "lastweek", hostedAtStudioId: "solon", createdAt: new Date("2026-09-28T14:00:00Z") },
    { id: "away", hostedAtStudioId: "westlake", createdAt: new Date("2026-10-02T15:00:00Z") },
  ];
});

describe("readSessionsInRange", () => {
  it("reads closed days and today apart, and next time only today", async () => {
    const first = await readSessionsInRange({ studioId: "solon", startMs: day(14) }, NOW);
    expect(first.sessions.map((s) => s.id)).toEqual(["today", "friday", "lastweek"]);
    expect(fake.reads).toEqual([
      { studio: "solon", from: day(14), to: TODAY_START - 1, max: 1500 },
      { studio: "solon", from: TODAY_START, to: null, max: 1500 },
    ]);

    // A session logged today since: the live part sees it; a narrower window is served from the keep.
    fake.rows.push({ id: "today2", hostedAtStudioId: "solon", createdAt: new Date("2026-10-05T15:00:00Z") });
    fake.reads = [];
    const again = await readSessionsInRange({ studioId: "solon", startMs: day(7) }, new Date(NOW.getTime() + 60_000));
    expect(again.sessions.map((s) => s.id)).toEqual(["today2", "today", "friday", "lastweek"]);
    expect(fake.reads).toEqual([{ studio: "solon", from: TODAY_START, to: null, max: 1500 }]);
  });

  it("keeps each studio apart, and forgets everything at sign-out", async () => {
    await readSessionsInRange({ studioId: "solon", startMs: day(14) }, NOW);
    fake.reads = [];
    const other = await readSessionsInRange({ studioId: "westlake", startMs: day(14) }, NOW);
    expect(other.sessions.map((s) => s.id)).toEqual(["away"]);
    expect(fake.reads.filter((r) => r.to !== null)).toHaveLength(1);

    forgetPersonalMemory();
    fake.reads = [];
    await readSessionsInRange({ studioId: "solon", startMs: day(14) }, NOW);
    expect(fake.reads.filter((r) => r.to !== null)).toHaveLength(1);
  });

  it("reads closed days again once the keep is older than it may be", async () => {
    await readSessionsInRange({ studioId: "solon", startMs: day(14) }, NOW);
    fake.reads = [];
    await readSessionsInRange({ studioId: "solon", startMs: day(14) }, new Date(NOW.getTime() + CLOSED_KEEP_MS + 1));
    expect(fake.reads.filter((r) => r.to !== null)).toHaveLength(1);
  });

  it("never keeps a stretch the cap cut", async () => {
    await readSessionsInRange({ studioId: "solon", startMs: day(14), max: 1 }, NOW);
    fake.reads = [];
    const again = await readSessionsInRange({ studioId: "solon", startMs: day(14), max: 1 }, NOW);
    expect(fake.reads.filter((r) => r.to !== null)).toHaveLength(1);
    expect(again.truncated).toBe(true);
  });

  it("a window that ended before today reads no today at all", async () => {
    const past = await readSessionsInRange({ studioId: "solon", startMs: day(14), endMs: day(4) }, NOW);
    expect(past.sessions.map((s) => s.id)).toEqual(["lastweek"]);
    expect(fake.reads).toEqual([{ studio: "solon", from: day(14), to: day(4), max: 1500 }]);
  });
});
