// @vitest-environment jsdom
/**
 * OPERATIONS → HOURS MOUNTS — one studio, every studio, and a month flip,
 * over a Firestore that answers with a few sessions. Catches a render that
 * throws on empty data, a hook-order slip, and a total that does not add up
 * across studios.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
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

const sessionsByStudio: Record<string, unknown[]> = {
  solon: [
    { trainerId: "t1", trainerInitials: "AJ", status: "Completed", date: "2026-09-14", hostedAtStudioId: "solon" },
    { trainerId: "t1", trainerInitials: "AJ", status: "Completed", date: "2026-09-15", hostedAtStudioId: "solon" },
    { trainerId: "t2", trainerInitials: "LB", status: "Completed", date: "2026-09-15", hostedAtStudioId: "solon" },
    { trainerId: "t2", trainerInitials: "LB", status: "In-Progress", date: "2026-09-16", hostedAtStudioId: "solon" },
  ],
  westlake: [{ trainerId: "t3", trainerInitials: "MK", status: "Completed", date: "2026-09-02", hostedAtStudioId: "westlake" }],
};

vi.mock("firebase/firestore", () => {
  let studioAsked = "";
  return {
    collection: (_db: unknown, path: string) => ({ path }),
    query: (q: unknown) => q,
    where: (field: string, _op: string, value: unknown) => {
      if (field === "hostedAtStudioId") studioAsked = String(value);
      return {};
    },
    orderBy: () => ({}),
    limit: () => ({}),
    getDocs: async () => {
      const docs = (sessionsByStudio[studioAsked] ?? []).map((d, i) => ({ id: `s${i}`, data: () => d }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
    Timestamp: { fromMillis: (ms: number) => new Date(ms) },
  };
});

import { AdminHoursTab } from "./AdminHoursTab";
import { OperationsScopeProvider, ScopeBar } from "../scope-context";
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

let root: Root | null = null;
let host: HTMLDivElement | null = null;

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
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe("Operations → Hours", () => {
  it("adds up one studio's month by trainer and by week, at the slot length", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-09-19T15:00:00Z") });
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
  });

  it("gives an owner every studio, with a company total that adds the studios up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-09-19T15:00:00Z") });
    const el = await mount(owner);
    const select = el.querySelector<HTMLSelectElement>("#ops-scope")!;
    expect(select.querySelector("option[value=all]")).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(select, "all");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    const text = el.textContent ?? "";
    expect(text).toContain("Westlake");
    expect(text).toContain("Mo Khan");
    // 3 + 1 sessions × 30 min = 2 h across two studios.
    expect(text).toContain("2 h");
    expect(text).toContain("4 sessions across 2 studios");
  });

  it("walks back a month and comes up empty without throwing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-09-19T15:00:00Z") });
    const el = await mount(leader);
    const back = el.querySelector<HTMLButtonElement>('button[aria-label="Previous month"]')!;
    await act(async () => {
      back.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    const text = el.textContent ?? "";
    expect(text).toContain("August 2026");
    expect(text).toContain("No completed sessions this month");
  });
});
