// @vitest-environment jsdom
/**
 * OPERATIONS → HOURS MOUNTS — one studio, every studio, and a month flip,
 * over a Firestore that answers with a few sessions. Catches a render that
 * throws on empty data, a hook-order slip, and a total that does not add up
 * across studios.
 *
 * Since the speed round (Oct 5 2026) Hours asks the night's counts first
 * (studios/{s}/watch/hours-YYYY-MM) and reads today live; without them it
 * reads the raw month, as before. "All my studios" reads only the night's
 * counts until a studio is opened.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "owner" } } }));

vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "solon",
    activeStudio: { id: "solon", name: "Solon" },
    availableStudios: [
      { id: "solon", name: "Solon" },
      { id: "westlake", name: "Westlake" },
    ],
    setActiveStudioId: () => {},
    isChangingStudio: false,
  }),
}));

const at = (iso: string) => new Date(iso);
const fake = vi.hoisted(() => ({
  sessions: {} as Record<string, Array<Record<string, unknown>>>,
  watch: {} as Record<string, Record<string, unknown>>,
  sessionReads: [] as Array<{ studio: string; from: number; to: number | null }>,
  watchReads: [] as string[],
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  getDoc: async (ref: { path: string }) => {
    fake.watchReads.push(ref.path);
    const data = fake.watch[ref.path];
    return { exists: () => Boolean(data), data: () => data };
  },
  query: (_c: unknown, ...cs: Array<Record<string, unknown>>) => ({ cs }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: () => ({}),
  limit: (n: number) => ({ n }),
  getDocsFromServer: vi.fn(),
  getDocs: async (q: { cs: Array<Record<string, any>> }) => {
    const studio = q.cs.find((c) => c.field === "hostedAtStudioId")?.value as string;
    const from = (q.cs.find((c) => c.field === "createdAt" && c.op === ">=")?.value as Date).getTime();
    const toC = q.cs.find((c) => c.field === "createdAt" && c.op === "<=");
    const to = toC ? (toC.value as Date).getTime() : null;
    fake.sessionReads.push({ studio, from, to });
    const rows = (fake.sessions[studio] ?? []).filter((s) => {
      const t = (s.createdAt as Date).getTime();
      return t >= from && (to === null || t <= to);
    });
    const docs = rows.map((d) => ({ id: String(d.id), data: () => d }));
    return { docs, size: docs.length, empty: docs.length === 0 };
  },
  Timestamp: { fromMillis: (ms: number) => new Date(ms) },
}));

import { AdminHoursTab } from "./AdminHoursTab";
import { OperationsScopeProvider, ScopeBar } from "../scope-context";
import { forgetClosedSessions } from "../sessions-range";
import type { Studio, Trainer } from "../../../types";

const studios = [
  { id: "solon", name: "Solon", timezone: "America/New_York", sessionMinutes: 30 },
  { id: "westlake", name: "Westlake", timezone: "America/New_York" },
] as Studio[];
const trainers = [
  { id: "t1", fullName: "AJ Jurgens", initials: "AJ" },
  { id: "t2", fullName: "Lee Brown", initials: "LB" },
  { id: "t3", fullName: "Mo Khan", initials: "MK" },
] as Trainer[];
const owner = { id: "owner", fullName: "Own Er", initials: "OE", role: "Owner", primaryHomeStudioId: "solon", accessibleStudioIds: [], ownedStudioIds: ["solon", "westlake"] } as unknown as Trainer;
const leader = { id: "t1", fullName: "AJ Jurgens", initials: "AJ", role: "HeadTrainer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as unknown as Trainer;

/** Sep 19 2026, 11 am Eastern. */
const NOW = at("2026-09-19T15:00:00Z");
/** The night's counts, as the job wrote them at 2:30 am on Sep 19. */
const night = (month: string, trainersRows: Array<{ key: string; weeks: Record<string, number> }>, extra: Record<string, unknown> = {}) => ({
  v: 1,
  month,
  throughDay: "2026-09-18",
  liveFromMs: at("2026-09-19T04:00:00Z").getTime(),
  lateIds: [],
  trainers: trainersRows.map((t) => ({ ...t, measuredSessions: 0, measuredMinutes: 0 })),
  unattributed: 0,
  open: 0,
  ...extra,
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

async function mount(who: Trainer, isAdmin = false) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <OperationsScopeProvider authTrainer={who} studios={studios} networks={[]} isAdmin={isAdmin} activeStudioId="solon">
          <ScopeBar />
          <AdminHoursTab trainers={trainers} />
        </OperationsScopeProvider>
      </StrictMode>,
    );
  });
  await settle();
  return host;
}

async function chooseAllStudios(el: HTMLElement) {
  const select = el.querySelector<HTMLSelectElement>("#ops-scope")!;
  expect(select.querySelector("option[value=all]")).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    setter.call(select, "all");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  forgetClosedSessions();
  fake.sessionReads = [];
  fake.watchReads = [];
  fake.watch = {};
  fake.sessions = {
    solon: [
      { id: "a", trainerId: "t1", trainerInitials: "AJ", status: "Completed", date: "2026-09-14", createdAt: at("2026-09-14T15:00:00Z"), hostedAtStudioId: "solon" },
      { id: "b", trainerId: "t1", trainerInitials: "AJ", status: "Completed", date: "2026-09-15", createdAt: at("2026-09-15T15:00:00Z"), hostedAtStudioId: "solon" },
      { id: "c", trainerId: "t2", trainerInitials: "LB", status: "Completed", date: "2026-09-15", createdAt: at("2026-09-15T16:00:00Z"), hostedAtStudioId: "solon" },
      { id: "d", trainerId: "t2", trainerInitials: "LB", status: "In-Progress", date: "2026-09-16", createdAt: at("2026-09-16T15:00:00Z"), hostedAtStudioId: "solon" },
    ],
    westlake: [{ id: "w", trainerId: "t3", trainerInitials: "MK", status: "Completed", date: "2026-09-02", createdAt: at("2026-09-02T15:00:00Z"), hostedAtStudioId: "westlake" }],
  };
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe("Operations → Hours", () => {
  it("adds up one studio's month by trainer and by week, at the slot length, from the raw read when the night has nothing", async () => {
    const el = await mount(leader);
    const text = el.textContent ?? "";
    expect(text).toContain("September 2026");
    expect(text).toContain("AJ Jurgens");
    expect(text).toContain("Lee Brown");
    // 3 completed × 30 min = 1.5 h; the open one is reported, not counted.
    expect(text).toContain("1.5 h");
    expect(text).toContain("1 session is still open");
    // A head trainer of one studio gets no scope bar at all.
    expect(el.querySelector("#ops-scope")).toBeNull();
    expect(fake.watchReads).toContain("studios/solon/watch/hours-2026-09");
  });

  it("reads the night's counts and today live, and never the raw month, when the night has them", async () => {
    fake.watch["studios/solon/watch/hours-2026-09"] = night("2026-09", [
      { key: "t1", weeks: { "2026-09-14": 2 } },
      { key: "t2", weeks: { "2026-09-14": 1 } },
    ]);
    // Logged this morning.
    fake.sessions.solon.push({ id: "today", trainerId: "t2", status: "Completed", date: "2026-09-19", createdAt: at("2026-09-19T13:00:00Z"), hostedAtStudioId: "solon" });
    const el = await mount(leader);
    const text = el.textContent ?? "";
    // 3 from the night + 1 today = 4 × 30 min = 2 h.
    expect(text).toContain("2 h");
    expect(text).toContain("4 sessions");
    expect(fake.sessionReads).toEqual([{ studio: "solon", from: at("2026-09-19T04:00:00Z").getTime(), to: null }]);
  });

  it("gives an owner every studio, with a total from the night's counts, and a studio's month only when it is opened", async () => {
    fake.watch["studios/solon/watch/hours-2026-09"] = night("2026-09", [
      { key: "t1", weeks: { "2026-09-14": 2 } },
      { key: "t2", weeks: { "2026-09-14": 1 } },
    ]);
    fake.watch["studios/westlake/watch/hours-2026-09"] = night("2026-09", [{ key: "t3", weeks: { "2026-08-31": 1 } }]);
    const el = await mount(owner);
    await chooseAllStudios(el);
    fake.sessionReads = [];
    let text = el.textContent ?? "";
    expect(text).toContain("Westlake");
    // 3 + 1 sessions × 30 min = 2 h across two studios.
    expect(text).toContain("2 h");
    expect(text).toContain("4 sessions across 2 studios, to last night");
    expect(text).not.toContain("Mo Khan");
    expect(fake.sessionReads).toEqual([]);

    const westlake = Array.from(el.querySelectorAll<HTMLButtonElement>("button.adm-row")).find((b) => b.textContent?.includes("Westlake"))!;
    await act(async () => {
      westlake.click();
    });
    await settle();
    text = el.textContent ?? "";
    expect(text).toContain("Mo Khan");
    // Only Westlake's today was read.
    expect(fake.sessionReads.map((r) => r.studio)).toEqual(["westlake"]);
  });

  it("names a studio the night hasn't counted rather than adding it as nothing", async () => {
    fake.watch["studios/solon/watch/hours-2026-09"] = night("2026-09", [{ key: "t1", weeks: { "2026-09-14": 2 } }]);
    // Westlake's is from the night before last: too old.
    fake.watch["studios/westlake/watch/hours-2026-09"] = night("2026-09", [{ key: "t3", weeks: { "2026-08-31": 1 } }], { throughDay: "2026-09-17" });
    const el = await mount(owner);
    await chooseAllStudios(el);
    const text = el.textContent ?? "";
    expect(text).toContain("2 sessions across 1 studio, to last night");
    expect(text).toContain("Not in the total yet: Westlake");
  });

  it("walks back a month and comes up empty without throwing", async () => {
    const el = await mount(leader);
    const back = el.querySelector<HTMLButtonElement>('button[aria-label="Previous month"]')!;
    await act(async () => {
      back.click();
    });
    await settle();
    const text = el.textContent ?? "";
    expect(text).toContain("August 2026");
    expect(text).toContain("No completed sessions this month");
  });
});
