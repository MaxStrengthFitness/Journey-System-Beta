// @vitest-environment jsdom
/**
 * ALL MSF MACHINES, MOUNTED (wave 2 of the Machine Catalog room, Sep 28
 * 2026). The database had no mounted test of its own (the Catalog's test
 * stands it in); wave 2 gives a movement's page its models (Catalog R4) and
 * head office its view of the standard (R6). Every Firestore-backed hook is
 * stood in for by fixed data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fx = vi.hoisted(() => ({
  models: { state: "off" } as unknown,
  modelsAsked: [] as boolean[],
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }),
}));
vi.mock("../../hooks/useStudioMachines", () => ({
  useStudioMachines: () => ({ rosterEntries: [], loading: false, catalog: [], machines: [], byId: {}, source: "roster", failed: false }),
}));
vi.mock("./hooks", () => ({
  useSharedMachines: () => ({ machines: [], loading: false, error: null }),
  useStudioNameOf: () => null,
}));
vi.mock("../academy/useAcademyContent", () => ({ useAcademyCards: () => null, useAcademyScripts: () => null }));
vi.mock("./NetworkNotes", () => ({ NetworkNotes: () => null }));
vi.mock("../comments", () => ({ CommentsPanel: () => null }));
vi.mock("../catalog/useMachineModels", () => ({
  useMachineModels: (enabled: boolean) => {
    fx.modelsAsked.push(enabled);
    return enabled ? fx.models : { state: "off" };
  },
}));

import { UnsavedChangesProvider } from "../unsaved-changes";
import type { Machine } from "../../types";
import { MachineDatabase, type MachineDatabaseProps } from "./MachineDatabase";

const LEGACY = [
  { id: "m-leg-press", name: "LEG PRESS", order: 1 },
  { id: "m-lumbar", name: "LUMBAR", order: 2 },
] as unknown as Machine[];

const HOIST = { id: "hoist-rocit-lp", brand: "Hoist", model: "ROC-IT Leg Press", movementId: "m-leg-press", dials: ["Seat"], notes: "" };
const NAUTILUS = { id: "nautilus-nitro", brand: "Nautilus", model: "Nitro Plus Leg Press", movementId: "m-leg-press", dials: [], notes: "" };

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  fx.models = { state: "off" };
  fx.modelsAsked = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

/** The Catalog's side of it: a link opens a page once, then the request is cleared. */
function Host({ open, ...props }: Partial<MachineDatabaseProps> & { open?: string }) {
  const [openId, setOpenId] = useState<string | null>(open ?? null);
  return (
    <MachineDatabase
      legacyMachines={LEGACY}
      floor={[]}
      floorSource="roster"
      studioId="solon"
      studioName="Solon"
      authTrainer={null}
      scopeSwitch={null}
      grouping="academy"
      groupingControl={null}
      onOpenFloorMachine={() => {}}
      openMachineId={openId}
      onOpenedMachine={() => setOpenId(null)}
      {...props}
    />
  );
}

async function mount(props: Partial<MachineDatabaseProps> & { open?: string } = {}) {
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <Host {...props} />
      </UnsavedChangesProvider>,
    );
  });
}

describe("a movement's models on its page (Catalog R4)", () => {
  it("reads no models on the index", async () => {
    await mount();
    expect(fx.modelsAsked.every((asked) => asked === false)).toBe(true);
  });

  it("lists each maker's machine for the movement once the records are read", async () => {
    fx.models = { state: "ready", models: [NAUTILUS, HOIST], byId: { [HOIST.id]: HOIST, [NAUTILUS.id]: NAUTILUS } };
    await mount({ open: "m-leg-press" });
    expect(host.querySelector(".wk__h1")?.textContent).toBe("LEG PRESS");
    expect([...host.querySelectorAll(".mcat-models__name")].map((n) => n.textContent)).toEqual([
      "Hoist ROC-IT Leg Press",
      "Nautilus Nitro Plus Leg Press",
    ]);
    // What it is, never where: no count of floors.
    expect(host.querySelector("#models")?.textContent).not.toMatch(/floor/i);
  });

  it("has no Models heading for a movement with none, or while the records can't be read", async () => {
    fx.models = { state: "ready", models: [HOIST], byId: { [HOIST.id]: HOIST } };
    await mount({ open: "m-lumbar" });
    expect(host.querySelector(".wk__h1")?.textContent).toBe("LUMBAR");
    expect(host.querySelector("#models")).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(host);
    fx.models = { state: "unreadable" };
    await mount({ open: "m-leg-press" });
    expect(host.querySelector("#models")).toBeNull();
  });
});
