// @vitest-environment jsdom
/**
 * THE BACKGROUND PULL'S CADENCE IS UNCHANGED, AND IT NO LONGER RE-DRAWS THE
 * APP EVERY MINUTE (speed round, Oct 5 2026, R6a).
 *
 * useAutoSync looks at the sync policy every minute. It used to store each
 * look's verdict as a new object, which re-rendered AppContent — the whole
 * app — once a minute on every iPad, though nothing reads the verdict. Now
 * the verdict is stored only when what it says (run, reason) changes.
 *
 * AJ's freshness rule (CLAUDE.md, the cost plan) is the pull's cadence, so
 * this mounts the hook for real over two simulated hours, with the real
 * policy, and pins: when it looks, what each look decided, and when it
 * pulled. The same expectations held on the code before the change (run on
 * c20d2abe while this was written); only the render count moved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  /** The lease document, shared by the listener stand-in and the transactions. */
  lease: {} as Record<string, unknown>,
  decisions: [] as Array<{ at: number; run: boolean; reason: string }>,
  pulls: [] as number[],
  renders: 0,
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
        get: async () => ({ exists: () => true, data: () => ({ ...fake.lease }) }),
        set: (_ref: unknown, data: Record<string, unknown>) => {
          Object.assign(fake.lease, data);
        },
      }),
    setDoc: async (_ref: unknown, data: Record<string, unknown>) => {
      Object.assign(fake.lease, data);
    },
    writeBatch: () => ({ set: () => {}, commit: async () => {} }),
  };
});
// The lease's listener: answered, and always the latest document (the real
// one re-renders with each snapshot; the hook reads it through a ref).
vi.mock("./sync-lease", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sync-lease")>()),
  useSyncLease: () => fake.lease,
}));
// The REAL policy, watched: every look and what it decided.
vi.mock("./syncPolicy", async (importOriginal) => {
  const real = await importOriginal<typeof import("./syncPolicy")>();
  return {
    ...real,
    decideSync: (ctx: Parameters<typeof real.decideSync>[0]) => {
      const verdict = real.decideSync(ctx);
      fake.decisions.push({ at: Date.now(), run: verdict.run, reason: verdict.reason });
      return verdict;
    },
  };
});
vi.mock("../../lib/mindbody-api-sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/mindbody-api-sync")>()),
  syncMindbodySchedules: async () => {
    fake.pulls.push(Date.now());
    return { added: 0, updated: 0, skipped: 0, errors: [], windowComplete: true, studioAnswered: 3 };
  },
}));

import "../../lib/mindbody-api-sync";
import { useAutoSync } from "./useAutoSync";
import type { Studio } from "../../types";

const westlake = {
  id: "westlake",
  name: "Westlake",
  timezone: "America/New_York",
  mindbodySiteId: "29068",
  mindbodyLocationId: "3",
  syncIntervalMinutes: 30,
} as unknown as Studio;

function Probe() {
  fake.renders += 1;
  useAutoSync({ studios: [westlake], activeStudioId: "westlake", trainers: [], clients: [], enabled: true });
  return null;
}

const MIN = 60_000;
/** Mon Oct 5 2026, 10:00 AM Eastern: inside the studio's pull hours. */
const T0 = new Date("2026-10-05T14:00:00Z").getTime();

let root: Root;
beforeEach(() => {
  fake.decisions = [];
  fake.pulls = [];
  fake.renders = 0;
  // The last pull was claimed 25 minutes ago; this morning's month is done.
  fake.lease = { lastScheduleSyncAt: T0 - 25 * MIN, scheduleSyncFailures: 0, lastDeepScheduleSyncAt: T0 - 60 * MIN };
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(T0);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function runFor(minutes: number) {
  await act(async () => {
    root.render(<Probe />);
  });
  for (let i = 0; i < minutes; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MIN);
    });
  }
}

const minutesOf = (ms: number) => (ms - T0) / MIN;

describe("the background pull's cadence (R6a)", () => {
  it("looks every minute, pulls every 30 minutes, and decides exactly as before", async () => {
    await runFor(120);

    // When it looked: twice on mount (the lease's arrival, and the timer's
    // first look), then once a minute.
    const looks = fake.decisions.map((d) => minutesOf(d.at));
    expect(looks).toEqual([0, 0, ...Array.from({ length: 120 }, (_, i) => i + 1)]);

    // When it pulled: 30 minutes after the last claim, then every 30 minutes.
    expect(fake.pulls.map(minutesOf)).toEqual([5, 35, 65, 95]);

    // What each look said: due on the pull minutes, not due in between.
    const due = new Set([5, 35, 65, 95]);
    for (const d of fake.decisions) {
      const m = minutesOf(d.at);
      expect(d.run).toBe(due.has(m));
      expect(d.reason).toBe(due.has(m) ? "due" : "not-due");
    }
  });

  it("re-draws only when the verdict says something new, never once a minute", async () => {
    await runFor(120);
    // 120 looks. Each pull re-draws for its running flag (on, off) and its
    // verdict (due, then not due again); the minutes between re-draw nothing.
    // Before R6a every look re-drew: well over 120 renders.
    expect(fake.renders).toBeLessThanOrEqual(1 + 4 * 6);
  });

  it("a hidden screen pulls nothing, and pulls the moment it is back when due", async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    const hide = (state: "hidden" | "visible") => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    await act(async () => {
      hide("hidden");
    });
    // Ten minutes hidden: no pull, though one fell due at minute 5.
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(MIN);
      });
    }
    expect(fake.decisions[fake.decisions.length - 1]).toMatchObject({ run: false, reason: "hidden" });
    expect(fake.pulls).toEqual([]);
    await act(async () => {
      hide("visible");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fake.pulls.map(minutesOf)).toEqual([10]);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
});
