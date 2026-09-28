// @vitest-environment jsdom
/**
 * THE CATALOG, MOUNTED (Machine Catalog round, Sep 28 2026).
 *
 * CatalogWikiView had no mounted test; the round reworks it (Find, the
 * names). It is mounted here inside the Learning tab's sections and the
 * unsaved-changes provider, with every Firestore-backed hook stood in for by
 * fixed data, and driven the way a trainer drives it: Find, a filter, a page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CatalogMachine } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fx = vi.hoisted(() => ({
  machines: [] as unknown[],
  makers: {} as Record<string, string>,
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "solon", activeStudio: { id: "solon", name: "Solon" }, isAdmin: false }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }),
}));
vi.mock("../../hooks/useStudioMachineSettings", () => ({
  useStudioMachineSettings: () => ({ settingsByMachineId: {}, loading: false }),
}));
vi.mock("./useCatalogMachines", () => ({
  useCatalogMachines: () => ({ machines: fx.machines, source: "roster", loading: false, makers: fx.makers }),
}));
vi.mock("./StudioSetupCard", () => ({ StudioSetupCard: () => null }));
vi.mock("./StudioNotesCard", () => ({ StudioNotesCard: () => null }));
vi.mock("../studio-tasks/useMachineUpkeep", () => ({ useMachineUpkeep: () => ({ byMachineId: {} }) }));
vi.mock("../studio-tasks/usePlaybook", () => ({ usePlaybook: () => ({ entries: [] }) }));
vi.mock("../studio-tasks/useStudioTasks", () => ({ useStudioTasks: () => ({ rows: [] }) }));
vi.mock("../studio-tasks/MachineUpkeepCard", () => ({ MachineUpkeepCard: () => null }));
vi.mock("../studio-tasks/MachinePlaybookCard", () => ({ MachinePlaybookCard: () => null }));
vi.mock("../studio-tasks/TaskNoteDialog", () => ({ TaskNoteDialog: () => null }));
vi.mock("../studio-tasks/notify", () => ({ notifyTaskCompletion: async () => {} }));
vi.mock("../studio-tasks/playbook", () => ({ searchPlaybook: () => [] }));
vi.mock("../studio-tasks/mutations", () => ({ setTaskStatus: async () => {}, studioLocation: () => ({}) }));
vi.mock("../wiki/useStudioWiki", () => ({
  useStudioWiki: () => ({ pages: [], loading: false, error: null, overlayFor: () => null }),
}));
vi.mock("../wiki/StudioWikiPanel", () => ({ StudioWikiPanel: () => null }));
vi.mock("../academy/useAcademyContent", () => ({ useAcademyCards: () => null, useAcademyScripts: () => null }));
vi.mock("../comments", () => ({ CommentsPanel: () => null }));
vi.mock("../machine-trends/MachineTrendsPanel", () => ({ MachineTrendsPanel: () => null }));
vi.mock("../machine-db", () => ({
  MachineDatabase: ({ openMachineId }: { openMachineId?: string | null }) => (
    <div data-screen="msf" data-open={openMachineId ?? ""} />
  ),
  NetworkNotes: () => null,
  ScopeSwitch: () => <div data-screen="scope" />,
  ShareToggle: () => null,
  setMachineShared: async () => {},
  setNoteShared: async () => {},
  setTipShared: async () => {},
  sharedKeysFor: () => [],
}));

import { WikiSectionsProvider, type WikiSectionsValue } from "../wiki";
import { UnsavedChangesProvider } from "../unsaved-changes";
import { resolveMachineAnatomy } from "./anatomy";
import { CatalogWikiView } from "./CatalogWikiView";

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

const FLOOR: CatalogMachine[] = [
  machine("m-neck", "CX (4 WAY NECK)", { requiresHandoff: true, neverToFailure: true }),
  machine("m-leg-press", "LEG PRESS", {
    clinicalWarnings: ["If feet slide or torso shifts up seat back, ensure knees do not fully extend."],
  }),
  machine("m-lumbar", "LUMBAR", { neverToFailure: true, safetyNotice: "Never take Lumbar Extension to failure." }),
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
  fx.machines = FLOOR;
  fx.makers = {};
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function mount() {
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <WikiSectionsProvider value={sections}>
          <CatalogWikiView machines={[]} authTrainer={null} />
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
const rowTitles = () => [...host.querySelectorAll(".wk__row-title")].map((t) => t.textContent);

describe("the Catalog, mounted", () => {
  it("opens on the floor with Find on top of it", async () => {
    await mount();
    expect(findField()).not.toBeNull();
    expect(rowTitles()).toEqual(expect.arrayContaining(["CX (4 WAY NECK)", "LEG PRESS", "LUMBAR"]));
  });

  it("names the Academy movement under a floor name that leaves it unsaid", async () => {
    await mount();
    const row = [...host.querySelectorAll(".wk__row")].find((r) => r.textContent?.includes("LUMBAR"));
    expect(row?.querySelector(".wk__row-meta")?.textContent).toBe("Lumbar Extension");
    const lp = [...host.querySelectorAll(".wk__row")].find((r) => r.textContent?.includes("LEG PRESS"));
    expect(lp?.querySelector(".wk__row-meta")).toBeNull();
  });

  it("finds LUMBAR from 'low back' and opens its page on Enter", async () => {
    await mount();
    await type("low back");
    // The results stand in for the list while something is typed.
    expect(host.querySelector(".wk__row")).toBeNull();
    await enter();
    expect(host.querySelector(".wk__h1")?.textContent).toBe("LUMBAR");
    expect(host.querySelector(".wk__eyebrow")?.textContent).toBe("Lumb · Lumbar Extension");
  });

  it("filters the floor to a switch, and puts the whole floor back", async () => {
    await mount();
    await type("handoff");
    await enter();
    expect(host.querySelector(".mcat-filter")?.textContent).toContain("Showing Handoff · 1 on Solon's floor");
    expect(rowTitles()).toEqual(["CX (4 WAY NECK)"]);
    await click(host.querySelector(".mcat-filter__clear"));
    expect(host.querySelector(".mcat-filter")).toBeNull();
    expect(rowTitles()).toHaveLength(3);
  });

  it("opens a page on a line inside it, and says where the line is", async () => {
    await mount();
    await type("torso shifts");
    const line = [...host.querySelectorAll(".wk__hit")].find((h) => h.getAttribute("data-kind") === "line");
    await click(line);
    expect(host.querySelector(".wk__h1")?.textContent).toBe("LEG PRESS");
    expect(host.querySelector(".mcat-found__where")?.textContent).toBe("Found on this page · Clinical warnings");
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
