// @vitest-environment jsdom
/**
 * WHERE A PERSON WORKS MOUNTS — a studio's Team on the Admins dashboard: the
 * Studios button on each row, giving someone a second studio, taking them off
 * this studio's team, the home studio refused with what to do instead, and
 * only the lists that changed written, then one Activity line per studio.
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
    onSnapshot: (_t: unknown, a: unknown, b?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const t = setTimeout(() => next(emptySnap), 0);
      return () => clearTimeout(t);
    },
    getDocs: async () => emptySnap,
    getDoc: async () => emptyDoc,
    getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
    updateDoc: async (r: { path: string }, data: unknown) => void writes.push({ op: "update", path: r.path, data }),
    setDoc: async (r: { path: string }, data: unknown) => void writes.push({ op: "set", path: r.path, data }),
    addDoc: async (r: { path: string }, data: unknown) => {
      writes.push({ op: "add", path: r.path, data });
      return { id: "new" };
    },
    deleteDoc: async () => {},
    arrayUnion: (...v: unknown[]) => ({ union: v }),
    arrayRemove: (...v: unknown[]) => ({ remove: v }),
    serverTimestamp: () => "now",
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
  };
});

import { StudioTeam } from "./StudioTeam";
import type { Studio, Trainer } from "../../../types";

const tz = "America/New_York";
const studios = [
  { id: "westlake", name: "Westlake", timezone: tz },
  { id: "solon", name: "Solon", timezone: tz },
  { id: "strongsville", name: "Strongsville", timezone: tz },
  { id: "demo-studio", name: "Demo Studio", timezone: tz, isDemo: true },
] as unknown as Studio[];
const admin = { id: "adm", fullName: "Ada Admin", initials: "AA", role: "Admin", primaryHomeStudioId: "westlake", accessibleStudioIds: [], activeGuestStudioIds: [] } as unknown as Trainer;
const glorfindel = { id: "glo", fullName: "Glorfindel", initials: "GL", role: "StudioLeader", primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"], activeGuestStudioIds: [] } as unknown as Trainer;
const beregond = {
  id: "ber",
  fullName: "Beregond",
  initials: "BE",
  role: "LifeTransformer",
  primaryHomeStudioId: "solon",
  accessibleStudioIds: ["solon", "westlake"],
  activeGuestStudioIds: [],
  managedStudioIds: ["westlake"],
} as unknown as Trainer;
const trainers = [admin, glorfindel, beregond];

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

async function choose(select: HTMLSelectElement | null, value: string) {
  expect(select, "select").toBeTruthy();
  await act(async () => {
    select!.value = value;
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const button = (el: ParentNode, text: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === text);
const dialogFor = (name: string) => document.querySelector<HTMLElement>(`[role="alertdialog"][aria-label="Where ${name} works"]`)!;

const team = (onSaved = vi.fn()) => (
  <StudioTeam studio={studios[0]} studios={studios} trainers={trainers} clients={[]} authTrainer={admin} onRolesChanged={onSaved} />
);

describe("Studios on a studio's Team", () => {
  it("is on every row, yours included, beside Change role", async () => {
    const el = await mount(team());
    expect(el.querySelector('[aria-label="Studios: Ada Admin"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Studios: Beregond"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Change role: Beregond"]')).not.toBeNull();
  });

  it("takes someone off this studio's team: also-works-at and the grant come off, home stays, then the record", async () => {
    const saved = vi.fn();
    const el = await mount(team(saved));
    await click(el.querySelector('[aria-label="Studios: Beregond"]'));
    const dialog = dialogFor("Beregond");
    expect(dialog.textContent).toContain("Home studio: Solon.");
    expect(dialog.textContent).toContain("Westlakealso works there");
    // Demo Mode is never offered; the home studio isn't either.
    const options = [...dialog.querySelectorAll<HTMLOptionElement>("#hq-studio-add option")].map((o) => o.value);
    expect(options).toEqual(["", "strongsville"]);
    expect(button(dialog, "Save studios")!.disabled).toBe(true);

    await click(button(dialog, "Take off Westlake's team"));
    expect(dialog.textContent).toContain("Beregond comes off the team at Westlake, and no longer helps run it.");
    expect(dialog.textContent).toContain("Nothing they did there is deleted");
    await click(button(dialog, "Save studios"));

    expect(writes[0]).toEqual({
      op: "update",
      path: "trainers/ber",
      data: { accessibleStudioIds: { remove: ["westlake"] }, managedStudioIds: { remove: ["westlake"] } },
    });
    expect(writes[1]).toMatchObject({
      op: "add",
      path: "activity",
      data: { studioId: "westlake", kind: "assisted-change", what: "Took Beregond off Westlake's team.", by: { uid: "adm", name: "Ada Admin" } },
    });
    expect(writes).toHaveLength(2);
    expect(saved).toHaveBeenCalled();
    expect(document.querySelector('[aria-label="Where Beregond works"]')).toBeNull();
  });

  it("gives someone a second studio, written as that one studio added", async () => {
    const el = await mount(team());
    await click(el.querySelector('[aria-label="Studios: Glorfindel"]'));
    const dialog = dialogFor("Glorfindel");
    expect(dialog.textContent).toContain("Home studio only.");
    await choose(dialog.querySelector<HTMLSelectElement>("#hq-studio-add"), "solon");
    await click(button(dialog, "Add"));
    expect(dialog.textContent).toContain("Solonto add");
    expect(dialog.textContent).toContain("Glorfindel joins the team at Solon");
    await click(button(dialog, "Save studios"));
    expect(writes[0]).toEqual({ op: "update", path: "trainers/glo", data: { accessibleStudioIds: { union: ["solon"] } } });
    expect(writes[1]).toMatchObject({ path: "activity", data: { studioId: "solon", what: "Added Glorfindel to Solon's team: also works there." } });
  });

  it("never takes the home studio away, and says what to do instead", async () => {
    const el = await mount(team());
    await click(el.querySelector('[aria-label="Studios: Glorfindel"]'));
    const dialog = dialogFor("Glorfindel");
    expect(button(dialog, "Take off Westlake's team")).toBeUndefined();
    expect(dialog.textContent).toContain("Westlake is Glorfindel's home studio, so it can't be taken away here");
    expect(dialog.textContent).toContain("Operations → Setup → People & access");
  });

  it("closes on Cancel without a write", async () => {
    const el = await mount(team());
    await click(el.querySelector('[aria-label="Studios: Beregond"]'));
    const dialog = dialogFor("Beregond");
    await click(dialog.querySelector('[aria-label="Take Beregond off Westlake\'s team"]'));
    await click(button(dialog, "Cancel"));
    expect(document.querySelector('[aria-label="Where Beregond works"]')).toBeNull();
    expect(writes).toEqual([]);
  });
});
