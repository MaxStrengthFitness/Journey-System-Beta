// @vitest-environment jsdom
/**
 * THE STUDIOS ROOM MOUNTS — All studios grouped by what Journey knows, a
 * studio's page with its four tabs, the tabs asking before a half-typed
 * form is lost, and the danger zone deleting only once the name is typed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const writes: Array<{ op: string; path: string; data?: unknown }> = [];

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "adm" } }, functions: {} }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));
vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "westlake",
    activeStudio: { id: "westlake", name: "Westlake", timezone: "America/New_York" },
    availableStudios: [],
    setActiveStudioId: () => {},
    isChangingStudio: false,
  }),
}));
vi.mock("../../../lib/authed-fetch", () => ({ authedFetch: async () => ({ ok: true, json: async () => ({ locations: [] }) }) }));
vi.mock("../../../lib/studio-client-count", () => ({
  getStudioClientCounts: async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, id === "strongsville" ? null : 312])),
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
    updateDoc: async (r: { path: string }, data: unknown) => void writes.push({ op: "update", path: r.path, data }),
    setDoc: async (r: { path: string }, data: unknown) => void writes.push({ op: "set", path: r.path, data }),
    addDoc: async (r: { path: string }, data: unknown) => {
      writes.push({ op: "add", path: r.path, data });
      return { id: "new-studio" };
    },
    deleteDoc: async (r: { path: string }) => void writes.push({ op: "delete", path: r.path }),
    deleteField: () => "<delete>",
    writeBatch: () => {
      const staged: Array<{ op: string; path: string; data?: unknown }> = [];
      return {
        set: (r: { path: string }, data: unknown) => staged.push({ op: "batch-set", path: r.path, data }),
        update: (r: { path: string }, data: unknown) => staged.push({ op: "batch-update", path: r.path, data }),
        delete: (r: { path: string }) => staged.push({ op: "batch-delete", path: r.path }),
        commit: async () => void writes.push(...staged),
      };
    },
    serverTimestamp: () => "now",
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
  };
});

import { UnsavedChangesProvider } from "../../unsaved-changes";
import { StudiosRoom } from "./StudiosRoom";
import { StudioPage } from "./StudioPage";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";

const tz = "America/New_York";
const studios = [
  { id: "westlake", name: "Westlake", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "3", locationType: "corporate", journeyCutoverDate: "2026-09-14", networkId: "msf" },
  { id: "strongsville", name: "Strongsville", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "5", locationType: "corporate" },
  { id: "willoughby", name: "Willoughby", timezone: tz, mindbodySiteId: "29068", locationType: "corporate" },
  { id: "avon", name: "Avon", timezone: tz, mindbodyMode: "offline" },
] as unknown as Studio[];
const networks = [{ id: "msf", name: "MSF corporate studios", studioIds: ["westlake"] }] as unknown as FranchiseNetwork[];
const admin = { id: "adm", fullName: "Ada Admin", initials: "AA", role: "Admin", primaryHomeStudioId: "westlake", accessibleStudioIds: [], activeGuestStudioIds: [] } as unknown as Trainer;
const trainers = [
  admin,
  { id: "glo", fullName: "Glorfindel", initials: "GL", role: "StudioLeader", primaryHomeStudioId: "westlake", accessibleStudioIds: [], activeGuestStudioIds: [], mindbodyStaffId: "100" },
  { id: "ber", fullName: "Beregond", initials: "BE", role: "LifeTransformer", primaryHomeStudioId: "solon", accessibleStudioIds: ["westlake"], activeGuestStudioIds: [] },
  { id: "cir", fullName: "Círdan", initials: "CI", role: "Owner", primaryHomeStudioId: "solon", accessibleStudioIds: [], activeGuestStudioIds: [], ownedStudioIds: ["westlake"] },
] as unknown as Trainer[];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  writes.length = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const settle = async (ms = 20) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

async function mount(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<StrictMode>{node}</StrictMode>);
  });
  await settle();
  return host;
}

async function click(el: Element | null | undefined) {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

async function typeInto(input: HTMLInputElement | null, text: string) {
  expect(input, "input").toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, text);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const texts = (el: ParentNode, selector: string) => [...el.querySelectorAll<HTMLElement>(selector)].map((b) => (b.textContent ?? "").trim());
const button = (el: ParentNode, text: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === text);

describe("All studios", () => {
  it("groups every studio by its Mindbody link and cutover, each row one sentence", async () => {
    const opened: string[] = [];
    const el = await mount(<StudiosRoom authTrainer={admin} studios={studios} networks={networks} isAdmin onOpenStudio={(id) => opened.push(id)} />);
    expect(texts(el, ".hq-grouphead__title")).toEqual(["Mindbody not set up", "Runs offline", "No cutover date yet", "On Journey"]);
    expect(el.textContent).toContain("4 studios, grouped by what Journey knows today");
    const westlake = el.querySelector('.hq-row__open[aria-label="Open Westlake"]')!;
    expect(westlake.textContent).toContain("MSF corporate studios");
    expect(westlake.textContent).toContain("Mindbody site 29068, location 3");
    expect(westlake.textContent).toContain("On Journey since Mon, Sep 14, 2026");
    expect(westlake.textContent).toContain("312 active clients");
    // A count that couldn't be had is unknown, never zero.
    expect(el.querySelector('.hq-row__open[aria-label="Open Strongsville"]')!.textContent).toContain("Active clients unknown");
    expect(el.querySelector('.hq-row__open[aria-label="Open Willoughby"]')!.textContent).toContain("but names no location");
    await click(westlake);
    expect(opened).toEqual(["westlake"]);
  });

  it("opens the add form on request, and says so on its button", async () => {
    const el = await mount(<StudiosRoom authTrainer={admin} studios={studios} networks={networks} isAdmin onOpenStudio={() => {}} />);
    expect(el.querySelector("#new-studio-name")).toBeNull();
    await click(button(el, "Add a studio"));
    expect(el.querySelector("#new-studio-name")).not.toBeNull();
    expect(button(el, "Close the form")).toBeTruthy();
  });
});

describe("a studio's page", () => {
  const page = (overrides: Partial<Parameters<typeof StudioPage>[0]> = {}) => (
    <StudioPage
      studio={studios[0]}
      studios={studios}
      networks={networks}
      trainers={trainers}
      clients={[]}
      authTrainer={admin}
      isAdmin
      onBack={() => {}}
      onDeleted={() => {}}
      {...overrides}
    />
  );

  it("has four tabs: Setup with where it stands and the details, then Mindbody, Floor and Team", async () => {
    const el = await mount(page());
    expect(texts(el, ".hq-tab")).toEqual(["Setup", "Mindbody", "Floor", "Team"]);
    expect(el.querySelector(".hq-tab--on")?.getAttribute("aria-selected")).toBe("true");
    expect(el.textContent).toContain("Where it stands");
    expect(el.querySelector<HTMLInputElement>("#studio-name")?.value).toBe("Westlake");
    expect(el.textContent).toContain("Danger zone");
    await click(button(el, "Mindbody"));
    expect(el.textContent).toContain("Pulling the schedule now, the sync's settings and the event log are on Operations → Mindbody");
    await click(button(el, "Team"));
    expect(texts(el, ".hq-row__name")).toEqual(["Ada AdminSystem Administrator", "BeregondLife Transformer", "GlorfindelStudio Leader"]);
    expect(el.textContent).toContain("Owned by Círdan (Franchise Owner)");
    expect(el.textContent).toContain("Also works here");
    expect(el.textContent).toContain("Linked to Mindbody staff");
    await click(button(el, "Floor"));
    expect(el.querySelector(".hq-tab--on")?.textContent).toBe("Floor");
  });

  it("asks before a tab change loses a half-typed detail", async () => {
    const el = await mount(<UnsavedChangesProvider>{page()}</UnsavedChangesProvider>);
    await typeInto(el.querySelector<HTMLInputElement>("#studio-name"), "Westlake North");
    await click(button(el, "Team"));
    const question = document.querySelector('[role="alertdialog"]');
    expect(question?.textContent).toContain("unsaved changes to Westlake's details");
    await click(document.querySelector('[data-action="keep-editing"]'));
    expect(el.querySelector(".hq-tab--on")?.textContent).toBe("Setup");
    expect(el.querySelector<HTMLInputElement>("#studio-name")?.value).toBe("Westlake North");
  });

  it("deletes only once the studio's name is typed, out of its franchise first", async () => {
    const deleted = vi.fn();
    const el = await mount(page({ onDeleted: deleted }));
    await click(button(el, "Delete Westlake…"));
    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"][aria-label="Delete Westlake?"]')!;
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("are not deleted");
    const confirm = button(dialog, "Delete Westlake")!;
    expect(confirm.disabled).toBe(true);
    await typeInto(dialog.querySelector<HTMLInputElement>("#delete-studio-name"), "Westlak");
    expect(confirm.disabled).toBe(true);
    await click(confirm);
    expect(writes).toEqual([]);
    await typeInto(dialog.querySelector<HTMLInputElement>("#delete-studio-name"), " westlake ");
    expect(confirm.disabled).toBe(false);
    await click(confirm);
    expect(writes).toEqual([
      { op: "batch-update", path: "networks/msf", data: { studioIds: [] } },
      { op: "delete", path: "studios/westlake" },
    ]);
    expect(deleted).toHaveBeenCalledTimes(1);
  });

  it("keeps a studio when the question is answered Keep it", async () => {
    const el = await mount(page());
    await click(button(el, "Delete Westlake…"));
    await click(button(document, "Keep it"));
    expect(document.querySelector('[aria-label="Delete Westlake?"]')).toBeNull();
    expect(writes).toEqual([]);
  });
});
