// @vitest-environment jsdom
/**
 * THE ADMINS DASHBOARD MOUNTS — the Command Center shell for an administrator:
 * every page a tap away in the sidebar and on the portrait bar, the search
 * opening a studio, the page kept while the search is open, and a refusal for
 * anyone else.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  // The catalog editor's Standard machine and Other names ask it who may
  // change them (Machine Catalog wave 2, Sep 28 2026).
  useOptionalActiveStudio: () => ({ isAdmin: true }),
}));
vi.mock("../../lib/authed-fetch", () => ({ authedFetch: async () => ({ ok: true, json: async () => ({}) }) }));

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    const path = [...base, ...parts.filter((p) => typeof p === "string")].join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  // The machine catalog answers with two machines; everything else is empty.
  const machines = [
    { id: "m-leg-press", name: "Leg Press", status: "active" },
    { id: "m-lumbar", name: "Lumbar Extension", status: "active" },
  ];
  const snapOf = (docs: Array<Record<string, unknown> & { id: string }>) => ({
    docs: docs.map((d) => ({ id: d.id, data: () => d, exists: () => true })),
    size: docs.length,
    empty: docs.length === 0,
    forEach: (fn: (d: unknown) => void) => docs.forEach((d) => fn({ id: d.id, data: () => d })),
    docChanges: () => [],
    metadata: { fromCache: false },
  });
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
      const answer = isDoc ? emptyDoc : snapOf(target.path === "machines" ? machines : []);
      const t = setTimeout(() => next(answer), 0);
      return () => clearTimeout(t);
    },
    getDocs: async () => snapOf([]),
    getDoc: async () => emptyDoc,
    getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
    updateDoc: async () => {},
    setDoc: async () => {},
    addDoc: async () => ({ id: "new" }),
    deleteDoc: async () => {},
    deleteField: () => ({ __delete: true }),
    writeBatch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} }),
    serverTimestamp: () => new Date(),
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
  };
});

import { AdminsDashboardView } from "./AdminsDashboardView";
import type { Studio, Trainer } from "../../types";

const studios = [
  { id: "solon", name: "Solon", timezone: "America/New_York", mindbodySiteId: "5746957" },
  { id: "westlake", name: "Westlake", timezone: "America/New_York", mindbodySiteId: "29068", mindbodyLocationId: "3" },
] as unknown as Studio[];
const admin = { id: "adm", fullName: "Ada Admin", initials: "AA", role: "Admin", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as unknown as Trainer;
const imrahil = { id: "imr", fullName: "Imrahil", initials: "IM", role: "HeadTrainer", primaryHomeStudioId: "westlake", accessibleStudioIds: [] } as unknown as Trainer;
const lead = { id: "lead", fullName: "Lee Leader", initials: "LL", role: "HeadTrainer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as unknown as Trainer;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
};

async function mount(who: Trainer, isAdmin: boolean) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <AdminsDashboardView authTrainer={who} studios={studios} networks={[]} trainers={[who, imrahil]} clients={[]} machines={[]} isAdmin={isAdmin} activeStudioId="solon" />
      </StrictMode>,
    );
  });
  await settle();
  return host;
}

const texts = (el: HTMLElement, selector: string) => [...el.querySelectorAll<HTMLElement>(selector)].map((b) => (b.textContent ?? "").trim());

async function click(el: Element | null | undefined) {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

const byText = (el: HTMLElement, selector: string, text: string) =>
  [...el.querySelectorAll<HTMLElement>(selector)].find((b) => (b.textContent ?? "").trim() === text);

async function type(el: HTMLElement, text: string) {
  const input = el.querySelector<HTMLInputElement>(".hq-search__input")!;
  expect(input, "the search field").toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("the Admins dashboard", () => {
  it("lists every page in the sidebar under its place, and opens each", async () => {
    const el = await mount(admin, true);
    expect(texts(el, ".hq-side .hq-nav__group")).toEqual(["Studios", "The MSF standard", "The machinery"]);
    expect(texts(el, ".hq-side .hq-nav__item")).toEqual([
      "Home",
      "All studios",
      "Franchises",
      "Machines",
      "Standard template",
      "Waiting for review",
      "Limbo",
      "Mindbody sync",
      "Bug reports",
      "Data",
      "System tools",
    ]);
    // It opens on Home: nothing waits in this empty Firestore.
    expect(el.textContent).toContain("Nothing needs you right now.");
    expect(el.textContent).toContain("2 studios. No cutover date yet: Solon and Westlake.");
    expect(el.textContent).toContain("2 machines in the standard set, of 2 in the MSF catalog.");
    await click(byText(el, ".hq-side .hq-nav__item", "All studios"));
    expect(el.textContent).toContain("grouped by what Journey knows today");
    await click(byText(el, ".hq-side .hq-nav__item", "Franchises"));
    expect(el.textContent).toContain("A franchise groups studios under one owner");
    await click(byText(el, ".hq-side .hq-nav__item", "Machines"));
    expect(el.textContent).toContain("Machine catalog");
    await click(byText(el, ".hq-side .hq-nav__item", "Standard template"));
    expect(el.textContent).toContain("The standard template");
    await click(byText(el, ".hq-side .hq-nav__item", "Waiting for review"));
    // The queue AJ asked for (Sep 28 2026), over a database with nothing offered.
    expect(el.textContent).toContain("Offered to every studio");
    expect(el.textContent).toContain("Nothing waiting");
    await click(byText(el, ".hq-side .hq-nav__item", "Limbo"));
    expect(el.textContent).toContain("Limbo");
    await click(byText(el, ".hq-side .hq-nav__item", "Mindbody sync"));
    expect(el.textContent).toContain("Every studio's pull from Mindbody, worst first.");
    // No lease written yet, and no old fields: linked, and hasn't pulled.
    expect(texts(el, ".hq-page .hq-status")).toEqual(["Hasn't pulled yet", "Hasn't pulled yet"]);
    await click(byText(el, ".hq-side .hq-nav__item", "Bug reports"));
    expect(el.textContent).toContain("What people told us");
    await click(byText(el, ".hq-side .hq-nav__item", "Data"));
    expect(el.textContent).toContain("An administrator exports any studio's data");
    await click(byText(el, ".hq-side .hq-nav__item", "System tools"));
    expect(el.textContent).toContain("Rebuild trainer rollups");
    // Gone on Sep 28 2026 (AJ): a machine is marked as a standard machine on
    // its own page in the catalog editor, and nothing writes the generated
    // file into the catalog any more.
    expect(el.textContent).not.toContain("Restore standard machines");
    const on = el.querySelector(".hq-side .hq-nav__item--on");
    expect(on?.textContent).toBe("System tools");
    expect(on?.getAttribute("aria-current")).toBe("page");
  });

  it("gives portrait a bar of places, with the place's pages as chips", async () => {
    const el = await mount(admin, true);
    expect(texts(el, ".hq-bar .hq-place")).toEqual(["Home", "Studios", "Standard", "Machinery"]);
    // Home is one page: no chips.
    expect(el.querySelector(".hq-bar .hq-chips")).toBeNull();
    await click(byText(el, ".hq-bar .hq-place", "Studios"));
    expect(texts(el, ".hq-bar .hq-chip")).toEqual(["All studios", "Franchises"]);
    await click(byText(el, ".hq-bar .hq-place", "Machinery"));
    expect(texts(el, ".hq-bar .hq-chip")).toEqual(["Limbo", "Mindbody sync", "Bug reports", "Data", "System tools"]);
    expect(el.querySelector(".hq-bar .hq-place--on")?.textContent).toBe("Machinery");
    await click(byText(el, ".hq-bar .hq-chip", "Bug reports"));
    expect(el.querySelector(".hq-bar .hq-chip--on")?.textContent).toBe("Bug reports");
    expect(el.textContent).toContain("What people told us");
    await click(byText(el, ".hq-bar .hq-place", "Standard"));
    expect(texts(el, ".hq-bar .hq-chip")).toEqual(["Machines", "Standard template", "Waiting for review"]);
    expect(el.textContent).toContain("Machine catalog");
  });

  it("searches studios, machines and people, and a pick opens the studio's page", async () => {
    const el = await mount(admin, true);
    await click(el.querySelector(".hq-side .hq-find"));
    expect(el.querySelector(".hq-search")).toBeTruthy();
    // The page is kept, hidden, while the search is open.
    expect(el.querySelector<HTMLElement>(".hq-page")!.hidden).toBe(true);
    expect(el.textContent).toContain("Type a studio");
    await type(el, "leg");
    expect(texts(el, ".hq-result__title")).toEqual(["Leg Press"]);
    await type(el, "mordor");
    expect(el.textContent).toContain("Nothing matches “mordor”.");
    await type(el, "imrahil");
    expect(texts(el, ".hq-result__title")).toEqual(["Imrahil"]);
    expect(texts(el, ".hq-result__detail")).toEqual(["Head Trainer · Westlake"]);
    await type(el, "westl");
    await click(byText(el, ".hq-result", "WestlakeStudio · Independent · Mindbody site 29068, location 3"));
    expect(el.querySelector(".hq-search")).toBeNull();
    expect(el.querySelector<HTMLElement>(".hq-page")!.hidden).toBe(false);
    const input = el.querySelector<HTMLInputElement>("#studio-name");
    expect(input?.value).toBe("Westlake");
    expect(el.querySelector(".hq-tab--on")?.textContent).toBe("Setup");
    // The studio's page lights All studios.
    expect(el.querySelector(".hq-side .hq-nav__item--on")?.textContent).toBe("All studios");
  });

  it("opens a person the search found on their studio's Team", async () => {
    const el = await mount(admin, true);
    await click(el.querySelector(".hq-side .hq-find"));
    await type(el, "imrahil");
    await click(el.querySelector(".hq-result"));
    expect(el.querySelector(".hq-tab--on")?.textContent).toBe("Team");
    expect(el.textContent).toContain("Who works here");
    expect(texts(el, ".hq-row__name")).toContain("ImrahilHead Trainer");
  });

  it("opens a studio from All studios, says its sync on its Mindbody tab, and comes back", async () => {
    const el = await mount(admin, true);
    await click(byText(el, ".hq-side .hq-nav__item", "All studios"));
    expect(el.querySelector('.hq-row__open[aria-label="Open Solon"]')?.textContent).toContain("Hasn't pulled yet");
    await click(el.querySelector('.hq-row__open[aria-label="Open Solon"]'));
    expect(el.querySelector<HTMLInputElement>("#studio-name")?.value).toBe("Solon");
    await click(byText(el, ".hq-tab", "Mindbody"));
    expect(el.textContent).toContain("A pull starts when an iPad at the studio has Journey open during its hours.");
    await click(byText(el.querySelector<HTMLElement>(".hq-page")!, "button", "Every studio's sync"));
    expect(el.querySelector(".hq-side .hq-nav__item--on")?.textContent).toBe("Mindbody sync");
    await click(el.querySelector('.hq-row__open[aria-label="Open Solon\'s Mindbody"]'));
    expect(el.querySelector(".hq-tab--on")?.textContent).toBe("Mindbody");
    await click(byText(el.querySelector<HTMLElement>(".hq-page")!, "button", "All studios"));
    expect(el.textContent).toContain("grouped by what Journey knows today");
  });

  it("lands on the page when the sidebar is used while the search is open", async () => {
    const el = await mount(admin, true);
    await click(el.querySelector(".hq-side .hq-find"));
    await type(el, "sol");
    await click(byText(el, ".hq-side .hq-nav__item", "Franchises"));
    expect(el.querySelector(".hq-search")).toBeNull();
    expect(el.querySelector<HTMLElement>(".hq-page")!.hidden).toBe(false);
    expect(el.textContent).toContain("A franchise groups studios under one owner");
  });

  it("opens a machine the search found in the catalog's own editor", async () => {
    const el = await mount(admin, true);
    await click(el.querySelector(".hq-side .hq-find"));
    await type(el, "leg press");
    await click(el.querySelector(".hq-result"));
    expect(el.querySelector(".adm-me")).not.toBeNull();
    expect(el.querySelector(".hq-side .hq-nav__item--on")?.textContent).toBe("Machines");
  });

  it("opens the search with Ctrl K, and closes it with Escape, keeping the page", async () => {
    const el = await mount(admin, true);
    await click(byText(el, ".hq-side .hq-nav__item", "Standard template"));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    });
    await settle();
    const input = el.querySelector<HTMLInputElement>(".hq-search__input")!;
    expect(input).toBeTruthy();
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(el.querySelector(".hq-search")).toBeNull();
    expect(el.textContent).toContain("The standard template");
  });

  it("refuses anyone who is not an administrator", async () => {
    const el = await mount(lead, false);
    expect(el.textContent).toContain("The Admins dashboard is for administrators and the founder.");
    expect(texts(el, ".hq-nav__item")).toEqual([]);
    expect(el.querySelector(".hq-find")).toBeNull();
  });
});
