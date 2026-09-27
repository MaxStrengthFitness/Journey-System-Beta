// @vitest-environment jsdom
/**
 * THE FLOOR LIST MOUNTS WITH MACHINES ON IT — My Studio → Machines,
 * Operations → Floor and the Admins dashboard all draw this list.
 *
 * Voice review follow-up, Sep 27 2026. The list was rebuilt from stock cards,
 * badges and 28-32px buttons into the Operations kit's rows, badges and 40px
 * buttons, and the only tests that mounted it (planner.render.test.tsx) did
 * so over an empty catalog and an empty roster, so no row, badge, busy
 * button or reorder row ever ran under a test. This one mounts a small
 * floor: a catalog machine in service, one the studio does not have, the
 * studio's own machine, and one out of service that is never taken to
 * failure. Tests load no stylesheets, so "40px" is held here as the kit's
 * class (.adm-btn is 40px in admin.css) and the grip's h-10 w-10.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "leader" } },
}));

type Write = { kind: string; path: string; data?: Record<string, unknown> };
const writes: Write[] = [];
/** When set, the next roster write waits for the test to let it through. */
const gate = vi.hoisted(() => ({ hold: null as null | Promise<void> }));

vi.mock("firebase/firestore", () => ({
  doc: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  serverTimestamp: () => "now",
  deleteField: () => "__delete__",
  setDoc: async (t: { path: string }, data: Record<string, unknown>) => {
    if (gate.hold) await gate.hold;
    writes.push({ kind: "set", path: t.path, data });
  },
  deleteDoc: async (t: { path: string }) => {
    if (gate.hold) await gate.hold;
    writes.push({ kind: "delete", path: t.path });
  },
  writeBatch: () => {
    const staged: Write[] = [];
    return {
      set: (t: { path: string }, data: Record<string, unknown>) => staged.push({ kind: "batch", path: t.path, data }),
      commit: async () => {
        writes.push(...staged);
      },
    };
  },
}));

const toasts: string[] = [];
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({
    success: (m: string) => toasts.push(m),
    error: (m: string) => toasts.push(m),
    info: () => {},
  }),
}));

vi.mock("../equipment/seed", () => ({
  seedStandardSet: async () => ({ added: 0, alreadyPresent: 0 }),
}));

vi.mock("./StudioMachineEditor", () => ({
  StudioMachineEditor: ({ entry }: { entry?: { machineId: string } }) => (
    <div data-testid="editor">Editing {entry?.machineId ?? "a new machine"}</div>
  ),
}));

const { MACHINE_DEFINITIONS } = await import("../../../data/machine-definitions");
import type { ResolvedMachine, StudioMachineRosterEntry } from "../../../types/machines";

const LONG_NAME = "Westlake's Nautilus Nitro Plus Seated Leg Press With The Long Footplate";

function resolved(id: string, extra: Partial<ResolvedMachine>): ResolvedMachine {
  const def = (MACHINE_DEFINITIONS as Record<string, object>)[id] ?? MACHINE_DEFINITIONS["m-leg-press"];
  return {
    ...(def as ResolvedMachine),
    machineId: id,
    studioId: "solon",
    source: "catalog",
    rosterStatus: "active",
    order: 0,
    comparisonKey: id,
    overriddenFields: [],
    ...extra,
  };
}

const MACHINES: ResolvedMachine[] = [
  resolved("m-leg-press", { name: "Leg Press", order: 1, overriddenFields: ["name"] as ResolvedMachine["overriddenFields"] }),
  resolved("m-lumbar", {
    name: "Lumbar Extension",
    order: 2,
    rosterStatus: "maintenance",
    execution: { ...(MACHINE_DEFINITIONS["m-lumbar"] as unknown as ResolvedMachine).execution, neverToFailure: true },
  }),
  resolved("c-sled", { name: LONG_NAME, order: 3, source: "custom" }),
  resolved("m-chest-press", { name: "Chest Press", order: 4, rosterStatus: "inactive" }),
];

const ROSTER: StudioMachineRosterEntry[] = [
  { machineId: "m-leg-press", studioId: "solon", source: "catalog", basedOn: "m-leg-press", status: "active" },
  { machineId: "m-lumbar", studioId: "solon", source: "catalog", basedOn: "m-lumbar", status: "maintenance" },
  { machineId: "c-sled", studioId: "solon", source: "custom", status: "active" } as StudioMachineRosterEntry,
];

vi.mock("../../../hooks/useStudioMachines", () => ({
  useStudioMachines: () => ({
    machines: MACHINES,
    byId: Object.fromEntries(MACHINES.map((m) => [m.machineId, m])),
    catalog: [],
    rosterEntries: ROSTER,
    loading: false,
    source: "roster",
  }),
}));

const { StudioInventoryManager } = await import("./StudioInventoryManager");

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(props: Partial<Parameters<typeof StudioInventoryManager>[0]> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <StudioInventoryManager studioId="solon" studioName="Solon" hideHeading {...props} />
      </StrictMode>,
    );
  });
  return host!;
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

const buttons = (el: ParentNode) => [...el.querySelectorAll("button")];
const byText = (el: ParentNode, text: string | RegExp) =>
  buttons(el).find((b) => (typeof text === "string" ? b.textContent?.trim() === text : text.test(b.textContent ?? "")));
const rowOf = (el: HTMLElement, name: string) =>
  [...el.querySelectorAll(".adm-rows > div")].find((r) => r.querySelector(".adm-row__name")?.textContent === name) as
    | HTMLElement
    | undefined;
const badges = (row: Element) => [...row.querySelectorAll(".adm-badge")].map((b) => [b.textContent?.trim(), b.className]);

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
  writes.length = 0;
  toasts.length = 0;
  gate.hold = null;
});

describe("the floor list, with machines on it", () => {
  it("draws every machine as a kit row with its whole name, never cut short", async () => {
    const el = await mount();
    const names = [...el.querySelectorAll(".adm-rows .adm-row__name")].map((n) => n.textContent);
    expect(names).toEqual(["Leg Press", "Lumbar Extension", LONG_NAME, "Chest Press"]);
    expect(el.querySelector(".truncate, [class*='line-clamp']")).toBeNull();
    expect(el.textContent).toContain("3 machines in service");
  });

  it("marks each machine with the kit's badges: ours, overrides, out of service, never to failure", async () => {
    const el = await mount();
    expect(badges(rowOf(el, LONG_NAME)!)).toEqual([["Ours", "adm-badge adm-badge--neutral"]]);
    expect(badges(rowOf(el, "Leg Press")!)).toEqual([["1 override", "adm-badge adm-badge--neutral"]]);
    expect(badges(rowOf(el, "Lumbar Extension")!)).toEqual([
      ["Maintenance", "adm-badge adm-badge--warn"],
      ["Never to failure", "adm-badge adm-badge--alert"],
    ]);
    // Out of service is the switch's state, and only on a machine the studio has.
    expect(rowOf(el, "Lumbar Extension")!.querySelector("[role='switch']")?.getAttribute("aria-checked")).toBe("true");
    expect(rowOf(el, "Leg Press")!.querySelector("[role='switch']")?.getAttribute("aria-checked")).toBe("false");
    expect(rowOf(el, "Chest Press")!.querySelector("[role='switch']")).toBeNull();
  });

  it("gives every row's action the kit's 40px button, and the switch a 40px label", async () => {
    const el = await mount({ onOpenMachine: () => {} });
    const list = el.querySelector(".adm-rows")!;
    const actions = buttons(list).filter((b) => b.getAttribute("role") !== "switch");
    expect(actions.length).toBeGreaterThan(0);
    for (const b of actions) expect(b.className, b.textContent ?? "").toMatch(/\badm-btn\b/);
    for (const label of list.querySelectorAll("label")) expect(label.className).toMatch(/\bmin-h-10\b/);
    // The header's buttons are the kit's too.
    for (const label of ["Reorder", "Add standard set", "Custom machine"]) {
      expect(byText(el, label)?.className, label).toMatch(/\badm-btn\b/);
    }
    // A machine the studio has: Open, its set-up, and We don't have this.
    expect(buttons(rowOf(el, "Leg Press")!).map((b) => b.textContent?.trim()).filter(Boolean)).toEqual([
      "Open",
      "Set up for us",
      "We don't have this",
    ]);
    expect(byText(rowOf(el, LONG_NAME)!, "Edit")).toBeDefined();
    // One the studio does not have: dimmed, and We have this.
    expect(rowOf(el, "Chest Press")!.className).toMatch(/opacity-60/);
    expect(byText(rowOf(el, "Chest Press")!, "We have this")).toBeDefined();
  });

  it("holds a row's button busy while its write is on the way, then lets it go", async () => {
    let release!: () => void;
    gate.hold = new Promise<void>((r) => (release = r));
    const el = await mount();
    const leave = byText(rowOf(el, "Leg Press")!, "We don't have this")!;
    await act(async () => leave.click());
    const busy = buttons(rowOf(el, "Leg Press")!).find((b) => b.className.includes("adm-btn--ghost"))!;
    expect(busy.disabled).toBe(true);
    expect(busy.textContent?.trim()).toBe("");
    await act(async () => {
      release();
      await gate.hold;
    });
    await settle();
    expect(writes).toEqual([
      {
        kind: "set",
        path: "studios/solon/roster/m-leg-press",
        data: expect.objectContaining({ status: "inactive", source: "catalog", basedOn: "m-leg-press" }),
      },
    ]);
    expect(byText(rowOf(el, "Leg Press")!, "We don't have this")!.disabled).toBe(false);
  });

  it("removes the studio's own machine rather than switching it off", async () => {
    const el = await mount();
    await act(async () => byText(rowOf(el, LONG_NAME)!, "We don't have this")!.click());
    await settle();
    expect(writes).toEqual([{ kind: "delete", path: "studios/solon/roster/c-sled" }]);
  });

  it("opens the editor in place of the list", async () => {
    const el = await mount();
    await act(async () => byText(rowOf(el, "Leg Press")!, "Set up for us")!.click());
    expect(el.querySelector("[data-testid='editor']")?.textContent).toBe("Editing m-leg-press");
    expect(el.querySelector(".adm-rows")).toBeNull();
  });

  it("says so when a search matches nothing, rather than showing an empty page", async () => {
    const el = await mount();
    const input = el.querySelector("input")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "zzz");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(el.querySelector(".adm-rows")).toBeNull();
    expect(el.textContent).toContain("No machine here matches");
    expect(el.textContent).toContain("zzz");
  });

  it("shows a trainer the floor as it is: no picker, no writes, only Open", async () => {
    const el = await mount({ readOnly: true, onOpenMachine: () => {} });
    expect(rowOf(el, "Chest Press")).toBeUndefined();
    const labels = buttons(el.querySelector(".adm-rows")!).map((b) => b.textContent?.trim());
    expect(labels).toEqual(["Open", "Open", "Open"]);
    expect(byText(el, "Reorder")).toBeUndefined();
    expect(el.querySelector("[role='switch']")).toBeNull();
  });
});

describe("reorder mode", () => {
  it("lists the machines in service as numbered rows with a 40px grip each, and saves the order in one batch", async () => {
    const el = await mount();
    await act(async () => byText(el, /Reorder/)!.click());

    // Search is hidden and the list is the floor in order: in service only.
    expect(el.querySelector("input")).toBeNull();
    expect(el.querySelector(".adm-rows")).toBeNull();
    const grips = buttons(el).filter((b) => /^Reorder /.test(b.getAttribute("aria-label") ?? ""));
    expect(grips.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Reorder Leg Press",
      "Reorder Lumbar Extension",
      `Reorder ${LONG_NAME}`,
    ]);
    for (const g of grips) expect(g.className).toMatch(/\bh-10\b.*\bw-10\b/);
    const rows = grips.map((g) => g.parentElement!);
    expect(rows.map((r) => r.querySelector(".adm-row__name")?.textContent)).toEqual([
      "Leg Press",
      "Lumbar Extension",
      LONG_NAME,
    ]);
    expect(rows.map((r) => r.firstElementChild?.textContent)).toEqual(["1", "2", "3"]);

    for (const label of ["MSF standard", "Cancel", "Save order"]) {
      expect(byText(el, label)?.className, label).toMatch(/\badm-btn\b/);
    }
    expect(byText(el, "Save order")!.className).toMatch(/adm-btn--primary/);

    await act(async () => byText(el, "Save order")!.click());
    await settle();
    expect(writes.map((w) => [w.kind, w.path, w.data?.order])).toEqual([
      ["batch", "studios/solon/roster/m-leg-press", 1],
      ["batch", "studios/solon/roster/m-lumbar", 2],
      ["batch", "studios/solon/roster/c-sled", 3],
    ]);
    expect(toasts).toEqual(["Order saved. Every trainer at Solon sees this sequence."]);
    // Back to the list.
    expect(el.querySelector(".adm-rows")).not.toBeNull();
  });

  it("leaves without writing on Cancel", async () => {
    const el = await mount();
    await act(async () => byText(el, /Reorder/)!.click());
    await act(async () => byText(el, "Cancel")!.click());
    expect(writes).toEqual([]);
    expect(el.querySelector(".adm-rows")).not.toBeNull();
  });
});
