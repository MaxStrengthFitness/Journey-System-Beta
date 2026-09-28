// @vitest-environment jsdom
/**
 * ONE UNIT ON THE FLOOR, MOUNTED (Machine Catalog round, Sep 28 2026 —
 * Catalog R2). Checks what a trainer reads walking up: the number on the
 * walk, the floor name whole, the Academy name only when the floor name
 * leaves it unsaid, the preset, the switches in their colours, and that the
 * row asks about typing on the page before it leaves it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { WikiPageGuardContext } from "../wiki/page-guard";
import { FloorRow } from "./FloorRow";
import type { Preset } from "./floor-index";
import type { CatalogMachine } from "./types";

const machine = (over: Partial<CatalogMachine>): CatalogMachine =>
  ({
    id: "m-lumbar",
    name: "LUMBAR",
    movementPattern: "Core: Spine Extension",
    isStudioCustom: false,
    rosterStatus: "active",
    requiresHandoff: false,
    ...over,
  }) as CatalogMachine;

const SET: Preset = { dials: [{ label: "Gap", value: "4" }, { label: "Seat", value: "6" }], unset: 0, state: "set" };
const NONE: Preset = { dials: [], unset: 2, state: "none" };

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

async function mount(ui: React.ReactNode) {
  await act(async () => root.render(<ol>{ui}</ol>));
}

describe("a unit on the floor, mounted", () => {
  it("reads as a trainer walks up to it", async () => {
    await mount(<FloorRow walk={7} machine={machine({ neverToFailure: true })} preset={SET} flagged={false} onOpen={() => {}} />);
    expect(host.querySelector(".mcat-row__walk")?.textContent).toBe("7");
    expect(host.querySelector(".mcat-row__name")?.textContent).toBe("LUMBAR");
    expect(host.querySelector(".wk__row-code")?.textContent).toBe("Lumb");
    expect(host.querySelector(".mcat-row__movement")?.textContent).toBe("Lumbar Extension");
    expect(host.querySelector(".mcat-row__preset")?.textContent).toBe("Gap 4 · Seat 6");
    // The Academy's stop rule reads in the critical crimson, as on My Studio.
    expect(host.querySelector(".wk__badge--alert")?.textContent).toBe("Never to failure");
  });

  it("says each thing once: no Academy name under a floor name that says it", async () => {
    await mount(
      <FloorRow walk={2} machine={machine({ id: "m-leg-press", name: "LEG PRESS" })} preset={SET} flagged={false} onOpen={() => {}} />,
    );
    expect(host.querySelector(".mcat-row__movement")).toBeNull();
    expect(host.querySelector(".wk__row-code")?.textContent).toBe("LP");
  });

  it("carries its lineage's code and name for a studio's copy", async () => {
    await mount(
      <FloorRow
        walk={3}
        machine={machine({ id: "sm-solon-hoist-lp", name: "HOIST", comparisonKey: "m-leg-press", isStudioCustom: true })}
        preset={SET}
        flagged={false}
        onOpen={() => {}}
      />,
    );
    expect(host.querySelector(".wk__row-code")?.textContent).toBe("LP");
    expect(host.querySelector(".mcat-row__movement")?.textContent).toBe("Leg Press");
  });

  it("names a studio's own machine with no lineage for what it is", async () => {
    await mount(
      <FloorRow
        walk={4}
        machine={machine({ id: "sm-solon-sled", name: "SLED", comparisonKey: "sm-solon-sled", isStudioCustom: true })}
        preset={NONE}
        flagged={false}
        onOpen={() => {}}
      />,
    );
    expect(host.querySelector(".wk__row-code")).toBeNull();
    expect(host.querySelector(".mcat-row__movement")?.textContent).toBe("The studio's own machine");
    expect(host.querySelector(".mcat-row__preset")?.className).toContain("mcat-row__preset--none");
    expect(host.querySelector(".mcat-row__preset")?.textContent).toBe("No numbers set for this unit yet");
  });

  it("shows out of service and a flag as cautions, in plum", async () => {
    await mount(
      <FloorRow walk={1} machine={machine({ rosterStatus: "maintenance" })} preset={SET} flagged onOpen={() => {}} />,
    );
    const warn = [...host.querySelectorAll(".wk__badge--warn")].map((b) => b.textContent);
    expect(warn).toEqual(["Out of service", "Flagged"]);
    // Set out of service before reasons existed: the badge, and nothing guessed.
    expect(host.querySelector(".mcat-row__why")).toBeNull();
  });

  it("says why a unit is out of service, and who said so (wave 2)", async () => {
    const outOfService = { reason: "A new cable is on order", by: { uid: "u", name: "Glorfindel of the Golden Flower" }, at: 0 };
    await mount(
      <FloorRow walk={1} machine={machine({ rosterStatus: "maintenance", outOfService })} preset={SET} flagged={false} onOpen={() => {}} />,
    );
    expect(host.querySelector(".mcat-row__why")?.textContent).toBe("A new cable is on order · Glorfindel");
  });

  it("never says a reason for a unit that is back in service", async () => {
    const outOfService = { reason: "A new cable is on order", by: { uid: "u", name: "Glorfindel" }, at: 0 };
    await mount(<FloorRow walk={1} machine={machine({ rosterStatus: "active", outOfService })} preset={SET} flagged={false} onOpen={() => {}} />);
    expect(host.querySelector(".mcat-row__why")).toBeNull();
    expect(host.textContent).not.toContain("cable");
  });

  it("asks about typing on the page before it opens the unit", async () => {
    const onOpen = vi.fn();
    const guard = vi.fn();
    await act(async () =>
      root.render(
        <WikiPageGuardContext.Provider value={guard}>
          <ol>
            <FloorRow walk={1} machine={machine({})} preset={SET} flagged={false} onOpen={onOpen} />
          </ol>
        </WikiPageGuardContext.Provider>,
      ),
    );
    await act(async () => (host.querySelector(".mcat-row") as HTMLButtonElement).click());
    expect(guard).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    guard.mock.calls[0][0]();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
