// @vitest-environment jsdom
/**
 * OPERATIONS -> MINDBODY'S SYNC RECORDS WHAT IT READ IN FULL (the whole-read
 * record, Sep 27 2026). The tab mounted for real, "Pull the schedule now"
 * pressed, the Mindbody pull faked, and a fake Firestore that keeps a batch's
 * writes only when it commits. A whole answer to a past "Pull from" (a
 * back-read) records every day asked for; the month ahead records today and
 * tomorrow; a partial answer records nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  commits: [] as { path: string; data: unknown; options: unknown }[][],
  answer: {} as Record<string, unknown>,
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));
vi.mock("../../../lib/authed-fetch", () => ({ authedFetch: async () => ({ ok: true, json: async () => ({}) }) }));
vi.mock("../../../contexts/MindbodyHealthContext", () => ({
  useMindbodyHealth: () => ({
    status: "healthy",
    lastSuccessfulEventAt: null,
    lastFailureAt: null,
    dlqDepth: 0,
    signatureFailures24h: 0,
    webhookSubscriptionActive: true,
    hydrationP95LatencyMs: 0,
    updatedAt: null,
    isLoading: false,
    hasData: false,
    subscriptionError: null,
  }),
}));
vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const path = parts.filter((p) => typeof p === "string").join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  const emptySnap = { docs: [], size: 0, empty: true, forEach: () => {}, docChanges: () => [], metadata: { fromCache: false } };
  const emptyDoc = { exists: () => false, data: () => undefined, id: "id", metadata: { fromCache: false } };
  return {
    collection: ref,
    doc: ref,
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: (_target: unknown, next: (s: unknown) => void) => {
      const t = setTimeout(() => next(emptySnap), 0);
      return () => clearTimeout(t);
    },
    getDoc: async () => emptyDoc,
    getDocs: async () => emptySnap,
    updateDoc: async () => {},
    setDoc: async () => {},
    arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
    writeBatch: () => {
      const pending: { path: string; data: unknown; options: unknown }[] = [];
      return {
        set: (r: { path: string }, data: unknown, options?: unknown) => {
          pending.push({ path: r.path, data, options });
        },
        commit: async () => {
          fake.commits.push(pending);
        },
      };
    },
  };
});
const pullMock = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/mindbody-api-sync", () => ({ syncMindbodySchedules: pullMock }));

import { AdminMindbodyTab } from "./AdminMindbodyTab";
import { forgetPersonalMemory } from "../../sign-out/memory";
import type { Studio } from "../../../types";

const solon = {
  id: "solon",
  name: "Solon",
  timezone: "America/New_York",
  mindbodySiteId: "5746957",
  mindbodyLocationId: "1",
  mindbodyMode: "live",
} as unknown as Studio;

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  fake.commits.length = 0;
  pullMock.mockReset();
  pullMock.mockImplementation(async () => ({ added: 0, updated: 3, skipped: 40, errors: [], ...fake.answer }));
  forgetPersonalMemory();
  // Sun Sep 27 2026, 9:00 AM Eastern; only the clock is faked.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T13:00:00Z"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<AdminMindbodyTab studios={[solon]} trainers={[]} clients={[]} activeStudioId="solon" company={false} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setDate(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`no #${id}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pullNow() {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Pull the schedule now"));
  if (!button) throw new Error("no Pull the schedule now");
  await act(async () => {
    button.click();
  });
  await vi.waitFor(() => expect(pullMock).toHaveBeenCalledTimes(1));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

describe("Operations -> Mindbody's Sync", () => {
  it("records every day a back-read asked for after a whole answer, a month's end as two documents", async () => {
    fake.answer = { windowComplete: true, studioAnswered: 12 };
    setDate("mb-from", "2026-08-31");
    setDate("mb-to", "2026-09-26");
    await pullNow();
    // The pull as it was: the days typed, for Solon.
    expect(pullMock.mock.calls[0].slice(5, 8)).toEqual(["2026-08-31", "2026-09-26", "solon"]);
    expect(fake.commits).toHaveLength(1);
    const [august, september] = fake.commits[0];
    expect(august).toEqual({ path: "studios/solon/scheduleCoverage/2026-08", data: { days: { __arrayUnion: ["2026-08-31"] } }, options: { merge: true } });
    expect(september.path).toBe("studios/solon/scheduleCoverage/2026-09");
    const days = (september.data as { days: { __arrayUnion: string[] } }).days.__arrayUnion;
    expect(days).toHaveLength(26);
    expect(days[0]).toBe("2026-09-01");
    expect(days[25]).toBe("2026-09-26");
  });

  it("records today and tomorrow from the month ahead it opens on", async () => {
    fake.answer = { windowComplete: true, studioAnswered: 12 };
    await pullNow();
    expect(pullMock.mock.calls[0].slice(5, 7)).toEqual(["2026-09-27", "2026-10-27"]);
    expect(fake.commits.flat().map((w) => [w.path, w.data])).toEqual([
      ["studios/solon/scheduleCoverage/2026-09", { days: { __arrayUnion: ["2026-09-27", "2026-09-28"] } }],
    ]);
  });

  it("records nothing after a partial answer", async () => {
    fake.answer = { windowComplete: false, errors: ["Mindbody returned only part of the window"] };
    setDate("mb-from", "2026-08-31");
    setDate("mb-to", "2026-09-26");
    await pullNow();
    expect(pullMock).toHaveBeenCalledTimes(1);
    expect(fake.commits).toEqual([]);
  });

  it("records nothing after a whole back-read that held none of the studio's bookings", async () => {
    // A wrong Location ID answers empty and whole: the sync swept nothing.
    fake.answer = { windowComplete: true, studioAnswered: 0 };
    setDate("mb-from", "2026-08-31");
    setDate("mb-to", "2026-09-26");
    await pullNow();
    expect(pullMock.mock.calls[0].slice(5, 8)).toEqual(["2026-08-31", "2026-09-26", "solon"]);
    expect(fake.commits).toEqual([]);
  });
});
