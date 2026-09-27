// @vitest-environment jsdom
/**
 * THE OVERVIEW UNDER "ALL MY STUDIOS" — the scope bar switches the page
 * from one studio's Overview to the network view (the folded Franchise
 * dashboard, with the network's focus and launch since Sep 27 2026) without a
 * throw. Also the one-studio footer, for a franchise owner who has no "All my
 * studios" to choose, and that footer inside Demo Mode, where no real
 * network's focus is offered. Firestore answers every read with nothing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "owner" } }, functions: {} }));

const picks: string[] = [];
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));

vi.mock("../../../contexts/ActiveStudioContext", () => ({
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
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    const path = [...base, ...parts.filter((p) => typeof p === "string")].join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  const emptySnap = { docs: [], size: 0, empty: true, forEach: () => {}, docChanges: () => [], metadata: { fromCache: false } };
  const emptyDoc = { exists: () => false, data: () => undefined, id: "id", metadata: { fromCache: false } };
  return {
    collection: ref,
    collectionGroup: ref,
    doc: ref,
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const isDoc = target.path.split("/").length % 2 === 0;
      const t = setTimeout(() => next(isDoc ? emptyDoc : emptySnap), 0);
      return () => clearTimeout(t);
    },
    getDocs: async () => emptySnap,
    getDoc: async () => emptyDoc,
    updateDoc: async () => {},
    setDoc: async () => {},
    serverTimestamp: () => new Date(),
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
  };
});

import { OverviewPage } from "../overview/OverviewPage";
import { OperationsScopeProvider, ScopeBar } from "../scope-context";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";

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

async function mount(reader: Trainer = owner, inScope: Studio[] = studios, at = "solon", networks: FranchiseNetwork[] = []) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <OperationsScopeProvider authTrainer={reader} studios={inScope} networks={networks} isAdmin={false} activeStudioId={at}>
          <ScopeBar />
          <OverviewPage authTrainer={reader} studios={inScope} trainers={trainers} machines={[]} clients={[]} schedules={[]} activeStudioId={at} networks={networks} />
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
  it("shows one studio's Overview, then every studio's tiles under All my studios, and a location switches the app", async () => {
    const el = await mount();
    expect(el.textContent).toContain("Solon — Overview");
    // One studio's Overview is not where an owner who can choose "All my
    // studios" launches across them.
    expect(el.textContent).not.toContain("Launch an initiative");

    await choose(el, "all");
    const text = el.textContent ?? "";
    expect(text).toContain("All my studios");
    expect(text).toContain("Waiting to be let in");
    expect(text).toContain("Westlake");
    // The new hire with no role is the one person waiting.
    expect(el.querySelector(".adm-tile__value")?.textContent).toBe("1");

    // The network's two actions moved here from Relay → Network (voice-review
    // round, Sep 27 2026), and the studio ranking did not come with them.
    expect(text).toContain("Focus this quarter");
    expect(text).toContain("Launch at 2 studios");
    expect(text).not.toMatch(/New this month|Loops closed/);

    const westlake = [...el.querySelectorAll<HTMLButtonElement>(".adm-fr-row__btn")].find((b) => b.textContent?.includes("Westlake"))!;
    await act(async () => {
      westlake.click();
    });
    expect(picks).toContain("westlake");
  });
});

describe("a franchise owner who sees one studio", () => {
  it("finds the network's actions at the foot of that studio's Overview, with no All my studios to choose", async () => {
    const soloOwner = { ...owner, ownedStudioIds: ["solon"] } as unknown as Trainer;
    const el = await mount(soloOwner, [studios[0]]);
    expect(el.querySelector("#ops-scope")).toBeNull();
    expect(el.textContent).toContain("Solon — Overview");
    expect(el.textContent).toContain("Launch at 1 studio");
  });
});

describe("a franchise owner inside Demo Mode", () => {
  it("is offered no real network's focus at the foot of the practice studio's Overview (the realm rule)", async () => {
    const franchiseOwner = { ...owner, role: "FranchiseOwner" } as unknown as Trainer;
    const demo = { id: "demo-studio", name: "Demo Studio", isDemo: true, timezone: "America/New_York" } as unknown as Studio;
    const ohio: FranchiseNetwork = {
      id: "n-ohio",
      name: "Ohio",
      studioIds: ["solon", "westlake"],
      ownerId: "owner",
      relayFocus: { mastery: "Hip hinge", machine: "Leg Curl", note: "" },
    };
    const el = await mount(franchiseOwner, [demo, ...studios], "demo-studio", [ohio]);
    // One studio in the realm, so no "All my studios" to choose.
    expect(el.querySelector("#ops-scope")).toBeNull();
    expect(el.textContent).toContain("Demo Studio — Overview");
    expect(el.querySelector("#nw-focus-n-ohio-mastery")).toBeNull();
    expect(el.textContent).not.toContain("Hip hinge");
    expect(el.textContent).toContain("Demo Studio is not in a network");
    // The launch stays inside the realm: it would post at the practice studio only.
    expect(el.textContent).toContain("Launch at 1 studio");
    expect(el.textContent).not.toContain("Posts at Solon");
  });
});
