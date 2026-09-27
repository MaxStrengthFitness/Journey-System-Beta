// @vitest-environment jsdom
/**
 * THE HEADER'S AND THE CALENDAR'S REFRESH RECORD WHAT THEY READ IN FULL (the
 * whole-read record, Sep 27 2026). useScheduleRefresh mounted for real, the
 * Mindbody pull faked, and a fake Firestore that keeps a batch's writes only
 * when it commits. A whole answer writes today and tomorrow; a partial one
 * writes nothing; and the pull, the re-read and the toasts are as they were.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  commits: [] as { path: string; data: unknown; options: unknown }[][],
  answer: {} as Record<string, unknown>,
  toasts: [] as string[],
}));

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-sam" } }, functions: {} }));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({
    success: (m: string) => fake.toasts.push(`ok: ${m}`),
    error: (m: string) => fake.toasts.push(`error: ${m}`),
    info: (m: string) => fake.toasts.push(`info: ${m}`),
  }),
}));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
    arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
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
const pullMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/mindbody-api-sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/mindbody-api-sync")>()),
  syncMindbodySchedules: pullMock,
}));

import { useScheduleRefresh } from "./useScheduleRefresh";
import { forgetPersonalMemory } from "../sign-out/memory";
import type { Studio } from "../../types";

const solon = { id: "solon", name: "Solon", timezone: "America/New_York", mindbodySiteId: "5746957" } as unknown as Studio;

let root: Root;
let host: HTMLDivElement;
let hook: ReturnType<typeof useScheduleRefresh>;
const refreshSchedules = vi.fn();

function Probe({ studios = [solon] }: { studios?: Studio[] }) {
  hook = useScheduleRefresh({ studios, activeStudioId: "solon", trainers: [], clients: [], refreshSchedules });
  return null;
}

beforeEach(() => {
  fake.commits.length = 0;
  fake.toasts.length = 0;
  refreshSchedules.mockReset();
  pullMock.mockReset();
  pullMock.mockImplementation(async () => ({ added: 2, updated: 1, skipped: 5, errors: [], ...fake.answer }));
  forgetPersonalMemory();
  // Sun Sep 27 2026, 9:00 AM Eastern; only the clock is faked.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T13:00:00Z"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  host = document.createElement("div");
  root = createRoot(host);
  act(() => root.render(<Probe />));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function press(range?: { from: Date; to: Date }) {
  await act(async () => {
    await hook.pull(range);
  });
  // The record's commit is not waited for by the button; let it land.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

describe("the header's Refresh", () => {
  it("pulls the week ahead and records today and tomorrow after a whole answer", async () => {
    fake.answer = { windowComplete: true, studioAnswered: 12 };
    await press();
    expect(pullMock).toHaveBeenCalledTimes(1);
    // The pull as it was: the week ahead, for Solon, settling against the month.
    expect(pullMock.mock.calls[0].slice(5, 8)).toEqual(["2026-09-27", "2026-10-05", "solon"]);
    expect(pullMock.mock.calls[0][9]).toMatchObject({ skipKnownClientLookups: true, settleSweepWith: { start: "2026-09-27", end: "2026-10-27" } });
    expect(refreshSchedules).toHaveBeenCalledTimes(1);
    expect(fake.toasts).toEqual(["ok: Schedule refreshed: 2 added, 1 updated."]);
    expect(fake.commits).toEqual([
      [
        {
          path: "studios/solon/scheduleCoverage/2026-09",
          data: { days: { __arrayUnion: ["2026-09-27", "2026-09-28"] } },
          options: { merge: true },
        },
      ],
    ]);
    expect(hook.isRefreshing).toBe(false);
  });

  it("records nothing after a partial answer, and says so as before", async () => {
    fake.answer = { windowComplete: false, errors: ["Mindbody returned only part of the window, so cancelled bookings were not swept this run."] };
    await press();
    expect(pullMock).toHaveBeenCalledTimes(1);
    expect(fake.commits).toEqual([]);
    expect(fake.toasts[0]).toMatch(/^error: Sync completed with issues: Mindbody returned only part/);
  });

  it("records nothing when a lost booking's month came back whole but empty, and says what it did as before", async () => {
    // The week lost a booking and handed it to the month; the month held none
    // of Solon's bookings, so it returned before its sweep and decided nothing.
    fake.answer = { windowComplete: true, studioAnswered: 12, sweepDeferred: 1, settledWithMonth: true, settleAnswered: 0 };
    await press();
    expect(pullMock).toHaveBeenCalledTimes(1);
    expect(fake.commits).toEqual([]);
    expect(fake.toasts).toEqual(["ok: Schedule refreshed: 2 added, 1 updated."]);
  });

  it("records nothing after a whole answer that held none of the studio's bookings", async () => {
    fake.answer = { windowComplete: true, studioAnswered: 0 };
    await press();
    expect(fake.commits).toEqual([]);
  });

  it("writes the same days once, however often it is pressed", async () => {
    fake.answer = { windowComplete: true, studioAnswered: 12 };
    await press();
    await press();
    expect(pullMock).toHaveBeenCalledTimes(2);
    expect(fake.commits).toHaveLength(1);
  });

  it("asks nothing and records nothing for a studio with no Site ID", async () => {
    act(() => root.render(<Probe studios={[{ ...solon, mindbodySiteId: undefined } as unknown as Studio]} />));
    await press();
    expect(pullMock).not.toHaveBeenCalled();
    expect(fake.commits).toEqual([]);
  });
});

describe("the calendar's Refresh", () => {
  it("pulls the days on screen from today, and records today and tomorrow after a whole answer", async () => {
    fake.answer = { windowComplete: true, studioAnswered: 12 };
    // A month on screen that began last week.
    await press({ from: new Date("2026-09-21T16:00:00Z"), to: new Date("2026-10-31T16:00:00Z") });
    expect(pullMock.mock.calls[0].slice(5, 7)).toEqual(["2026-09-27", "2026-10-31"]);
    expect(refreshSchedules).not.toHaveBeenCalled();
    expect(fake.commits.flat().map((w) => w.data)).toEqual([{ days: { __arrayUnion: ["2026-09-27", "2026-09-28"] } }]);
  });

  it("records nothing after a partial answer", async () => {
    fake.answer = { windowComplete: false };
    await press({ from: new Date("2026-09-21T16:00:00Z"), to: new Date("2026-10-31T16:00:00Z") });
    expect(fake.commits).toEqual([]);
  });

  it("asks nothing and records nothing for a screen wholly in the past", async () => {
    await press({ from: new Date("2026-08-01T16:00:00Z"), to: new Date("2026-08-31T16:00:00Z") });
    expect(pullMock).not.toHaveBeenCalled();
    expect(fake.commits).toEqual([]);
  });
});
