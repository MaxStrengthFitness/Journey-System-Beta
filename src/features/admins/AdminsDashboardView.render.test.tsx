// @vitest-environment jsdom
/**
 * THE ADMINS DASHBOARD MOUNTS — the seven tabs for an administrator, each a
 * click away over an empty Firestore, and a refusal for anyone else.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "adm" } }, functions: {} }));
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

import { AdminsDashboardView } from "./AdminsDashboardView";
import type { Studio, Trainer } from "../../types";

const studios = [{ id: "solon", name: "Solon", timezone: "America/New_York" }] as unknown as Studio[];
const admin = { id: "adm", fullName: "Ada Admin", initials: "AA", role: "Admin", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as unknown as Trainer;
const lead = { id: "lead", fullName: "Lee Leader", initials: "LL", role: "HeadTrainer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as unknown as Trainer;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(who: Trainer, isAdmin: boolean) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <AdminsDashboardView authTrainer={who} studios={studios} networks={[]} trainers={[who]} clients={[]} machines={[]} isAdmin={isAdmin} activeStudioId="solon" />
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

describe("the Admins dashboard", () => {
  it("lists the seven, and opens each", async () => {
    const el = await mount(admin, true);
    expect(navLabels(el)).toEqual(["All locations", "Catalog", "Standard template", "Limbo", "System tools", "Bug reports", "Data"]);
    await clickNav(el, "Catalog");
    expect(el.textContent).toContain("Machine catalog");
    await clickNav(el, "Standard template");
    expect(el.textContent).toContain("The standard template");
    await clickNav(el, "Limbo");
    await clickNav(el, "System tools");
    await clickNav(el, "Bug reports");
    await clickNav(el, "Data");
    expect(el.textContent).toContain("An administrator exports any studio's data");
    await clickNav(el, "All locations");
  });

  it("refuses anyone who is not an administrator", async () => {
    const el = await mount(lead, false);
    expect(el.textContent).toContain("The Admins dashboard is for administrators and the founder.");
    expect(navLabels(el)).toEqual([]);
  });
});
