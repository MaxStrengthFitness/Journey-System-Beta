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
  updateDoc: async (t: { path: string }, data: Record<string, unknown>) => {
    if (gate.hold) await gate.hold;
    writes.push({ kind: "update", path: t.path, data });
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
  // Out of service with the reason a leader gave (wave 2, Sep 28 2026).
  {
    machineId: "m-lumbar",
    studioId: "solon",
    source: "catalog",
    basedOn: "m-lumbar",
    status: "maintenance",
    outOfService: {
      reason: "A new cable is on order",
      by: { uid: "uid-glorfindel", name: "Glorfindel of the Golden Flower" },
      at: Date.UTC(2026, 8, 27, 12, 52),
    },
  } as StudioMachineRosterEntry,
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
      ["Out of service", "adm-badge adm-badge--warn"],
      ["Never to failure", "adm-badge adm-badge--alert"],
    ]);
    // Out of service is a button on a machine the studio has: "Back in service"
    // on one that is out, "Out of service" on one that isn't, none on the rest.
    expect(byText(rowOf(el, "Lumbar Extension")!, "Back in service")).toBeDefined();
    expect(byText(rowOf(el, "Leg Press")!, "Out of service")).toBeDefined();
    expect(byText(rowOf(el, "Chest Press")!, "Out of service")).toBeUndefined();
    expect(el.querySelector("[role='switch']")).toBeNull();
  });

  it("says why a machine is out of service, and who said so, under its name", async () => {
    const el = await mount();
    const line = rowOf(el, "Lumbar Extension")!.querySelector("[data-testid='out-of-service-reason']");
    expect(line?.textContent).toMatch(/^Out of service: A new cable is on order · Glorfindel, Sep 27, \d{1,2}:52 [AP]M$/);
    expect(rowOf(el, "Leg Press")!.querySelector("[data-testid='out-of-service-reason']")).toBeNull();
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
    // A machine the studio has: Open, its set-up, Out of service and We don't have this.
    expect(buttons(rowOf(el, "Leg Press")!).map((b) => b.textContent?.trim()).filter(Boolean)).toEqual([
      "Open",
      "Set up for us",
      "Out of service",
      "We don't have this",
    ]);
    expect(byText(rowOf(el, LONG_NAME)!, "Edit")).toBeDefined();
    // One the studio does not have: dimmed, and We have this.
    expect(rowOf(el, "Chest Press")!.className).toMatch(/opacity-60/);
    expect(byText(rowOf(el, "Chest Press")!, "We have this")).toBeDefined();
  });

  it("stacks a row by the list's width, not the screen's, so the door beside it never squeezes a name to nothing", async () => {
    // Tests load no stylesheets: held as the classes. The list is a size
    // container, and a row goes side by side only when the LIST is 42rem
    // wide (@2xl), never on the viewport's sm: breakpoint.
    const el = await mount({ onOpenMachine: () => {} });
    expect(el.querySelector(".adm-rows")!.className).toMatch(/(^|\s)@container(\s|$)/);
    for (const row of el.querySelectorAll(".adm-rows > div")) {
      expect(row.className).toMatch(/@2xl:flex-row/);
      expect(row.className.split(/ +/)).not.toContain("sm:flex-row");
    }
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

describe("out of service, and why (wave 2, Sep 28 2026)", () => {
  const dialog = () => document.body.querySelector("[role='dialog']") as HTMLElement | null;
  const typeReason = async (value: string) => {
    const box = dialog()!.querySelector("textarea")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(box, value);
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("asks why before a machine goes out of service, and writes the status with a reason signed by the person at the iPad", async () => {
    const el = await mount({ authorName: "Beregond of the Guard" });
    await act(async () => byText(rowOf(el, "Leg Press")!, "Out of service")!.click());
    expect(dialog()?.getAttribute("aria-label")).toBe("Take Leg Press out of service");
    // Nothing to send until a reason is typed.
    const take = byText(dialog()!, "Take it out of service")!;
    expect(take.disabled).toBe(true);
    await typeReason("  A new   cable is on order ");
    await act(async () => byText(dialog()!, "Take it out of service")!.click());
    await settle();
    expect(writes).toEqual([
      {
        kind: "update",
        path: "studios/solon/roster/m-leg-press",
        data: {
          status: "maintenance",
          outOfService: { reason: "A new cable is on order", by: { uid: "leader", name: "Beregond of the Guard" }, at: "now" },
          updatedAt: "now",
          updatedBy: "leader",
        },
      },
    ]);
    // Never what the machine IS: no source, basedOn or studio on the write.
    expect(Object.keys(writes[0].data!)).not.toContain("source");
    expect(dialog()).toBeNull();
    expect(toasts).toEqual(["Leg Press is out of service. Trainers see why."]);
  });

  it("writes nothing on Cancel", async () => {
    const el = await mount();
    await act(async () => byText(rowOf(el, "Leg Press")!, "Out of service")!.click());
    await typeReason("Pin sticks");
    await act(async () => byText(dialog()!, "Cancel")!.click());
    expect(dialog()).toBeNull();
    expect(writes).toEqual([]);
  });

  it("puts a machine back in service in one tap, and takes the reason off with it", async () => {
    const el = await mount();
    await act(async () => byText(rowOf(el, "Lumbar Extension")!, "Back in service")!.click());
    await settle();
    expect(writes).toEqual([
      {
        kind: "update",
        path: "studios/solon/roster/m-lumbar",
        data: { status: "active", outOfService: "__delete__", updatedAt: "now", updatedBy: "leader" },
      },
    ]);
  });

  it("takes the reason off when a machine leaves the floor, too", async () => {
    const el = await mount();
    await act(async () => byText(rowOf(el, "Lumbar Extension")!, "We don't have this")!.click());
    await settle();
    expect(writes[0].data).toMatchObject({ status: "inactive", outOfService: "__delete__" });
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
