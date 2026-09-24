// @vitest-environment jsdom
/**
 * THE OPERATIONS SHELL MOUNTS — the nine tabs for a studio's leader, the
 * Company group for an administrator, and every tab a click away without
 * a throw over an empty Firestore. Catches a tab whose component needs a
 * provider the shell does not give it (the Floor's editor was written for
 * the My Studio shell), and a nav that lists a tab it cannot render.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "solon",
    activeStudio: { id: "solon", name: "Solon", timezone: "America/New_York" },
    availableStudios: [{ id: "solon", name: "Solon" }],
    setActiveStudioId: () => {},
    isChangingStudio: false,
  }),
}));
vi.mock("../../lib/authed-fetch", () => ({ authedFetch: async () => ({ ok: true, json: async () => ({}) }) }));
vi.mock("../../contexts/MindbodyHealthContext", () => ({
  useMindbodyHealth: () => ({
    status: "offline",
    lastSuccessfulEventAt: null,
    lastFailureAt: null,
    dlqDepth: 0,
    signatureFailures24h: 0,
    webhookSubscriptionActive: false,
    hydrationP95LatencyMs: 0,
    updatedAt: null,
    isLoading: false,
    hasData: false,
    subscriptionError: null,
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
    startAfter: () => ({}),
    documentId: () => "__name__",
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const isDoc = target.path.split("/").length % 2 === 0;
      const t = setTimeout(() => next(isDoc ? emptyDoc : emptySnap), 0);
      return () => clearTimeout(t);
    },
    getDocs: async () => emptySnap,
    getDoc: async () => emptyDoc,
    getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
    updateDoc: async () => {},
    setDoc: async () => {},
    addDoc: async () => ({ id: "new" }),
    deleteDoc: async () => {},
    writeBatch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} }),
    serverTimestamp: () => new Date(),
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
  };
});

import { AdminDashboardView } from "./AdminDashboardView";
import type { Studio, Trainer } from "../../types";
import { DEMO_STUDIO_ID } from "../demo-mode/constants";

const studios = [{ id: "solon", name: "Solon", timezone: "America/New_York", mindbodySiteId: "5746957", mindbodyMode: "live" }] as unknown as Studio[];
const lead = { id: "lead", fullName: "Lee Leader", initials: "LL", role: "HeadTrainer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as unknown as Trainer;
const admin = { id: "adm", fullName: "Ada Admin", initials: "AA", role: "Admin", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as unknown as Trainer;
const trainer = { id: "lt", fullName: "Tia Trainer", initials: "TT", role: "LifeTransformer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as unknown as Trainer;
const granted = { ...trainer, id: "lt2", managedStudioIds: ["solon"] } as unknown as Trainer;
const demoStudio = { id: DEMO_STUDIO_ID, name: "Demo Mode", isDemo: true, timezone: "America/New_York" } as unknown as Studio;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(who: Trainer, isAdmin: boolean, activeStudioId = "solon", studioList: Studio[] = studios) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <AdminDashboardView authTrainer={who} studios={studioList} networks={[]} trainers={[who]} isAdmin={isAdmin} clients={[]} machines={[]} schedules={[]} activeStudioId={activeStudioId} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return host;
}

const navLabels = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>(".adm-shell__side .adm-nav__btn")].map((b) => (b.textContent ?? "").trim());
const clickNav = async (el: HTMLElement, label: string) => {
  const btn = [...el.querySelectorAll<HTMLButtonElement>(".adm-shell__side .adm-nav__btn")].find((b) => (b.textContent ?? "").trim() === label);
  expect(btn).toBeTruthy();
  await act(async () => {
    btn!.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
};

describe("the Operations shell", () => {
  it("lists the nine for a studio's leader, and none of the company tier", async () => {
    const el = await mount(lead, false);
    expect(navLabels(el)).toEqual(["Overview", "Renewals", "Delight queue", "Floor", "Staff & Roles", "Insights", "Announcements", "Mindbody", "Data"]);
    expect(el.textContent).toContain("Solon — Overview");
  });

  it("lists the same nine for an administrator — the company tier lives on the Admins dashboard", async () => {
    const el = await mount(admin, true);
    expect(navLabels(el)).toEqual(["Overview", "Renewals", "Delight queue", "Floor", "Staff & Roles", "Insights", "Announcements", "Mindbody", "Data"]);
    // An administrator's Mindbody tab is the whole estate.
    await clickNav(el, "Mindbody");
    expect(el.textContent).toContain("Studios linked");
  });

  it("every studio-side tab opens for a leader", async () => {
    const el = await mount(lead, false);
    await clickNav(el, "Floor");
    expect(el.textContent).toContain("Solon — Machines");
    expect(el.querySelector('[role="tablist"][aria-label="Floor view"]')).toBeTruthy();
    await clickNav(el, "Insights");
    expect(el.querySelector('[role="tablist"][aria-label="Insights view"]')).toBeTruthy();
    await clickNav(el, "Mindbody");
    expect(el.textContent).toContain("Solon — Mindbody");
    // The estate — every studio, worst first — is the administrator's, not the leader's.
    expect(el.textContent).not.toContain("Studios linked");
    await clickNav(el, "Announcements");
    expect(el.textContent).toContain("Post an announcement");
    await clickNav(el, "Data");
    await clickNav(el, "Staff & Roles");
    await clickNav(el, "Renewals");
    await clickNav(el, "Delight queue");
    expect(el.textContent).toContain("Delight queue");
  });
});

/*
 * THE SHELL'S OWN GATE (sign-out round, Sep 24 2026). AppContent sends anyone
 * who may not open Operations to the Hub before this is drawn; the shell
 * refuses on its own as well, so no other door can open it for them.
 */
describe("the Operations shell's own gate", () => {
  const NINE = ["Overview", "Renewals", "Delight queue", "Floor", "Staff & Roles", "Insights", "Announcements", "Mindbody", "Data"];

  it("refuses a Life Transformer at a real studio: a sentence, and none of the nine", async () => {
    const el = await mount(trainer, false);
    expect(navLabels(el)).toEqual([]);
    expect(el.querySelector('[data-testid="operations-closed"]')).toBeTruthy();
    expect(el.textContent).toContain("Operations is for a studio's leaders");
    expect(el.textContent).not.toContain("Solon — Overview");
  });

  it("refuses a trainer with the grant: it opens My Studio's leader sections, not Operations", async () => {
    const el = await mount(granted, false);
    expect(navLabels(el)).toEqual([]);
    expect(el.querySelector('[data-testid="operations-closed"]')).toBeTruthy();
  });

  it("opens for a Life Transformer inside Demo Mode, where everyone has the run of it", async () => {
    const el = await mount(trainer, false, DEMO_STUDIO_ID, [...studios, demoStudio]);
    expect(el.querySelector('[data-testid="operations-closed"]')).toBeNull();
    expect(navLabels(el)).toEqual(NINE);
  });

  it("still opens for a studio's leader at a real studio", async () => {
    const el = await mount(lead, false);
    expect(el.querySelector('[data-testid="operations-closed"]')).toBeNull();
    expect(navLabels(el)).toEqual(NINE);
  });
});
