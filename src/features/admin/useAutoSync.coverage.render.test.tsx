// @vitest-environment jsdom
/**
 * THE BACKGROUND PULL RECORDS WHAT IT READ IN FULL (the whole-read record,
 * Sep 27 2026). useAutoSync mounted for real: the sync policy is told to run
 * once, the Mindbody pull is faked, and the fake Firestore keeps a batch's
 * writes only when it commits. A whole answer writes today and tomorrow into
 * the month's document; a partial one writes nothing, and neither changes
 * what the pull asked for.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  commits: [] as { path: string; data: unknown; options: unknown }[][],
  claimsLeft: 1,
  deep: false,
  answer: {} as Record<string, unknown>,
  leaseWrites: [] as unknown[],
}));

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-sam" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
    arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async () => ({ exists: () => false, data: () => undefined }),
        set: (_ref: unknown, data: unknown) => {
          fake.leaseWrites.push(data);
        },
      }),
    setDoc: async (_ref: unknown, data: unknown) => {
      fake.leaseWrites.push(data);
    },
    writeBatch: () => {
      const pending: { path: string; data: unknown; options: unknown }[] = [];
      return {
        set: (ref: { path: string }, data: unknown, options?: unknown) => {
          pending.push({ path: ref.path, data, options });
        },
        commit: async () => {
          fake.commits.push(pending);
        },
      };
    },
  };
});
vi.mock("./sync-lease", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sync-lease")>()),
  // The lease has answered, and there is none yet.
  useSyncLease: () => null,
}));
vi.mock("./syncPolicy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./syncPolicy")>()),
  decideSync: () => ({ run: true, reason: "due" }),
  // One claim, however many times the hook looks.
  claimIsStillDue: () => fake.claimsLeft-- > 0,
  wantsDeepPull: () => fake.deep,
  isFirstDeepOfWeek: () => false,
}));
const pullMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/mindbody-api-sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/mindbody-api-sync")>()),
  syncMindbodySchedules: pullMock,
}));

import { useAutoSync } from "./useAutoSync";
import { forgetPersonalMemory } from "../sign-out/memory";
import type { Studio } from "../../types";

const westlake = {
  id: "westlake",
  name: "Westlake",
  timezone: "America/New_York",
  mindbodySiteId: "29068",
  mindbodyLocationId: "3",
} as unknown as Studio;
const solon = { id: "solon", name: "Solon", timezone: "America/New_York", mindbodySiteId: "5746957" } as unknown as Studio;

function Probe() {
  useAutoSync({ studios: [westlake, solon], activeStudioId: "westlake", trainers: [], clients: [], enabled: true });
  return null;
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  fake.commits.length = 0;
  fake.leaseWrites.length = 0;
  fake.claimsLeft = 1;
  fake.deep = false;
  pullMock.mockReset();
  pullMock.mockImplementation(async () => ({ added: 0, updated: 0, skipped: 0, errors: [], ...fake.answer }));
  forgetPersonalMemory();
  // Sun Sep 27 2026, 9:00 AM Eastern. Only the clock is faked: the hook's
  // minute timer and the waits below run on real time.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T13:00:00Z"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Mounts the hook and waits until the pull has finished and its lease is stamped. */
async function pullOnce() {
  await act(async () => {
    root.render(<Probe />);
  });
  await vi.waitFor(() => expect(pullMock).toHaveBeenCalledTimes(1));
  // The pull's own after-work: the failure count, stamped on the lease.
  await vi.waitFor(() => expect(fake.leaseWrites.some((w) => w && typeof w === "object" && "scheduleSyncFailures" in w)).toBe(true));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

const asked = () => ({ start: pullMock.mock.calls[0][5], end: pullMock.mock.calls[0][6] });

describe("the background pull", () => {
  it("records today and tomorrow after a whole answer, in this studio's month document", async () => {
    fake.answer = { windowComplete: true };
    await pullOnce();
    // The pull itself is as it was: today and tomorrow, for Westlake.
    expect(asked()).toEqual({ start: "2026-09-27", end: "2026-09-28" });
    expect(pullMock.mock.calls[0][7]).toBe("westlake");
    expect(fake.commits).toEqual([
      [
        {
          path: "studios/westlake/scheduleCoverage/2026-09",
          data: { days: { __arrayUnion: ["2026-09-27", "2026-09-28"] } },
          options: { merge: true },
        },
      ],
    ]);
  });

  it("records only today and tomorrow from the morning's whole month", async () => {
    fake.deep = true;
    fake.answer = { windowComplete: true };
    await pullOnce();
    expect(asked()).toEqual({ start: "2026-09-27", end: "2026-10-27" });
    expect(fake.commits.flat().map((w) => w.data)).toEqual([{ days: { __arrayUnion: ["2026-09-27", "2026-09-28"] } }]);
  });

  it("records nothing after a partial answer", async () => {
    fake.answer = { windowComplete: false, errors: ["Mindbody returned only part of the window"] };
    await pullOnce();
    expect(asked()).toEqual({ start: "2026-09-27", end: "2026-09-28" });
    expect(fake.commits).toEqual([]);
  });

  it("records nothing when a lost booking's wider pull came back short", async () => {
    fake.answer = { windowComplete: true, sweepDeferred: 1, settledWithMonth: false };
    await pullOnce();
    expect(fake.commits).toEqual([]);
  });
});
