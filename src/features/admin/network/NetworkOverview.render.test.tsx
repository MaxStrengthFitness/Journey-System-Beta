// @vitest-environment jsdom
/**
 * THE OVERVIEW UNDER "ALL MY STUDIOS" — the scope bar switches the Overview
 * from one studio's day to the network view (the folded Franchise
 * dashboard), and back, without a throw. Firestore answers every stream
 * with nothing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "owner" } }, functions: {} }));

const picks: string[] = [];
vi.mock("../../../ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "solon",
    activeStudio: { id: "solon", name: "Solon" },
    availableStudios: [
      { id: "solon", name: "Solon" },
      { id: "westlake", name: "Westlake" },
    ],
    setActiveStudioId: (id: string) => picks.push(id),
    isChangingStudio: false,
  }),
}));

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/"), id: "id" });
  const emptySnap = { docs: [], size: 0, empty: true, forEach: () => {}, docChanges: () => [], metadata: { fromCache: false } };
  return {
    collection: ref,
    collectionGroup: ref,
    doc: ref,
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: (_t: unknown, a: unknown, b?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const t = setTimeout(() => next(emptySnap), 0);
      return () => clearTimeout(t);
    },
    getDocs: async () => emptySnap,
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    updateDoc: async () => {},
    setDoc: async () => {},
    serverTimestamp: () => new Date(),
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
  };
});

import { AdminOverviewTab } from "../AdminOverviewTab";
import { OperationsScopeProvider, ScopeBar } from "../scope-context";
import type { Studio, Trainer } from "../../../types";

const studios = [
  { id: "solon", name: "Solon", timezone: "America/New_York", mindbodySiteId: "5746957", mindbodyMode: "live" },
  { id: "westlake", name: "Westlake", timezone: "America/New_York" },
] as unknown as Studio[];
const owner = {
  id: "owner",
  fullName: "Own Er",
  initials: "OE",
  role: "Owner",
  primaryHomeStudioId: "solon",
  accessibleStudioIds: ["solon"],
  ownedStudioIds: ["solon", "westlake"],
} as unknown as Trainer;
const trainers = [
  owner,
  { id: "t1", fullName: "New Hire", initials: "NH", primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"] },
] as unknown as Trainer[];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <OperationsScopeProvider authTrainer={owner} studios={studios} networks={[]} isAdmin={false} activeStudioId="solon">
          <ScopeBar />
          <AdminOverviewTab authTrainer={owner} studios={studios} trainers={trainers} activeStudioId="solon" schedules={[]} sessions={[]} clients={[]} />
        </OperationsScopeProvider>
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

async function choose(el: HTMLElement, value: string) {
  const select = el.querySelector<HTMLSelectElement>("#ops-scope")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("the Overview under the Operations scope", () => {
  it("shows one studio's day, then every studio's tiles under All my studios, and a location switches the app", async () => {
    const el = await mount();
    expect(el.textContent).toContain("Solon — today");

    await choose(el, "all");
    const text = el.textContent ?? "";
    expect(text).toContain("All my studios");
    expect(text).toContain("Waiting to be let in");
    expect(text).toContain("Westlake");
    // The new hire with no role is the one person waiting.
    expect(el.querySelector(".adm-tile__value")?.textContent).toBe("1");

    const westlake = [...el.querySelectorAll<HTMLButtonElement>(".adm-fr-row__btn")].find((b) => b.textContent?.includes("Westlake"))!;
    await act(async () => {
      westlake.click();
    });
    expect(picks).toContain("westlake");
  });
});
