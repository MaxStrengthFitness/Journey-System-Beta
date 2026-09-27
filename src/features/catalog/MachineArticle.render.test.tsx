// @vitest-environment jsdom
/**
 * A MACHINE PAGE, MOUNTED (voice review follow-up, Sep 27 2026).
 *
 * MachineArticle had no mounted test, and the round changed what it draws:
 * a flag in the caution plum, the body figure in Learning's own colours, the
 * related machines asking about typing on the page before they leave it.
 * Mounted here inside a WikiShell (so PageScroller's layout effect runs) with
 * the real MachineFigure and fake data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CatalogMachine } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { UnsavedChangesProvider } from "../unsaved-changes";
import { WikiShell } from "../wiki";
import { MachineArticle } from "./MachineArticle";
import { MachineFigure } from "./MachineFigure";
import { resolveMachineAnatomy } from "./anatomy";

const chestPress: CatalogMachine = {
  id: "m-chest-press",
  name: "Chest Press",
  movementPattern: "Upper Body: Horizontal Push",
  anatomicalRegion: "Upper body",
  isStudioCustom: false,
  rosterStatus: "active",
  anatomy: resolveMachineAnatomy("m-chest-press"),
  clinicalNote: "Horizontal push.",
  kinematicClassification: "Compound",
  executionPosture: "Seated",
  setupGap: "Handles at mid-chest",
  requiresHandoff: false,
  targetMuscles: ["Pectoralis major"],
  synergists: ["Anterior deltoid", "Triceps"],
  clinicalWarnings: ["Stop if the shoulder pinches.", "Keep the wrists neutral."],
  contraindicatedFor: [],
  setup: "Seat height puts the handles at mid-chest.",
  setupCues: ["Feet flat"],
  execution: "Press slowly.",
  executionCues: ["Ten seconds out"],
  studioNotes: "",
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function Page({ flagged, onOpenMachine }: { flagged?: boolean; onOpenMachine: (id: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <WikiShell crumbs={[{ label: "Catalog", onClick: () => {} }, { label: "Chest Press" }]}>
      <MachineArticle
        machine={chestPress}
        isFlagged={flagged}
        upkeepStatus="due"
        related={[{ id: "m-chest-fly", label: "Chest Fly", accent: "push" }]}
        onOpenMachine={onOpenMachine}
        figure={
          <MachineFigure
            anatomy={chestPress.anatomy}
            view="front"
            gender="male"
            onViewChange={() => {}}
            onGenderChange={() => {}}
          />
        }
        isOpen={(id, fallback) => open[id] ?? fallback}
        setOpen={(id, next) => setOpen((o) => ({ ...o, [id]: next }))}
      />
    </WikiShell>
  );
}

async function mount(ui: React.ReactNode) {
  await act(async () => {
    root.render(<UnsavedChangesProvider>{ui}</UnsavedChangesProvider>);
  });
}

describe("a machine page, mounted", () => {
  it("draws the page, its warnings on the page and never folded", async () => {
    await mount(<Page onOpenMachine={() => {}} />);
    expect(host.querySelector(".wk__h1")?.textContent).toBe("Chest Press");
    expect(host.querySelector(".wk__warnings")?.textContent).toContain("Stop if the shoulder pinches.");
    expect(host.querySelector(".wk__scroll")).not.toBeNull();
  });

  it("shows a flag in the caution plum, on the badge and in the infobox", async () => {
    await mount(<Page flagged onOpenMachine={() => {}} />);
    const flags = [...host.querySelectorAll(".wk__badge")].filter((b) => b.textContent?.startsWith("Flagged"));
    expect(flags.map((b) => b.textContent)).toEqual(["Flagged by a trainer", "Flagged — see Upkeep"]);
    for (const b of flags) expect(b.className).toContain("wk__badge--warn");
    expect(host.querySelector(".wk__badge--alert")).toBeNull();
  });

  it("paints the body in Learning's figure colours, the worked muscles apart from the rest", async () => {
    await mount(<Page onOpenMachine={() => {}} />);
    const fills = [...host.querySelectorAll(".wk__figure path[fill]")].map((el) => el.getAttribute("fill")!);
    expect(fills).toContain("var(--wk-muscle-primary)");
    expect(fills).toContain("var(--wk-muscle-secondary)");
    expect(fills).toContain("var(--wk-muscle-base)");
    // Never the model's built-in hex, which put the two 1.04:1 apart.
    expect(fills.filter((f) => /^#(0a548b|4b555c|6fb4e4)$/i.test(f))).toEqual([]);
  });

  it("opens a related machine", async () => {
    const onOpenMachine = vi.fn();
    await mount(<Page onOpenMachine={onOpenMachine} />);
    const chip = [...host.querySelectorAll(".wk__chip")].find((b) => b.textContent === "Chest Fly");
    await act(async () => (chip as HTMLButtonElement).click());
    expect(onOpenMachine).toHaveBeenCalledWith("m-chest-fly");
  });
});
