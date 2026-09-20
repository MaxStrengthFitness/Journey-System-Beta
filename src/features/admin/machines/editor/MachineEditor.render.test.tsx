// @vitest-environment jsdom
/**
 * The machine editor actually mounts, in all three scopes.
 *
 * A green typecheck, suite and build do not mean a screen mounts — this file
 * exists for the hook-order slip and the render-time throw. It also pins the
 * three behaviours that are the point of the round: a studio sees the method
 * but cannot edit it, a save carries only the diff, and a studio's save never
 * carries the company's cadence even when the draft is holding it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MACHINE_DEFINITIONS } from "../../../../data/machine-definitions";
import type { MachineDefinition } from "../../../../types/machines";
import { MachineEditor } from "./MachineEditor";

const legPress = MACHINE_DEFINITIONS["m-leg-press"] as MachineDefinition;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(props: Partial<Parameters<typeof MachineEditor>[0]> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const saves: Partial<MachineDefinition>[] = [];
  await act(async () => {
    root!.render(
      <StrictMode>
        <MachineEditor
          value={legPress}
          scope="catalog"
          whose="Max Strength standard"
          backLabel="Catalog"
          onBack={() => {}}
          onSave={async (patch) => {
            saves.push(patch);
          }}
          {...props}
        />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return { el: host!, saves };
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe("MachineEditor", () => {
  it("mounts the standard with every section and its content", async () => {
    const { el } = await mount();
    const text = el.textContent ?? "";
    expect(text).toContain("LEG PRESS");
    for (const title of [
      "Identity and kinematics",
      "Target musculature",
      "Universal baseline",
      "Body-type adjustments",
      "Alignment checkpoints",
      "Execution and cadence",
      "Safety",
      "The dials",
    ]) {
      expect(text).toContain(title);
    }
    // The Academy's own prose reached the screen, not a placeholder.
    expect(text).toContain("Position 2 (P2)");
  });

  it("mounts a brand new machine without throwing on empty fields", async () => {
    const blank = {
      name: "",
      universalBaseline: {
        seatHeightPosition: "",
        padAxisAlignment: "",
        restraintsAnchoring: "",
        startingWeightStackGap: "",
      },
      bodyTypeAdjustments: { shorterStature: {}, tallerStature: {}, limitedMobility: {} },
      alignmentCheckpoints: [],
      execution: {
        requiresHandoff: false,
        loadUpProtocol: "",
        concentricSeconds: 6,
        eccentricSeconds: 6,
        upperTurnaround: { style: "touch-and-go", description: "" },
        lowerTurnaround: { style: "touch-and-go", description: "" },
        keyCues: [],
      },
      clinicalWarnings: [],
      contraindicatedFor: [],
      sequencingContraindications: [],
      primaryMuscles: [],
      secondaryMuscles: [],
      synergistMuscles: [],
      musculature: { primary: [], secondary: [], synergists: [] },
      settingFields: [],
      defaultSettings: {},
    } as unknown as MachineDefinition;

    const { el } = await mount({ value: blank, isNew: true });
    expect(el.textContent).toContain("New machine");
    // It says what is missing rather than only scoring it.
    expect(el.textContent).toContain("Needs");
  });

  it("shows a studio the method but gives it no inputs", async () => {
    const { el } = await mount({
      value: legPress,
      standard: legPress,
      scope: "studio",
      whose: "Solon's copy",
    });
    const text = el.textContent ?? "";
    expect(text).toContain("Set by Max Strength");
    // The cadence is READABLE — a leader setting up a client needs it — and
    // it is not an input.
    expect(text).toContain("Execution and cadence");

    const execSection = el.querySelector("#machine-section-execution")!;
    expect(execSection.querySelectorAll("input, select, textarea")).toHaveLength(0);

    // Its own hardware stays editable.
    const baseline = el.querySelector("#machine-section-baseline")!;
    expect(baseline.querySelectorAll("textarea").length).toBeGreaterThan(0);
  });

  it("gives an admin inputs on the very sections a studio cannot touch", async () => {
    const { el } = await mount({
      value: legPress,
      standard: legPress,
      scope: "admin",
      whose: "Solon's copy",
    });
    expect(el.textContent).not.toContain("Set by Max Strength");
    const execSection = el.querySelector("#machine-section-execution")!;
    expect(execSection.querySelectorAll("input, select, textarea").length).toBeGreaterThan(0);
  });

  it("turns every section to prose in the read view", async () => {
    const { el } = await mount();
    const toggle = [...el.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Read it as a trainer"),
    )!;
    expect(toggle).toBeTruthy();
    await act(async () => toggle.click());
    // Nothing on the page is an input any more.
    expect(el.querySelectorAll("input, select, textarea")).toHaveLength(0);
    // And the content survived the switch.
    expect(el.textContent).toContain("Position 2 (P2)");
  });

  it("pins never-to-failure and the warnings where they cannot be scrolled past", async () => {
    const lumbar = MACHINE_DEFINITIONS["m-lumbar"] as MachineDefinition;
    const { el } = await mount({ value: lumbar });
    const text = el.textContent ?? "";
    expect(text).toContain("Never to failure");
    // Above the rail, not inside a section.
    const notice = el.querySelector(".adm-notice--alert");
    expect(notice).toBeTruthy();
    expect(notice!.textContent).toContain("Never to failure");
  });

  it("saves only the diff, and strips the method out of a studio's write", async () => {
    const { el, saves } = await mount({
      value: legPress,
      standard: legPress,
      scope: "studio",
      whose: "Solon's copy",
    });

    // Change one baseline line, the way a studio would.
    const baseline = el.querySelector("#machine-section-baseline")!;
    const box = baseline.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(box, "Seat back to P3 on our unit.");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const save = [...el.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Save changes"),
    )!;
    await act(async () => save.click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

    expect(saves).toHaveLength(1);
    const patch = saves[0];
    // Only what moved.
    expect(Object.keys(patch)).toEqual(["universalBaseline"]);
    // And never the company's method, whatever the draft was holding.
    expect(patch.execution).toBeUndefined();
    expect(patch.musculature).toBeUndefined();
    expect(patch.movementPattern).toBeUndefined();
  });
});
