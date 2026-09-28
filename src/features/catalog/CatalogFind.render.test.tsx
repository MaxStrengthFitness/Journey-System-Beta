// @vitest-environment jsdom
/**
 * FIND, MOUNTED (Machine Catalog round, Sep 28 2026 — Catalog R1).
 *
 * The rules are tested in find.test.ts; this mounts the field and its results
 * on a small floor and checks what a trainer does with them: types a name the
 * floor never used ("low back"), sees the top match, opens it with Enter, and
 * clears the field back to the list. It also checks the field keeps the
 * iPad's keyboard honest (no autocorrect on machine names) and never takes
 * focus by itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { CatalogFind } from "./CatalogFind";
import { findOnFloor, type FindHit, type FindUnit } from "./find";
import { MOVEMENTS } from "./names";

const unit = (id: string, name: string, over: Partial<FindUnit> = {}): FindUnit => ({
  id,
  name,
  movement: MOVEMENTS[id] ?? null,
  maker: null,
  requiresHandoff: false,
  neverToFailure: false,
  outOfService: false,
  flagged: false,
  muscles: [],
  lines: [],
  ...over,
});

const FLOOR = [
  unit("m-lumbar", "LUMBAR", { neverToFailure: true }),
  unit("m-leg-press", "LEG PRESS", {
    lines: [{ section: "Clinical warnings", text: "Knees never lock. Cue early if the feet slide." }],
  }),
  unit("m-compound-row", "COMPOUND ROW", { requiresHandoff: true }),
];

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

function Harness({ onPick }: { onPick: (hit: FindHit) => void }) {
  const [value, setValue] = useState("");
  const result = value.trim() ? findOnFloor({ query: value, units: FLOOR, studioName: "Solon" }) : null;
  return <CatalogFind value={value} onChange={setValue} result={result} onPick={onPick} />;
}

async function mount(onPick: (hit: FindHit) => void = () => {}) {
  await act(async () => root.render(<Harness onPick={onPick} />));
}

const input = () => host.querySelector("input") as HTMLInputElement;
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const titles = () => [...host.querySelectorAll(".wk__hit-title")].map((t) => t.textContent);

describe("Find on the Catalog, mounted", () => {
  it("is a quiet field until tapped: no results, no focus, no autocorrect", async () => {
    await mount();
    expect(input()).not.toBeNull();
    expect(document.activeElement).not.toBe(input());
    expect(input().getAttribute("autocorrect")).toBe("off");
    expect(input().getAttribute("spellcheck")).toBe("false");
    expect(host.querySelector(".wk__hit")).toBeNull();
  });

  it("finds the Lumbar by a name the floor never used, as the top match", async () => {
    await mount();
    await type("low back");
    expect(host.textContent).toContain("Top match · Enter opens it");
    expect(host.querySelector(".mcat-find__top .wk__hit-title")?.textContent).toBe("LUMBAR");
    expect(host.querySelector(".mcat-find__top .wk__hit-meta")?.textContent).toBe("Lumbar Extension · Lumb");
  });

  it("opens the top match on Enter", async () => {
    const onPick = vi.fn();
    await mount(onPick);
    await type("lumb");
    await act(async () => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ kind: "unit", unitId: "m-lumbar" });
  });

  it("shows a line inside a page as its whole sentence, in its own group", async () => {
    await mount();
    await type("slide");
    expect(host.textContent).toContain("Inside a page");
    expect(host.querySelector(".mcat-find__line")?.textContent).toBe("Cue early if the feet slide.");
  });

  it("offers a switch as a filter, with its count", async () => {
    const onPick = vi.fn();
    await mount(onPick);
    await type("handoff");
    expect(titles()).toContain("Handoff");
    const hit = [...host.querySelectorAll(".wk__hit")].find((b) => b.textContent?.includes("Handoff"));
    await act(async () => (hit as HTMLButtonElement).click());
    expect(onPick.mock.calls[0][0]).toMatchObject({ kind: "filter", filter: { unitIds: ["m-compound-row"] } });
  });

  it("says plainly when nothing goes by that name, and clears back to nothing", async () => {
    await mount();
    await type("zzq");
    expect(host.querySelector(".wk__empty")?.textContent).toBe("Nothing goes by “zzq”.");
    const clear = host.querySelector(".wk__search-clear") as HTMLButtonElement;
    await act(async () => clear.click());
    expect(input().value).toBe("");
    expect(host.querySelector(".wk__empty")).toBeNull();
  });
});
