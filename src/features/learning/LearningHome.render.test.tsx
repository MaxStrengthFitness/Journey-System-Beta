// @vitest-environment jsdom
/**
 * THE LEARNING FRONT PAGE, MOUNTED (voice review follow-up, Sep 27 2026).
 *
 * No test mounted a Learning screen: sections.test.tsx renders WikiShell to
 * static markup, which never runs a layout effect, and PageScroller does its
 * work in one. CLAUDE.md: a green typecheck, suite and build do not mean a
 * screen mounts. This mounts the Overview inside the Learning tab's sections,
 * the unsaved-changes provider and fake data, and checks what the round
 * changed on it: a flagged machine in the caution plum, the empty floor's
 * pointer to My Studio -> Machines, and the page's remembered place being
 * forgotten at sign-out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CatalogMachine } from "../catalog/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fx = vi.hoisted(() => ({
  machines: [] as unknown[],
  upkeep: {} as Record<string, unknown>,
}));
vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "solon", activeStudio: { id: "solon", name: "Solon" } }),
}));
vi.mock("../catalog/useCatalogMachines", () => ({
  useCatalogMachines: () => ({ machines: fx.machines, loading: false, source: "roster" }),
}));
vi.mock("../studio-tasks/useMachineUpkeep", () => ({
  useMachineUpkeep: () => ({ byMachineId: fx.upkeep }),
}));
vi.mock("../wiki/useStudioWiki", () => ({
  useStudioWiki: () => ({ pages: [], loading: false, error: null, overlayFor: () => null }),
}));

import { WikiSectionsProvider, type WikiSectionsValue } from "../wiki";
import { rememberedPlaces } from "../wiki/WikiShell";
import { UnsavedChangesProvider } from "../unsaved-changes";
import { forgetPersonalMemory } from "../sign-out/memory";
import { LearningHome } from "./LearningHome";

const machine = (id: string, name: string, extra: Partial<CatalogMachine> = {}): CatalogMachine =>
  ({
    id,
    name,
    movementPattern: "",
    anatomicalRegion: "",
    isStudioCustom: false,
    rosterStatus: "active",
    targetMuscles: [],
    ...extra,
  }) as CatalogMachine;

const sections: WikiSectionsValue = {
  title: "Learning",
  titleIcon: null,
  sections: [
    { id: "learning", label: "Overview", icon: null },
    { id: "machine-anatomy", label: "Catalog", icon: null },
  ],
  active: "learning",
  onSelect: () => {},
  onHome: () => {},
  onSearch: () => {},
  searchLabel: "Search Learning",
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  fx.machines = [];
  fx.upkeep = {};
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const onOpen = vi.fn();
const onOpenCatalog = vi.fn();

async function mount() {
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <WikiSectionsProvider value={sections}>
          <LearningHome
            machines={[]}
            canWritePages={false}
            onOpen={onOpen}
            onOpenSearch={() => {}}
            onOpenCatalog={onOpenCatalog}
            onOpenAcademy={() => {}}
            onNewPage={() => {}}
          />
        </WikiSectionsProvider>
      </UnsavedChangesProvider>,
    );
  });
}

describe("the Learning front page, mounted", () => {
  it("mounts in the Learning tab's shell, with the title in the app's voice", async () => {
    fx.machines = [machine("m-chest-press", "Chest Press"), machine("m-leg-press", "Leg Press")];
    await mount();
    expect(host.querySelector(".wk__scroll")).not.toBeNull();
    expect(host.querySelector(".lh__title")?.textContent).toBe("MSF Learning");
    const names = [...host.querySelectorAll(".lh__machine-name")].map((n) => n.textContent);
    expect(names).toEqual(expect.arrayContaining(["Chest Press", "Leg Press"]));
  });

  it("opens a machine from its tile", async () => {
    fx.machines = [machine("m-chest-press", "Chest Press")];
    onOpen.mockClear();
    await mount();
    const row = [...host.querySelectorAll(".lh__machine")].find((b) => b.textContent?.includes("Chest Press"));
    await act(async () => (row as HTMLButtonElement).click());
    expect(onOpen).toHaveBeenCalledWith({ kind: "machine", id: "m-chest-press" });
  });

  it("shows a flagged machine in the caution plum, never the critical crimson", async () => {
    fx.machines = [machine("m-chest-press", "Chest Press"), machine("m-leg-press", "Leg Press", { rosterStatus: "maintenance" })];
    fx.upkeep = { "m-chest-press": { flagged: { note: "Pad torn", localDate: "2026-09-27" } } };
    await mount();
    const status = host.querySelector(".lh__status");
    expect(status?.textContent).toContain("1 flagged");
    expect(status?.textContent).toContain("1 out of service");
    const flagged = [...status!.querySelectorAll(".wk__badge")].find((b) => b.textContent === "1 flagged");
    expect(flagged?.className).toContain("wk__badge--warn");
    expect(status!.querySelector(".wk__badge--alert")).toBeNull();
  });

  it("sends a studio with no machines to My Studio -> Machines", async () => {
    await mount();
    expect(host.textContent).toContain("No machines at Solon yet. A studio leader adds them on My Studio → Machines.");
    expect(host.textContent).not.toContain("Machine Settings");
  });

  it("remembers where the reader left the page, and forgets it at sign-out", async () => {
    fx.machines = [machine("m-chest-press", "Chest Press")];
    await mount();
    const scroller = host.querySelector(".wk__scroll") as HTMLDivElement;
    await act(async () => {
      scroller.scrollTop = 120;
      scroller.dispatchEvent(new Event("scroll"));
    });
    expect(rememberedPlaces()).toBeGreaterThan(0);
    forgetPersonalMemory();
    expect(rememberedPlaces()).toBe(0);
  });
});
