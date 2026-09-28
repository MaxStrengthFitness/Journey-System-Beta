// @vitest-environment jsdom
/**
 * The Codex format's sections mount, write what was typed and nothing that
 * was left blank, and keep the template boundary per field (Codex R2).
 */
import { afterEach, describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MACHINE_DEFINITIONS } from "../../../../data/machine-definitions";
import type { MachineDefinition } from "../../../../types/machines";
import { MachineEditor } from "./MachineEditor";
import { codexLinesIn, tidyCodexLists } from "./codex-sections";

const legPress = MACHINE_DEFINITIONS["m-leg-press"] as MachineDefinition;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(props: Partial<Parameters<typeof MachineEditor>[0]> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const saves: { patch: Partial<MachineDefinition>; draft: MachineDefinition }[] = [];
  await act(async () => {
    root!.render(
      <StrictMode>
        <MachineEditor
          value={legPress}
          scope="catalog"
          whose="The Max Strength standard"
          backLabel="Catalog"
          onBack={() => {}}
          onSave={async (patch, draft) => {
            saves.push({ patch, draft });
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

async function type(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function choose(el: HTMLSelectElement, value: string) {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function click(el: HTMLElement) {
  await act(async () => el.click());
}

async function save(el: HTMLElement) {
  const btn = [...el.querySelectorAll("button")].find((b) => /Save changes/.test(b.textContent ?? ""))!;
  await click(btn);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

const buttonNamed = (el: HTMLElement, text: RegExp) =>
  [...el.querySelectorAll("button")].find((b) => text.test(b.textContent ?? ""))!;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe("the Codex sections", () => {
  it("mount after the eight, optional and empty on a machine written before v2", async () => {
    const { el } = await mount();
    const text = el.textContent ?? "";
    for (const t of ["Codex: at the machine", "Codex: the set and after", "Codex: study", "Sources"]) {
      expect(text).toContain(t);
    }
    expect(text).toContain("The Codex · optional");
    // Nothing here counts as missing: the completeness line is unchanged.
    expect(el.querySelector("#machine-section-codex-machine")).toBeTruthy();
    expect(text).toContain("None of its");
  });

  it("saves a stop rule an admin typed, and drops a row left blank", async () => {
    const { el, saves } = await mount();
    const section = el.querySelector("#machine-section-codex-machine")! as HTMLElement;
    await click(buttonNamed(section, /Add a stop rule/));
    await click(buttonNamed(section, /Add a stop rule/));
    const boxes = section.querySelectorAll(".adm-me__card textarea");
    await type(boxes[0] as HTMLTextAreaElement, "The knees never lock out at the end stop.");
    await type(boxes[1] as HTMLTextAreaElement, "The quads unload at lock-out.");
    await save(el);
    expect(saves).toHaveLength(1);
    expect(saves[0].patch.stopRules).toEqual([
      { text: "The knees never lock out at the end stop.", why: "The quads unload at lock-out." },
    ]);
  });

  it("writes one line of an object leaf and nothing else in it", async () => {
    const { el, saves } = await mount();
    const section = el.querySelector("#machine-section-codex-set")! as HTMLElement;
    const box = section.querySelector("textarea") as HTMLTextAreaElement;
    await type(box, "The knees follow the same path both ways.");
    await save(el);
    expect(saves[0].patch).toEqual({ rep: { path: "The knees follow the same path both ways." } });
  });

  it("records a line's source", async () => {
    const { el, saves } = await mount();
    const section = el.querySelector("#machine-section-codex-sources")! as HTMLElement;
    const kind = section.querySelector("select") as HTMLSelectElement;
    await choose(kind, "guide");
    await save(el);
    const sources = saves[0].patch.sources ?? [];
    expect(sources).toHaveLength(1);
    expect(sources[0].kind).toBe("guide");
    expect(sources[0].path).toBeTruthy();
  });

  it("gives a studio its dial letters and, on its own copy, the rules too (the Sep 21 rule)", async () => {
    const { el } = await mount({ value: legPress, standard: legPress, scope: "studio", whose: "Solon's copy" });
    const section = el.querySelector("#machine-section-codex-machine")! as HTMLElement;
    expect(section.querySelector('input[placeholder="G, P, SP"]')).toBeTruthy();
    const rulePlaceholder = "The footplate meets the end stop just before the knees straighten.";
    expect(section.querySelector(`textarea[placeholder="${rulePlaceholder}"]`)).toBeTruthy();
  });

  it("keeps a copy's stop rules from Max Strength beside its own, each off only with a reason", async () => {
    const standard: MachineDefinition = { ...legPress, stopRules: [{ text: "The knees never lock out." }] };
    const { el, saves } = await mount({
      value: standard,
      standard,
      scope: "studio",
      whose: "Solon's copy",
      actor: { uid: "uid-eowyn", name: "Éowyn" },
    });
    const section = el.querySelector("#machine-section-codex-machine")! as HTMLElement;
    expect(section.textContent).toContain("The knees never lock out.");
    await click(buttonNamed(section, /Take off this unit/));
    const why = section.querySelector("textarea[id^='why-stopRules']") as HTMLTextAreaElement;
    await type(why, "This unit's end stop is a hard pin.");
    await click(buttonNamed(section, /Take it off this unit/));
    await save(el);
    expect(saves[0].draft.stopRules).toEqual([]);
    expect(saves[0].draft.removedSafety?.[0]).toMatchObject({ field: "stopRules", line: "The knees never lock out." });
  });

  it("turns to prose in the read view", async () => {
    const { el } = await mount({ value: { ...legPress, rep: { path: "One path, both ways." } } });
    await click(buttonNamed(el, /Read it as a trainer/));
    expect(el.querySelectorAll("input, select, textarea")).toHaveLength(0);
    expect(el.textContent).toContain("One path, both ways.");
  });
});

describe("tidyCodexLists", () => {
  it("drops blank records, and an emptied list stays empty", () => {
    expect(
      tidyCodexLists({
        stopRules: [{ text: "  " }, { text: "Stop at lock-out." }],
        faults: [{ fault: "" }],
        rep: { path: "x", moments: [{ moment: "up", say: "" }] },
      }),
    ).toEqual({ stopRules: [{ text: "Stop at lock-out." }], faults: [], rep: { path: "x" } });
  });

  it("leaves a patch that never touched a list alone", () => {
    expect(tidyCodexLists({ name: "LEG PRESS" })).toEqual({ name: "LEG PRESS" });
  });
});

describe("codexLinesIn", () => {
  it("counts what is written, a record as one line", () => {
    expect(codexLinesIn(legPress, ["stopRules", "setUp"])).toBe(0);
    expect(
      codexLinesIn(
        { ...legPress, stopRules: [{ text: "a", why: "b" }], setUp: { entry: "c", preload: "" } },
        ["stopRules", "setUp"],
      ),
    ).toBe(2);
  });
});
