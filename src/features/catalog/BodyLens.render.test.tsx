// @vitest-environment jsdom
/**
 * THE BODY LENS, MOUNTED (Machine Catalog round, Sep 28 2026 — Catalog R3).
 *
 * The app's own anatomy model with every part ALSO in a list, and a panel
 * that says what trains the part picked: main movers, helpers, and the MSF
 * movements the floor lacks. Mounted with the real BodyModel; the figure must
 * be painted with Learning's tokens, never the model's built-in hex.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { BodyLens } from "./BodyLens";
import { resolveMachineAnatomy } from "./anatomy";
import type { FloorState, Preset } from "./floor-index";
import type { CatalogMachine } from "./types";

const unit = (id: string, name: string): CatalogMachine =>
  ({
    id,
    name,
    movementPattern: "",
    isStudioCustom: false,
    rosterStatus: "active",
    requiresHandoff: false,
    anatomy: resolveMachineAnatomy(id),
  }) as CatalogMachine;

const FLOOR = [unit("m-leg-press", "LEG PRESS"), unit("m-ext", "LEG EXTENSION"), unit("m-leg-curl", "LEG CURL")];
const NONE: Preset = { dials: [], unset: 0, state: "no-dials" };

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

function Harness({
  floorState = "ready",
  start = null,
  onOpenMachine = () => {},
  onOpenMovement = () => {},
}: {
  floorState?: FloorState;
  start?: string | null;
  onOpenMachine?: (id: string) => void;
  onOpenMovement?: (id: string) => void;
}) {
  const [region, setRegion] = useState<string | null>(start);
  return (
    <BodyLens
      floor={floorState === "ready" ? FLOOR : []}
      floorState={floorState}
      studioName="Solon"
      regionId={region}
      onRegion={setRegion}
      presetFor={() => NONE}
      flaggedIds={new Set()}
      onOpenMachine={onOpenMachine}
      onOpenMovement={onOpenMovement}
    />
  );
}

async function mount(props: Parameters<typeof Harness>[0] = {}) {
  await act(async () => root.render(<Harness {...props} />));
}

const chip = (label: string) =>
  [...host.querySelectorAll(".mcat-body__chip")].find((c) => c.firstElementChild?.textContent === label) as
    | HTMLButtonElement
    | undefined;

describe("the body lens, mounted", () => {
  it("lists every part beside the figure, grouped, with the floor's counts", async () => {
    await mount();
    expect([...host.querySelectorAll(".mcat-body__group-label")].map((g) => g.textContent)).toEqual([
      "Upper body",
      "Trunk",
      "Lower body",
    ]);
    expect(chip("Quads")?.querySelector(".mcat-body__count")?.textContent).toBe("2");
    // A part nothing on the floor trains most carries no count, never a 0.
    expect(chip("Chest")?.querySelector(".mcat-body__count")).toBeNull();
    expect(host.querySelector(".wk__empty")?.textContent).toContain("Pick a part of the body");
  });

  it("says what trains the part picked: main movers, helpers, and what the floor lacks", async () => {
    await mount();
    await act(async () => chip("Glutes and outer hip")!.click());
    expect(chip("Glutes and outer hip")?.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".mcat-body__title")?.textContent).toBe("Glutes and outer hip");
    const headings = [...host.querySelectorAll(".mcat-body__heading")].map((h) => h.textContent);
    expect(headings).toEqual(["Trains it most", "Helps", "Not on Solon's floor"]);
    const names = [...host.querySelectorAll(".mcat-row__name")].map((n) => n.textContent);
    expect(names).toEqual(["LEG PRESS", "LEG CURL"]);
    expect([...host.querySelectorAll(".mcat-body__other-name")].map((n) => n.textContent)).toEqual(["Abduction"]);
  });

  it("opens a floor machine, and an MSF movement the floor lacks", async () => {
    const onOpenMachine = vi.fn();
    const onOpenMovement = vi.fn();
    await mount({ start: "gluteal", onOpenMachine, onOpenMovement });
    await act(async () => (host.querySelector(".mcat-row") as HTMLButtonElement).click());
    expect(onOpenMachine).toHaveBeenCalledWith("m-leg-press");
    await act(async () => (host.querySelector(".mcat-body__other") as HTMLButtonElement).click());
    expect(onOpenMovement).toHaveBeenCalledWith("m-hip-abd");
  });

  it("paints the part in Learning's figure colours, never the model's built-in hex", async () => {
    await mount({ start: "quadriceps" });
    const fills = [...host.querySelectorAll(".wk__figure path[fill]")].map((el) => el.getAttribute("fill")!);
    expect(fills).toContain("var(--wk-muscle-primary)");
    expect(fills).toContain("var(--wk-muscle-base)");
    expect(fills.filter((f) => /^#/.test(f))).toEqual([]);
  });

  it("turns the figure to the side the part is drawn on, and keeps a Front | Back switch", async () => {
    await mount({ start: "hamstring" });
    const pressed = [...host.querySelectorAll(".wk__seg-btn")].find((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed?.textContent).toBe("Back");
  });

  it("never claims what an unreadable floor lacks", async () => {
    await mount({ floorState: "unreadable", start: "lower-back" });
    expect(host.textContent).toContain("Can't read Solon's floor right now.");
    expect(host.querySelector(".mcat-row")).toBeNull();
    const headings = [...host.querySelectorAll(".mcat-body__heading")].map((h) => h.textContent);
    expect(headings).toEqual(["MSF machines that train it most"]);
  });
});
