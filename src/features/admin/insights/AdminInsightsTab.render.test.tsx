// @vitest-environment jsdom
/**
 * INSIGHTS FROM THE NIGHT'S LINES (speed round, Oct 5 2026), mounted: the
 * window comes from studios/{s}/watch/sessions-YYYY-MM and today's sessions
 * live, with no 1,500 cap; a month the night hasn't written for last night
 * sends the screen back to the raw read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { digestRow, encodeMonth } from "../month-tally/month-tally";
import type { Studio, Trainer, WorkoutSession } from "../../../types";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } } }));
vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "westlake",
    activeStudio: { id: "westlake", name: "Westlake" },
    availableStudios: [{ id: "westlake", name: "Westlake" }],
    setActiveStudioId: () => {},
    isChangingStudio: false,
  }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  watch: {} as Record<string, unknown>,
  live: [] as Array<Record<string, unknown>>,
  raw: [] as Array<Record<string, unknown>>,
  reads: [] as number[],
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  getDoc: async (ref: { path: string }) => ({ exists: () => ref.path in fake.watch, data: () => fake.watch[ref.path] }),
  query: (_c: unknown, ...cs: Array<Record<string, unknown>>) => ({ cs }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: () => ({}),
  limit: () => ({}),
  getDocsFromServer: vi.fn(),
  getDocs: async (q: { cs: Array<Record<string, any>> }) => {
    const from = (q.cs.find((c) => c.field === "createdAt")?.value as Date).getTime();
    fake.reads.push(from);
    const rows = from >= LIVE_FROM ? fake.live : fake.raw;
    return { docs: rows.map((r) => ({ id: String(r.id), data: () => r })), size: rows.length, empty: rows.length === 0 };
  },
  Timestamp: { fromMillis: (ms: number) => new Date(ms) },
}));

const NOW = new Date("2026-09-28T16:00:00Z"); // Monday Sep 28, noon Eastern
const LIVE_FROM = new Date("2026-09-28T04:00:00Z").getTime();

import { AdminInsightsTab } from "./AdminInsightsTab";
import { OperationsScopeProvider } from "../scope-context";

const studios = [{ id: "westlake", name: "Westlake", timezone: "America/New_York" }] as Studio[];
const lead = { id: "lead", fullName: "Glorfindel Lord", role: "StudioLeader", primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"] } as unknown as Trainer;

/** 1,700 sessions over the window: more than the raw read's cap of 1,500. */
function nightDocs(throughDay = "2026-09-27") {
  const sessions: WorkoutSession[] = [];
  for (let i = 0; i < 1700; i += 1) {
    const day = 1 + (i % 27);
    const created = new Date(`2026-09-${String(day).padStart(2, "0")}T14:00:00Z`);
    sessions.push({ id: `n${i}`, date: created.toISOString().slice(0, 10), createdAt: created, status: "Completed", trainerId: i % 2 ? "t1" : "t2", clientId: `c${i % 200}` } as unknown as WorkoutSession);
  }
  const rows = sessions.map((s) => digestRow(s.id!, s)!);
  const run = { throughDay, liveFromMs: LIVE_FROM };
  return {
    "studios/westlake/watch/sessions-2026-09": encodeMonth("2026-09", rows, run),
    "studios/westlake/watch/sessions-2026-08": encodeMonth("2026-08", [], run),
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <OperationsScopeProvider authTrainer={lead} studios={studios} networks={[]} isAdmin={false} activeStudioId="westlake">
          <AdminInsightsTab studios={studios} trainers={[]} activeStudioId="westlake" />
        </OperationsScopeProvider>
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  fake.watch = {};
  fake.reads = [];
  fake.live = [{ id: "today", status: "Completed", trainerId: "t1", clientId: "c1", createdAt: new Date("2026-09-28T14:00:00Z"), hostedAtStudioId: "westlake" }];
  fake.raw = [{ id: "raw1", status: "Completed", trainerId: "t1", clientId: "c1", createdAt: new Date("2026-09-20T14:00:00Z"), hostedAtStudioId: "westlake" }];
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

const tile = (el: HTMLElement, label: string) =>
  Array.from(el.querySelectorAll(".adm-tile")).find((t) => t.textContent?.includes(label))?.textContent ?? "";

describe("Operations → Trends → Insights", () => {
  it("reads the night's lines and today live, with no cap on the window", async () => {
    Object.assign(fake.watch, nightDocs());
    const el = await mount();
    // Sep 1-27 lines inside the 30-day window, plus today's.
    expect(el.textContent).not.toContain("so these numbers cover the most recent");
    expect(tile(el, "Sessions")).toContain("1701");
    expect(fake.reads).toEqual([LIVE_FROM]);
  });

  it("reads raw, as before, when the night's lines are from before last night", async () => {
    Object.assign(fake.watch, nightDocs("2026-09-26"));
    const el = await mount();
    expect(tile(el, "Sessions")).toContain("1");
    expect(fake.reads).toHaveLength(1);
    expect(fake.reads[0]).toBeLessThan(LIVE_FROM);
  });
});
