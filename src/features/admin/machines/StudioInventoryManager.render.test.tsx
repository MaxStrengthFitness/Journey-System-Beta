// @vitest-environment jsdom
/**
 * THE FLOOR EDITOR MOUNTS WITH MACHINES ON IT — Learning → Catalog → Edit
 * our floor, My Studio → Machines, Operations → Floor and the Admins
 * dashboard all draw this list.
 *
 * Voice review follow-up, Sep 27 2026. The list was rebuilt from stock cards,
 * badges and 28-32px buttons into the Operations kit's rows, badges and 40px
 * buttons, and the only tests that mounted it (planner.render.test.tsx) did
 * so over an empty catalog and an empty roster, so no row, badge, busy
 * button or reorder row ever ran under a test. This one mounts a small
 * floor: a catalog machine in service, the studio's own machine, one out of
 * service (with the reason a leader gave, wave 2) that is never taken to
 * failure, one the studio switched off, and catalog machines it has never
 * had. Tests load no stylesheets, so "40px" is held here as the kit's class
 * (.adm-btn is 40px in admin.css) and the grip's h-10 w-10.
 *
 * Wave 2 of the Machine Catalog room (Catalog R5, Sep 28 2026): the list is
 * the floor; what could join it is Add from MSF; the walking order moves a
 * machine up or down as well as by drag.
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

const seeded = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../equipment/seed", () => ({
  seedStandardSet: async () => {
    seeded.calls += 1;
    return { added: 1, alreadyPresent: 0 };
  },
}));

vi.mock("./StudioMachineEditor", () => ({
  StudioMachineEditor: ({ entry }: { entry?: { machineId: string } }) => (
    <div data-testid="editor">Editing {entry?.machineId ?? "a new machine"}</div>
  ),
}));

const { MACHINE_DEFINITIONS } = await import("../../../data/machine-definitions");
import type { MachineCatalogEntry, ResolvedMachine, StudioMachineRosterEntry } from "../../../types/machines";

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
  // Switched off at Solon: on the roster, inactive.
  resolved("m-neck", { name: "Cervical Extension", order: 4, rosterStatus: "inactive" }),
  // Never on Solon's roster: one in the MSF standard, one outside it.
  resolved("m-chest-press", { name: "Chest Press", order: 5, rosterStatus: "inactive" }),
  resolved("m-hip-add", { name: "Hip Adduction", order: 6, rosterStatus: "inactive" }),
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
  { machineId: "m-neck", studioId: "solon", source: "catalog", basedOn: "m-neck", status: "inactive" },
];

const catalogEntry = (id: string, name: string, inStandardSet = true): MachineCatalogEntry =>
  ({ id, name, status: "active", inStandardSet, defaultOrder: 10, schemaVersion: 1 }) as MachineCatalogEntry;
const CATALOG: MachineCatalogEntry[] = [
  catalogEntry("m-leg-press", "Leg Press"),
  catalogEntry("m-lumbar", "Lumbar Extension"),
  catalogEntry("m-neck", "Cervical Extension"),
  catalogEntry("m-chest-press", "Chest Press"),
  catalogEntry("m-hip-add", "Hip Adduction", false),
];

const roster = vi.hoisted(() => ({ entries: [] as unknown[] }));
vi.mock("../../../hooks/useStudioMachines", () => ({
  useStudioMachines: () => ({
    machines: MACHINES,
    byId: Object.fromEntries(MACHINES.map((m) => [m.machineId, m])),
    catalog: CATALOG,
    rosterEntries: roster.entries,
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
const byLabel = (el: ParentNode, label: string) => buttons(el).find((b) => b.getAttribute("aria-label") === label);
const rowOf = (el: HTMLElement, name: string) =>
  [...el.querySelectorAll(".adm-rows > div")].find((r) => r.querySelector(".adm-row__name")?.textContent === name) as
    | HTMLElement
    | undefined;
const badges = (row: Element) => [...row.querySelectorAll(".adm-badge")].map((b) => [b.textContent?.trim(), b.className]);
const dialog = () => document.body.querySelector("[role='dialog']") as HTMLElement | null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
  writes.length = 0;
  toasts.length = 0;
  gate.hold = null;
  seeded.calls = 0;
  roster.entries = ROSTER;
});
roster.entries = ROSTER;

describe("the floor editor's list is the floor", () => {
  it("draws the machines on the floor as kit rows with their whole names, never cut short", async () => {
    const el = await mount();
    const names = [...el.querySelectorAll(".adm-rows .adm-row__name")].map((n) => n.textContent);
    // Switched off (the neck machine) and never had (Chest Press, Hip
    // Adduction) are Add from MSF's, not the floor's.
    expect(names).toEqual(["Leg Press", "Lumbar Extension", LONG_NAME]);
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
    // Out of service is a button: "Back in service" on one that is out,
    // "Out of service" on one that isn't.
    expect(byText(rowOf(el, "Lumbar Extension")!, "Back in service")).toBeDefined();
    expect(byText(rowOf(el, "Leg Press")!, "Out of service")).toBeDefined();
    expect(el.querySelector("[role='switch']")).toBeNull();
  });

  it("says why a machine is out of service, and who said so, under its name", async () => {
    const el = await mount();
    const line = rowOf(el, "Lumbar Extension")!.querySelector("[data-testid='out-of-service-reason']");
    expect(line?.textContent).toMatch(/^Out of service: A new cable is on order · Glorfindel, Sep 27, \d{1,2}:52 [AP]M$/);
    expect(rowOf(el, "Leg Press")!.querySelector("[data-testid='out-of-service-reason']")).toBeNull();
  });

  it("gives every row's action the kit's 40px button", async () => {
    const el = await mount({ onOpenMachine: () => {} });
    const list = el.querySelector(".adm-rows")!;
    const actions = buttons(list);
    expect(actions.length).toBeGreaterThan(0);
    for (const b of actions) expect(b.className, b.textContent ?? "").toMatch(/\badm-btn\b/);
    // The toolbar's buttons are the kit's too.
    for (const label of ["Walking order", "Add from MSF", "New machine"]) {
      expect(byText(el, label)?.className, label).toMatch(/\badm-btn\b/);
    }
    // A machine on the floor: Open, its set-up, Out of service and We don't have this.
    expect(buttons(rowOf(el, "Leg Press")!).map((b) => b.textContent?.trim()).filter(Boolean)).toEqual([
      "Open",
      "Set up for us",
      "Out of service",
      "We don't have this",
    ]);
    expect(byText(rowOf(el, LONG_NAME)!, "Edit")).toBeDefined();
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

  it("holds a row's button busy while its write is on the way, and switches the machine off without re-writing what it is", async () => {
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
        kind: "update",
        path: "studios/solon/roster/m-leg-press",
        data: { status: "inactive", outOfService: "__delete__", updatedAt: "now", updatedBy: "leader" },
      },
    ]);
  });

  it("retires the studio's own machine rather than deleting it (AJ, Oct 2 2026), so past sessions keep its name", async () => {
    const el = await mount();
    await act(async () => byText(rowOf(el, LONG_NAME)!, "We don't have this")!.click());
    await settle();
    expect(writes).toEqual([
      {
        kind: "update",
        path: "studios/solon/roster/c-sled",
        data: { status: "inactive", outOfService: "__delete__", updatedAt: "now", updatedBy: "leader" },
      },
    ]);
    expect(writes.some((w) => w.kind === "delete")).toBe(false);
  });

  it("opens the editor in place of the list, and New machine opens it on a new machine", async () => {
    const el = await mount();
    await act(async () => byText(rowOf(el, "Leg Press")!, "Set up for us")!.click());
    expect(el.querySelector("[data-testid='editor']")?.textContent).toBe("Editing m-leg-press");
    expect(el.querySelector(".adm-rows")).toBeNull();
    await act(async () => root!.unmount());
    host!.remove();
    const again = await mount();
    await act(async () => byText(again, "New machine")!.click());
    expect(again.querySelector("[data-testid='editor']")?.textContent).toBe("Editing a new machine");
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

  it("shows a trainer the floor as it is: no toolbar, no writes, only Open", async () => {
    const el = await mount({ readOnly: true, onOpenMachine: () => {} });
    expect(rowOf(el, "Chest Press")).toBeUndefined();
    expect(rowOf(el, "Cervical Extension")).toBeUndefined();
    const labels = buttons(el.querySelector(".adm-rows")!).map((b) => b.textContent?.trim());
    expect(labels).toEqual(["Open", "Open", "Open"]);
    for (const label of ["Walking order", "Add from MSF", "New machine"]) expect(byText(el, label)).toBeUndefined();
  });
});

describe("out of service, and why (wave 2, Sep 28 2026)", () => {
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
    expect(byText(dialog()!, "Take it out of service")!.disabled).toBe(true);
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

describe("Add from MSF (wave 2, Catalog R5)", () => {
  const groupOf = (title: string) => dialog()!.querySelector(`section[aria-label="${title}"]`) as HTMLElement | null;
  const namesIn = (title: string) => [...(groupOf(title)?.querySelectorAll(".adm-row__name") ?? [])].map((n) => n.textContent);

  it("offers the standard's machines first, then the rest of the catalog, then what the studio switched off", async () => {
    const el = await mount();
    await act(async () => byText(el, "Add from MSF")!.click());
    expect(dialog()?.getAttribute("aria-label")).toBe("Add from MSF");
    expect(namesIn("In the MSF standard")).toEqual(["Chest Press"]);
    expect(namesIn("Also in the MSF catalog")).toEqual(["Hip Adduction"]);
    expect(namesIn("Switched off at Solon")).toEqual(["Cervical Extension"]);
    expect(byText(groupOf("Switched off at Solon")!, "Put it back")).toBeDefined();
  });

  it("creates a machine the roster never had, identity and all, at its place in the standard order", async () => {
    const el = await mount();
    await act(async () => byText(el, "Add from MSF")!.click());
    await act(async () => byText(groupOf("In the MSF standard")!, "Add")!.click());
    await settle();
    expect(writes).toEqual([
      {
        kind: "set",
        path: "studios/solon/roster/m-chest-press",
        data: {
          machineId: "m-chest-press",
          studioId: "solon",
          source: "catalog",
          basedOn: "m-chest-press",
          status: "active",
          updatedAt: "now",
          updatedBy: "leader",
        },
      },
    ]);
    expect(toasts).toEqual(["Chest Press is on Solon's floor."]);
  });

  it("puts a switched-off machine back with its status alone, at the end of a walking order the studio keeps", async () => {
    roster.entries = ROSTER.map((e, i) => (e.status === "inactive" ? e : { ...e, order: i + 1 }));
    const el = await mount();
    await act(async () => byText(el, "Add from MSF")!.click());
    await act(async () => byText(groupOf("Switched off at Solon")!, "Put it back")!.click());
    await settle();
    expect(writes).toEqual([
      {
        kind: "update",
        path: "studios/solon/roster/m-neck",
        data: { status: "active", outOfService: "__delete__", order: 4, updatedAt: "now", updatedBy: "leader" },
      },
    ]);
  });

  it("closes without writing", async () => {
    const el = await mount();
    await act(async () => byText(el, "Add from MSF")!.click());
    await act(async () => byText(dialog()!, "Close")!.click());
    expect(dialog()).toBeNull();
    expect(writes).toEqual([]);
  });
});

describe("the walking order", () => {
  it("lists the machines in service as numbered rows, each with up, down and a 40px grip, and saves the order in one batch", async () => {
    const el = await mount();
    await act(async () => byText(el, /Walking order/)!.click());

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
    // Whom it reaches, in words.
    expect(el.textContent).toContain("Saves for everyone at Solon");

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

  it("moves a machine up or down with a tap, the ends staying put", async () => {
    const el = await mount();
    await act(async () => byText(el, /Walking order/)!.click());
    expect(byLabel(el, "Move Leg Press up")!.disabled).toBe(true);
    expect(byLabel(el, `Move ${LONG_NAME} down`)!.disabled).toBe(true);
    await act(async () => byLabel(el, "Move Lumbar Extension up")!.click());
    const order = () =>
      buttons(el)
        .filter((b) => /^Reorder /.test(b.getAttribute("aria-label") ?? ""))
        .map((b) => b.getAttribute("aria-label")!.replace("Reorder ", ""));
    expect(order()).toEqual(["Lumbar Extension", "Leg Press", LONG_NAME]);
    await act(async () => byLabel(el, "Move Leg Press down")!.click());
    expect(order()).toEqual(["Lumbar Extension", LONG_NAME, "Leg Press"]);
    // Nothing is written until Save.
    expect(writes).toEqual([]);
    for (const b of buttons(el).filter((x) => /^Move /.test(x.getAttribute("aria-label") ?? ""))) {
      expect(b.className).toMatch(/\badm-btn\b/);
    }
  });

  it("leaves without writing on Cancel", async () => {
    const el = await mount();
    await act(async () => byText(el, /Walking order/)!.click());
    await act(async () => byText(el, "Cancel")!.click());
    expect(writes).toEqual([]);
    expect(el.querySelector(".adm-rows")).not.toBeNull();
  });
});
