// @vitest-environment jsdom
/**
 * A MOVEMENT'S MODELS, MOUNTED (wave 2 of the Machine Catalog room, Catalog
 * R4): each maker's machine for a movement, what it is and never where it is.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { MovementModels } from "./MovementModels";
import type { MachineModel } from "./models";

const HOIST: MachineModel = {
  id: "hoist-rocit-lp",
  brand: "Hoist",
  model: "ROC-IT Leg Press",
  movementId: "m-leg-press",
  dials: ["Seat", "Back Pad", "Foot Plate"],
  notes: "Eleven seat positions; the accessory stack is 18 lb.",
};
const NAUTILUS: MachineModel = { id: "nautilus-nitro", brand: "Nautilus", model: "Nitro Plus Leg Press", movementId: "m-leg-press", dials: [], notes: "" };

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

describe("a movement's models", () => {
  it("names each model, with its dials and head office's note where they are recorded", async () => {
    await act(async () => root.render(<MovementModels models={[HOIST, NAUTILUS]} />));
    const items = [...host.querySelectorAll(".mcat-models__item")];
    expect(items.map((i) => i.querySelector(".mcat-models__name")?.textContent)).toEqual([
      "Hoist ROC-IT Leg Press",
      "Nautilus Nitro Plus Leg Press",
    ]);
    expect(items[0].querySelector(".mcat-models__dials")?.textContent).toBe("Dials: Seat · Back Pad · Foot Plate");
    expect(items[0].querySelector(".mcat-models__note")?.textContent).toBe("Eleven seat positions; the accessory stack is 18 lb.");
    // Nothing recorded is nothing said.
    expect(items[1].querySelector(".mcat-models__dials")).toBeNull();
    expect(items[1].querySelector(".mcat-models__note")).toBeNull();
  });

  it("never says how many floors have a model", async () => {
    await act(async () => root.render(<MovementModels models={[HOIST]} />));
    expect(host.textContent).not.toMatch(/floor|studio/i);
  });

  it("draws nothing for none", async () => {
    await act(async () => root.render(<MovementModels models={[]} />));
    expect(host.innerHTML).toBe("");
  });
});
