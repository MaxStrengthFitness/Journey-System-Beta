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
import type { Preset } from "./floor-index";

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

function Page({
  flagged,
  machine = chestPress,
  preset,
  onOpenMachine,
}: {
  flagged?: boolean;
  machine?: CatalogMachine;
  preset?: Preset;
  onOpenMachine: (id: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <WikiShell crumbs={[{ label: "Catalog", onClick: () => {} }, { label: machine.name }]}>
      <MachineArticle
        machine={machine}
        flag={flagged ? { who: "Bergil", when: "Sep 27, 8:52 AM", note: "Seat pin sticks." } : null}
        preset={preset}
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

  it("shows Relay's flag in the caution plum: the badge, and who, when and what", async () => {
    await mount(<Page flagged onOpenMachine={() => {}} />);
    const flags = [...host.querySelectorAll(".wk__badge")].filter((b) => b.textContent?.startsWith("Flagged"));
    expect(flags.map((b) => b.textContent)).toEqual(["Flagged"]);
    for (const b of flags) expect(b.className).toContain("wk__badge--warn");
    expect(host.querySelector(".wk__badge--alert")).toBeNull();
    expect(host.querySelector(".mcat-flag__who")?.textContent).toBe("Flagged by Bergil · Sep 27, 8:52 AM");
    expect(host.querySelector(".mcat-flag__note")?.textContent).toBe("Seat pin sticks.");
  });

  it("says why a unit is out of service, who said so and when, and where it goes back in (wave 2)", async () => {
    const out: CatalogMachine = {
      ...chestPress,
      rosterStatus: "maintenance",
      outOfService: {
        reason: "A new cable is on order",
        by: { uid: "uid-glorfindel", name: "Glorfindel of the Golden Flower" },
        at: Date.UTC(2026, 8, 27, 12, 52),
      },
    };
    await mount(<Page machine={out} onOpenMachine={() => {}} />);
    expect(host.querySelector(".mcat-oos__who")?.textContent).toMatch(/^Out of service · Glorfindel · Sep 27, \d{1,2}:52 [AP]M$/);
    expect(host.querySelector(".mcat-oos__note")?.textContent).toBe("A new cable is on order");
    expect(host.querySelector(".mcat-oos__where")?.textContent).toBe("Back in service is on My Studio → Machines.");
    // The caution plum, as the badge: never the critical crimson.
    const badge = [...host.querySelectorAll(".wk__badge")].find((b) => b.textContent === "Out of service");
    expect(badge?.className).toContain("wk__badge--warn");
  });

  it("keeps an old out of service with no reason to its badge, and says nothing it doesn't know", async () => {
    await mount(<Page machine={{ ...chestPress, rosterStatus: "maintenance" }} onOpenMachine={() => {}} />);
    expect(host.querySelector(".mcat-oos")).toBeNull();
    expect([...host.querySelectorAll(".wk__badge")].some((b) => b.textContent === "Out of service")).toBe(true);
  });

  it("counts no cleaning of its own: no Upkeep card, no cleaning badge", async () => {
    await mount(<Page onOpenMachine={() => {}} />);
    expect(host.textContent).not.toContain("Upkeep");
    expect(host.textContent).not.toMatch(/Cleaning (due|overdue)/);
  });

  it("names its movement above the floor name, with the Academy's code", async () => {
    const lumbar = { ...chestPress, id: "m-lumbar", name: "LUMBAR", movementPattern: "Core: Spine Extension" };
    await mount(<Page machine={lumbar} onOpenMachine={() => {}} />);
    expect(host.querySelector(".wk__eyebrow")?.textContent).toBe("Lumb · Lumbar Extension");
    // The code is said once, above the title: no separate Academy row.
    expect(host.textContent).not.toContain("Academy");
  });

  it("puts the Academy's never-to-failure rule first, in its own words", async () => {
    const lumbar: CatalogMachine = {
      ...chestPress,
      id: "m-lumbar",
      name: "LUMBAR",
      neverToFailure: true,
      safetyNotice: "Safety Notice: Never take Lumbar Extension to failure.",
    };
    await mount(<Page machine={lumbar} onOpenMachine={() => {}} />);
    const rule = host.querySelector(".mcat-ntf");
    expect(rule?.textContent).toContain("Never to failure");
    expect(rule?.textContent).toContain("Never take Lumbar Extension to failure.");
    // Before the clinical warnings, never folded.
    const body = host.querySelector(".wk__body")!;
    expect(body.firstElementChild?.className).toBe("mcat-ntf");
  });

  it("leads the box with the unit's preset, or says it has no numbers", async () => {
    await mount(
      <Page preset={{ dials: [{ label: "Gap", value: "2" }], unset: 0, state: "set" }} onOpenMachine={() => {}} />,
    );
    expect(host.querySelector(".wk__aside")?.textContent).toContain("Gap 2");
    await mount(<Page preset={{ dials: [], unset: 3, state: "none" }} onOpenMachine={() => {}} />);
    expect(host.querySelector(".wk__aside")?.textContent).toContain("No numbers set for this unit yet");
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
