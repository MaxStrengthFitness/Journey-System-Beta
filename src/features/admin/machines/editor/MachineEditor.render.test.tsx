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

  it("gives a studio inputs on the method of its own copy (the Sep 21 rule)", async () => {
    const { el } = await mount({
      value: legPress,
      standard: legPress,
      scope: "studio",
      whose: "Solon's copy",
    });
    const text = el.textContent ?? "";
    // AJ, Sep 21 / Sep 27 2026: a studio may change anything on its own copy.
    expect(text).not.toContain("Set by Max Strength");
    expect(text).toContain("only this floor reads the change");
    const execSection = el.querySelector("#machine-section-execution")!;
    expect(execSection.querySelectorAll("input, select, textarea").length).toBeGreaterThan(0);
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

  it("saves only the diff: the method a studio left alone stays out of its write", async () => {
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
    // The method nobody touched is not rewritten with what it already said.
    expect(patch.execution).toBeUndefined();
    expect(patch.musculature).toBeUndefined();
    expect(patch.movementPattern).toBeUndefined();
  });
});

describe("one of Max Strength's safety lines on a studio's copy (the Sep 21 rule)", () => {
  const faramir = { uid: "uid-faramir", name: "Faramir" };

  async function mountCopy(actor?: { uid: string; name: string }) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const saves: { patch: Partial<MachineDefinition>; draft: MachineDefinition }[] = [];
    await act(async () => {
      root!.render(
        <StrictMode>
          <MachineEditor
            value={legPress}
            standard={legPress}
            scope="studio"
            whose="Solon's copy"
            backLabel="The floor"
            onBack={() => {}}
            onSave={async (patch, draft) => {
              saves.push({ patch, draft });
            }}
            actor={actor}
          />
        </StrictMode>,
      );
    });
    return { el: host!, saves };
  }

  const buttons = (el: HTMLElement, text: RegExp) =>
    [...el.querySelectorAll("button")].filter((b) => text.test(b.textContent ?? ""));

  it("takes a line off only once a reason is written, and records who and when", async () => {
    const { el, saves } = await mountCopy(faramir);
    const safety = el.querySelector("#machine-section-safety") as HTMLElement;
    const first = legPress.clinicalWarnings[0];
    expect(safety.textContent).toContain(first);

    await act(async () => buttons(safety, /Take off this unit/)[0].click());
    const take = buttons(safety, /Take it off this unit/)[0] as HTMLButtonElement;
    expect(take.disabled).toBe(true);

    const why = safety.querySelector("textarea[id^='why-clinicalWarnings']") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(why, "Our unit has no end stop to lock against.");
      why.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(take.disabled).toBe(false);
    await act(async () => take.click());

    // Taken off: listed with its reason and a way back.
    expect(safety.textContent).toContain("Taken off this unit");
    expect(safety.textContent).toContain("Why: Our unit has no end stop to lock against.");
    expect(buttons(safety, /Put it back/)).toHaveLength(1);

    await act(async () => buttons(el, /Save changes/)[0].click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(saves).toHaveLength(1);
    const draft = saves[0].draft;
    expect(draft.clinicalWarnings).not.toContain(first);
    expect(draft.removedSafety).toHaveLength(1);
    expect(draft.removedSafety![0]).toMatchObject({
      field: "clinicalWarnings",
      line: first,
      reason: "Our unit has no end stop to lock against.",
      by: faramir,
    });
  });

  it("puts a line back, record and all", async () => {
    const { el } = await mountCopy(faramir);
    const safety = el.querySelector("#machine-section-safety") as HTMLElement;
    await act(async () => buttons(safety, /Take off this unit/)[0].click());
    const why = safety.querySelector("textarea[id^='why-clinicalWarnings']") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(why, "Not on this model.");
      why.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => buttons(safety, /Take it off this unit/)[0].click());
    await act(async () => buttons(safety, /Put it back/)[0].click());
    expect(safety.textContent).not.toContain("Taken off this unit");
    expect(safety.textContent).toContain(legPress.clinicalWarnings[0]);
  });

  it("does not offer to take a line off when it cannot say who is asking", async () => {
    const { el } = await mountCopy(undefined);
    const safety = el.querySelector("#machine-section-safety") as HTMLElement;
    expect(buttons(safety, /Take off this unit/)).toHaveLength(0);
    // The lines are still shown as Max Strength's.
    expect(safety.textContent).toContain("From Max Strength");
  });
});
