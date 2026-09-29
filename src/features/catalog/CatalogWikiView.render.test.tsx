// @vitest-environment jsdom
/**
 * THE CATALOG, MOUNTED (Machine Catalog round, Sep 28 2026).
 *
 * CatalogWikiView had no mounted test; the round reworks it (Find, the names,
 * the floor in walking order). It is mounted here inside the Learning tab's
 * sections and the unsaved-changes provider, with every Firestore-backed hook
 * stood in for by fixed data, and driven the way a trainer drives it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CatalogMachine } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fx = vi.hoisted(() => ({
  machines: [] as unknown[],
  floor: "ready" as string,
  makers: {} as Record<string, string>,
  settings: {} as Record<string, unknown>,
  care: {} as Record<string, unknown>,
  careLoading: false,
  careError: null as string | null,
  isAdmin: false,
  // The model records (wave 2, Catalog R4), and whether the Catalog asked.
  models: { state: "off" } as unknown,
  modelsAsked: [] as boolean[],
  // Head office's own names, off the catalog documents (wave 2).
  aliases: {} as Record<string, string[]>,
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "solon",
    activeStudio: { id: "solon", name: "Solon" },
    isAdmin: fx.isAdmin,
  }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }),
}));
vi.mock("../../hooks/useStudioMachineSettings", () => ({
  useStudioMachineSettings: () => ({ settingsByMachineId: fx.settings, loading: false }),
}));
vi.mock("./useCatalogMachines", () => ({
  useCatalogMachines: () => ({
    machines: fx.machines,
    source: fx.floor === "ready" ? "roster" : "global",
    loading: fx.floor === "loading",
    floor: fx.floor,
    makers: fx.makers,
    aliases: fx.aliases,
  }),
}));
vi.mock("./useMachineModels", () => ({
  useMachineModels: (enabled: boolean) => {
    fx.modelsAsked.push(enabled);
    return enabled ? fx.models : { state: "off" };
  },
}));
// Relay's care record, read only: the Catalog's one source of flags.
vi.mock("../relay/board/machine-care-store", () => ({
  useMachineCare: () => ({ byMachineId: fx.care, loading: fx.careLoading, error: fx.careError }),
}));
vi.mock("./StudioSetupCard", () => ({ StudioSetupCard: () => null }));
vi.mock("./StudioNotesCard", () => ({ StudioNotesCard: () => null }));
vi.mock("../studio-tasks/usePlaybook", () => ({ usePlaybook: () => ({ entries: [] }) }));
vi.mock("../studio-tasks/MachinePlaybookCard", () => ({ MachinePlaybookCard: () => null }));
vi.mock("../studio-tasks/playbook", () => ({ searchPlaybook: () => [] }));
vi.mock("../wiki/useStudioWiki", () => ({
  useStudioWiki: () => ({ pages: [], loading: false, error: null, overlayFor: () => null }),
}));
vi.mock("../wiki/StudioWikiPanel", () => ({ StudioWikiPanel: () => null }));
vi.mock("../academy/useAcademyContent", () => ({ useAcademyCards: () => null, useAcademyScripts: () => null }));
vi.mock("../comments", () => ({ CommentsPanel: () => null }));
vi.mock("../machine-trends/MachineTrendsPanel", () => ({ MachineTrendsPanel: () => null }));
vi.mock("../machine-db", () => ({
  MachineDatabase: ({
    openMachineId,
    floor,
    grouping,
    groupingControl,
    scopeSwitch,
  }: {
    openMachineId?: string | null;
    floor: unknown[];
    grouping: string;
    groupingControl: unknown;
    scopeSwitch: React.ReactNode;
  }) => (
    <div
      data-screen="msf"
      data-open={openMachineId ?? ""}
      data-floor={floor.length}
      data-grouping={grouping}
      data-control={groupingControl ? "yes" : "no"}
    >
      {scopeSwitch}
    </div>
  ),
  NetworkNotes: () => null,
  ScopeSwitch: () => null,
  ShareToggle: () => null,
  setMachineShared: async () => {},
  setNoteShared: async () => {},
  setTipShared: async () => {},
  sharedKeysFor: () => [],
}));

import { WikiSectionsProvider, type WikiSectionsValue } from "../wiki";
import { UnsavedChangesProvider } from "../unsaved-changes";
import { forgetPersonalMemory } from "../sign-out/memory";
import { resolveMachineAnatomy } from "./anatomy";
import { CatalogWikiView, type CatalogWikiViewProps } from "./CatalogWikiView";

function machine(id: string, name: string, over: Partial<CatalogMachine> = {}): CatalogMachine {
  return {
    id,
    name,
    movementPattern: "",
    anatomicalRegion: "",
    isStudioCustom: false,
    rosterStatus: "active",
    anatomy: resolveMachineAnatomy(id),
    clinicalNote: "",
    kinematicClassification: "",
    executionPosture: "",
    setupGap: "",
    requiresHandoff: false,
    targetMuscles: [],
    synergists: [],
    clinicalWarnings: [],
    contraindicatedFor: [],
    setup: "",
    setupCues: [],
    execution: "",
    executionCues: [],
    studioNotes: "",
    ...over,
  };
}

/** Solon's floor, in the leader's walking order. */
const FLOOR: CatalogMachine[] = [
  machine("m-neck", "CX (4 WAY NECK)", {
    requiresHandoff: true,
    neverToFailure: true,
    dials: [
      { key: "back-pad", label: "Back Pad" },
      { key: "seat", label: "Seat" },
    ],
  }),
  machine("m-leg-press", "LEG PRESS", {
    clinicalWarnings: ["If feet slide or torso shifts up seat back, ensure knees do not fully extend."],
    dials: [
      { key: "gap", label: "Gap" },
      { key: "seat-angle", label: "Seat Angle" },
    ],
  }),
  machine("m-lumbar", "LUMBAR", {
    neverToFailure: true,
    safetyNotice: "Never take Lumbar Extension to failure.",
    rosterStatus: "maintenance",
    dials: [{ key: "gap", label: "Gap" }],
    dialDefaults: { gap: "4" },
  }),
];

const sections: WikiSectionsValue = {
  title: "Learning",
  titleIcon: null,
  sections: [
    { id: "learning", label: "Overview", icon: null },
    { id: "machine-anatomy", label: "Catalog", icon: null },
  ],
  active: "machine-anatomy",
  onSelect: () => {},
  onHome: () => {},
  onSearch: () => {},
  searchLabel: "Search Learning",
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  // The Catalog remembers its scope until sign-out; each test is a new person.
  forgetPersonalMemory();
  fx.machines = FLOOR;
  fx.floor = "ready";
  fx.makers = {};
  fx.settings = {};
  fx.care = {};
  fx.careLoading = false;
  fx.careError = null;
  fx.isAdmin = false;
  fx.models = { state: "off" };
  fx.modelsAsked = [];
  fx.aliases = {};
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function mount(props: Partial<CatalogWikiViewProps> = {}) {
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <WikiSectionsProvider value={sections}>
          <CatalogWikiView machines={[]} authTrainer={null} {...props} />
        </WikiSectionsProvider>
      </UnsavedChangesProvider>,
    );
  });
}

const findField = () => host.querySelector(".mcat-find input") as HTMLInputElement;
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(findField(), value);
    findField().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function enter() {
  await act(async () => {
    findField().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}
const click = (el: Element | null | undefined) =>
  act(async () => {
    if (!el) throw new Error("nothing to click");
    (el as HTMLElement).click();
  });
const rowNames = () => [...host.querySelectorAll(".mcat-row__name")].map((t) => t.textContent);
const lens = (label: string) =>
  [...host.querySelectorAll(".mcat-lens__btn")].find((b) => b.textContent === label);
const rowOf = (name: string) =>
  [...host.querySelectorAll(".mcat-row")].find((r) => r.querySelector(".mcat-row__name")?.textContent === name);

describe("the Catalog opens on the floor", () => {
  it("lists the floor in the leader's walking order, numbered, with Find on top", async () => {
    await mount();
    expect(findField()).not.toBeNull();
    expect(host.querySelector(".wk__index-title")?.textContent).toBe("Solon's floor");
    expect(rowNames()).toEqual(["CX (4 WAY NECK)", "LEG PRESS", "LUMBAR"]);
    expect([...host.querySelectorAll(".mcat-row__walk")].map((w) => w.textContent)).toEqual(["1", "2", "3"]);
  });

  it("says the floor in one sentence, and no cleaning of its own", async () => {
    fx.care = { "m-leg-press": { flag: { note: "Seat pin sticks.", by: { id: "u1", name: "Bergil Guard" }, at: 1 } } };
    await mount();
    expect(host.querySelector(".wk__index-sub")?.textContent).toBe(
      "3 machines in walking order · 1 out of service · 1 flagged",
    );
    expect(host.textContent).not.toMatch(/cleaning|Needs cleaning|Overdue/i);
  });

  it("says the flags couldn't be read, rather than that nothing is flagged", async () => {
    fx.careError = "Couldn't load the floor's care record.";
    await mount();
    expect(host.querySelector(".wk__index-sub")?.textContent).toBe(
      "3 machines in walking order · 1 out of service · flags couldn't be read",
    );
    expect(host.querySelector(".mcat-row .wk__badge--warn")?.textContent).toBe("Out of service");
  });

  it("puts each unit's preset on its row, from the studio's setup first, or says it has none", async () => {
    fx.settings = { "m-leg-press": { settingOptions: ["Gap", "Seat Angle"], standardSettings: { Gap: "3" } } };
    await mount();
    expect(rowOf("LEG PRESS")?.querySelector(".mcat-row__preset")?.textContent).toBe("Gap 3 · 1 not set");
    expect(rowOf("LUMBAR")?.querySelector(".mcat-row__preset")?.textContent).toBe("Gap 4");
    expect(rowOf("CX (4 WAY NECK)")?.querySelector(".mcat-row__preset")?.textContent).toBe(
      "No numbers set for this unit yet",
    );
  });

  it("shows the switches and the status on the row, the Academy name only where the floor's leaves it unsaid", async () => {
    fx.care = { "m-leg-press": { flag: { note: "Seat pin sticks.", by: { id: "u1", name: "Bergil" }, at: 1 } } };
    await mount();
    const neck = rowOf("CX (4 WAY NECK)")!;
    expect(neck.querySelector(".mcat-row__movement")?.textContent).toBe("Cervical Extension");
    expect([...neck.querySelectorAll(".wk__badge")].map((b) => b.textContent)).toEqual(["Never to failure", "Handoff"]);
    const lp = rowOf("LEG PRESS")!;
    expect(lp.querySelector(".mcat-row__movement")).toBeNull();
    expect(lp.querySelector(".wk__badge--warn")?.textContent).toBe("Flagged");
  });

  it("opens a unit's page with Relay's flag and its preset", async () => {
    fx.care = { "m-leg-press": { flag: { note: "Seat pin sticks.", by: { id: "u1", name: "Bergil" }, at: 0 } } };
    await mount();
    await click(rowOf("LEG PRESS"));
    expect(host.querySelector(".wk__h1")?.textContent).toBe("LEG PRESS");
    expect(host.querySelector(".mcat-flag__who")?.textContent).toBe("Flagged by Bergil");
    expect(host.querySelector(".mcat-flag__note")?.textContent).toBe("Seat pin sticks.");
    expect(host.querySelector(".wk__aside")?.textContent).toContain("No numbers set for this unit yet");
  });
});

describe("the model tier on the floor (wave 2, Catalog R4)", () => {
  const HOIST = { id: "hoist-rocit-lp", brand: "Hoist", model: "ROC-IT Leg Press", movementId: "m-leg-press", dials: [], notes: "" };
  const withModel = () =>
    FLOOR.map((m) => (m.id === "m-leg-press" ? { ...m, modelId: "hoist-rocit-lp" } : m));

  it("reads nothing about models while no unit names one", async () => {
    await mount();
    expect(fx.modelsAsked.every((asked) => asked === false)).toBe(true);
    expect(host.querySelector(".mcat-row__model")).toBeNull();
  });

  it("shows a unit's maker and model on its row and its page, and nothing on a unit with none", async () => {
    fx.machines = withModel();
    fx.models = { state: "ready", models: [HOIST], byId: { [HOIST.id]: HOIST } };
    await mount();
    expect(rowOf("LEG PRESS")?.querySelector(".mcat-row__model")?.textContent).toBe("Hoist ROC-IT Leg Press");
    expect(rowOf("LUMBAR")?.querySelector(".mcat-row__model")).toBeNull();
    await click(rowOf("LEG PRESS"));
    expect(host.querySelector(".wk__aside")?.textContent).toContain("Hoist ROC-IT Leg Press");
  });

  it("finds a unit by its model's name, and filters the floor by its maker", async () => {
    fx.machines = withModel();
    fx.models = { state: "ready", models: [HOIST], byId: { [HOIST.id]: HOIST } };
    await mount();
    await type("roc-it");
    const units = [...host.querySelectorAll(".wk__hit")].filter((h) => h.getAttribute("data-kind") === "unit");
    expect(units.map((h) => h.textContent)).toEqual([expect.stringContaining("LEG PRESS")]);
    await type("hoist");
    await enter();
    expect(host.querySelector(".mcat-filter")?.textContent).toContain("Showing Hoist · 1 on Solon's floor");
  });

  it("says nothing about models until the records can be read", async () => {
    fx.machines = withModel();
    fx.models = { state: "unreadable" };
    await mount();
    expect(host.querySelector(".mcat-row__model")).toBeNull();
    expect(host.textContent).not.toMatch(/Hoist|model/i);
  });
});

describe("Find, on the floor", () => {
  it("finds LUMBAR from 'low back' and opens its page on Enter", async () => {
    await mount();
    await type("low back");
    // The results stand in for the list while something is typed.
    expect(host.querySelector(".mcat-row")).toBeNull();
    await enter();
    expect(host.querySelector(".wk__h1")?.textContent).toBe("LUMBAR");
    expect(host.querySelector(".wk__eyebrow")?.textContent).toBe("Lumb · Lumbar Extension");
  });

  it("filters the floor to a switch, and puts the whole floor back", async () => {
    await mount();
    await type("handoff");
    await enter();
    expect(host.querySelector(".mcat-filter")?.textContent).toContain("Showing Handoff · 1 on Solon's floor");
    expect(rowNames()).toEqual(["CX (4 WAY NECK)"]);
    // Its number on the walk stays its own, not its place in the filter.
    expect(host.querySelector(".mcat-row__walk")?.textContent).toBe("1");
    await click(host.querySelector(".mcat-filter__clear"));
    expect(host.querySelector(".mcat-filter")).toBeNull();
    expect(rowNames()).toHaveLength(3);
  });

  it("opens a page on a line inside it, and says where the line is", async () => {
    await mount();
    await type("torso shifts");
    const line = [...host.querySelectorAll(".wk__hit")].find((h) => h.getAttribute("data-kind") === "line");
    await click(line);
    expect(host.querySelector(".wk__h1")?.textContent).toBe("LEG PRESS");
    expect(host.querySelector(".mcat-found__where")?.textContent).toBe("Found on this page · Clinical warnings");
  });

  it("knows a name head office added, and opens the unit on Enter (wave 2)", async () => {
    fx.aliases = { "m-lumbar": ["Bad Back Box"] };
    await mount();
    await type("bad back box");
    await enter();
    expect(host.querySelector(".wk__h1")?.textContent).toBe("LUMBAR");
  });

  it("sends a machine this floor does not have to All MSF machines", async () => {
    await mount();
    await type("torso arm");
    await enter();
    const msf = host.querySelector('[data-screen="msf"]');
    expect(msf).not.toBeNull();
    expect(msf?.getAttribute("data-open")).toBe("m-pulldown");
  });
});

describe("a floor that is not there is never the MSF standard", () => {
  it("says it can't read the floor, shows nothing in its place, and opens All MSF", async () => {
    fx.floor = "unreadable";
    await mount();
    expect(host.textContent).toContain("Can't read Solon's floor right now");
    expect(host.querySelector(".mcat-row")).toBeNull();
    expect(findField()).toBeNull();
    await click(host.querySelector(".mcat-door"));
    expect(host.querySelector('[data-screen="msf"]')?.getAttribute("data-floor")).toBe("0");
  });

  it("says an empty floor is empty, though the MSF catalog stands in for the list", async () => {
    fx.floor = "empty";
    await mount();
    expect(host.textContent).toContain("No machines on Solon's floor yet");
    expect(host.querySelector(".mcat-row")).toBeNull();
    // Find still knows the MSF movements, and says they are not on this floor.
    await type("leg press");
    expect(host.querySelector(".mcat-find__top .wk__hit-meta")?.textContent).toBe("LP · Not on Solon's floor");
  });

  // ── Edit our floor: a door to the ONE floor editor (Catalog R5's door) ──
  const leader = { id: "t-lead", fullName: "Elrond Peredhel", role: "StudioLeader", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as never;
  const trainer = { id: "t-lt", fullName: "Bergil Guard", role: "LifeTransformer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as never;
  const doors = () => [...host.querySelectorAll(".mcat-door")].filter((b) => b.textContent === "Edit our floor");

  it("offers Edit our floor to someone who leads here, under the floor, and it opens the editor's door", async () => {
    let opened = 0;
    await mount({ authTrainer: leader, onOpenFloorEditor: () => (opened += 1) });
    expect(doors()).toHaveLength(1);
    expect(host.querySelector(".mcat-floor-edit__where")?.textContent).toContain("My Studio → Machines");
    await click(doors()[0]);
    expect(opened).toBe(1);
  });

  it("offers it on an empty floor too, beside the door to All MSF", async () => {
    fx.floor = "empty";
    await mount({ authTrainer: leader, onOpenFloorEditor: () => {} });
    expect(doors()).toHaveLength(1);
    expect([...host.querySelectorAll(".mcat-door")].map((b) => b.textContent)).toEqual(["Edit our floor", "Open All MSF machines"]);
  });

  it("draws no door for a trainer, nor for a leader with nowhere to go, nor while typing in Find", async () => {
    await mount({ authTrainer: trainer, onOpenFloorEditor: () => {} });
    expect(doors()).toHaveLength(0);
    await mount({ authTrainer: leader });
    expect(doors()).toHaveLength(0);
    await mount({ authTrainer: leader, onOpenFloorEditor: () => {} });
    await type("leg");
    expect(doors()).toHaveLength(0);
  });

  it("opens a machine linked from elsewhere in All MSF when the floor is empty", async () => {
    fx.floor = "empty";
    await mount({ openMachineId: "m-leg-press", onOpenedMachine: () => {} });
    expect(host.querySelector('[data-screen="msf"]')?.getAttribute("data-open")).toBe("m-leg-press");
  });

  it("waits, in words, while the floor loads", async () => {
    fx.floor = "loading";
    await mount();
    expect(host.textContent).toContain("Reading Solon's floor…");
    expect(host.querySelector(".mcat-row")).toBeNull();
  });
});

describe("where the Catalog opens", () => {
  it("opens on All MSF machines for head office, and on the floor for a trainer", async () => {
    fx.isAdmin = true;
    await mount();
    expect(host.querySelector('[data-screen="msf"]')).not.toBeNull();
    await act(async () => root.unmount());
    forgetPersonalMemory();
    fx.isAdmin = false;
    root = createRoot(host);
    await mount();
    expect(host.querySelector('[data-screen="msf"]')).toBeNull();
    expect(host.querySelector(".mcat-floor")).not.toBeNull();
  });

  it("remembers the reader's choice until sign-out", async () => {
    await mount();
    await click(lens("All MSF machines"));
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount();
    expect(host.querySelector('[data-screen="msf"]')).not.toBeNull();
    forgetPersonalMemory();
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount();
    expect(host.querySelector('[data-screen="msf"]')).toBeNull();
  });

  it("narrows the floor to an Academy family from the front page's tile", async () => {
    await mount({ openGroupKey: "legs", onOpenedGroup: () => {} });
    expect(host.querySelector(".mcat-filter")?.textContent).toContain("Showing Lower Body · 1 on Solon's floor");
    expect(rowNames()).toEqual(["LEG PRESS"]);
  });
});

describe("the three ways in (Catalog R3)", () => {
  it("shows the floor, the body and All MSF above the title", async () => {
    await mount();
    expect([...host.querySelectorAll(".mcat-lens__btn")].map((b) => b.textContent)).toEqual([
      "Solon's floor",
      "The body",
      "All MSF machines",
    ]);
  });

  it("groups All MSF machines by the five families, with no switch to change it", async () => {
    await mount();
    await click(lens("All MSF machines"));
    const msf = host.querySelector('[data-screen="msf"]');
    expect(msf?.getAttribute("data-grouping")).toBe("academy");
    expect(msf?.getAttribute("data-control")).toBe("no");
    // The three ways in ride on All MSF's own header too.
    expect(msf?.querySelectorAll(".mcat-lens__btn")).toHaveLength(3);
  });

  it("opens the body, and a part picked there lists what on the floor trains it", async () => {
    await mount();
    await click(lens("The body"));
    expect(host.querySelector(".wk__index-title")?.textContent).toBe("The body");
    const quads = [...host.querySelectorAll(".mcat-body__chip")].find((c) => c.firstElementChild?.textContent === "Quads");
    await click(quads);
    expect(host.querySelector(".mcat-body__title")?.textContent).toBe("Quads");
    expect(rowNames()).toEqual(["LEG PRESS"]);
    // A machine opened from the body comes back to the body.
    await click(host.querySelector(".mcat-row"));
    expect(host.querySelector(".wk__h1")?.textContent).toBe("LEG PRESS");
    await click([...host.querySelectorAll(".wk__crumb")].find((c) => c.textContent === "Catalog"));
    expect(host.querySelector(".mcat-body__title")?.textContent).toBe("Quads");
  });

  it("opens the body lens from Find on a muscle's name", async () => {
    await mount();
    await type("lats");
    await enter();
    expect(host.querySelector(".mcat-body__title")?.textContent).toBe("Upper back and lats");
  });
});
