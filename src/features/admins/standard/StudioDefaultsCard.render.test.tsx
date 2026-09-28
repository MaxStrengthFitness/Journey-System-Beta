// @vitest-environment jsdom
/**
 * WHERE STUDIOS SET THEIR OWN MOUNTS — one quiet line per default from two
 * studios up, nothing drawn when there is nothing to say, and a floor that
 * couldn't be read named rather than counted.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let floors: Record<string, Array<Record<string, unknown>> | "fails"> = {};
const reads: string[] = [];

vi.mock("../../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  getDocs: async (ref: { path: string }) => {
    reads.push(ref.path);
    const studioId = ref.path.split("/")[1];
    const floor = floors[studioId] ?? [];
    if (floor === "fails") throw new Error("offline");
    return { docs: floor.map((d) => ({ id: String(d.machineId), data: () => d })) };
  },
}));

import { StudioDefaultsCard } from "./StudioDefaultsCard";
import type { Studio } from "../../../types";
import type { MachineCatalogEntry } from "../../../types/machines";

const studios = [
  { id: "solon", name: "Solon" },
  { id: "strongsville", name: "Strongsville" },
  { id: "westlake", name: "Westlake" },
  { id: "demo-studio", name: "Demo Studio", isDemo: true },
] as unknown as Studio[];
const catalog = [{ id: "m-leg-press", name: "Leg Press" }] as unknown as MachineCatalogEntry[];
const seat = (studioId: string) => ({ machineId: "m-leg-press", studioId, source: "catalog", basedOn: "m-leg-press", status: "active", overrides: { universalBaseline: { seatHeightPosition: "P3" } } });

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  floors = {};
  reads.length = 0;
});

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<StudioDefaultsCard studios={studios} catalog={catalog} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

describe("where studios set their own", () => {
  it("reads each real studio's floor once, and says a default two studios changed in one line", async () => {
    floors = { solon: [seat("solon")], strongsville: [seat("strongsville")], westlake: [] };
    const el = await mount();
    expect(reads.sort()).toEqual(["studios/solon/roster", "studios/strongsville/roster", "studios/westlake/roster"]);
    expect([...el.querySelectorAll(".hq-defaults__line")].map((l) => l.textContent)).toEqual([
      "Leg Press: 2 studios set their own seat position (Solon and Strongsville).",
    ]);
    // Quiet: no badge, no mark, sentences only.
    expect(el.querySelector(".adm-badge")).toBeNull();
  });

  it("draws nothing when no default is set differently at two studios", async () => {
    floors = { solon: [seat("solon")] };
    const el = await mount();
    expect(el.textContent).toBe("");
  });

  it("names a floor it couldn't read, never counting it as agreeing", async () => {
    floors = { solon: [seat("solon")], strongsville: "fails" };
    const el = await mount();
    expect(el.textContent).toContain("Couldn't read Strongsville's floor just now, so it is not counted here.");
    expect(el.querySelectorAll(".hq-defaults__line")).toHaveLength(0);
  });
});
