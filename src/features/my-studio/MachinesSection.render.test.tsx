// @vitest-environment jsdom
/**
 * THE MACHINE'S DOOR NEVER DROPS TYPING WITHOUT ASKING (voice review
 * follow-up, final review, Sep 27 2026).
 *
 * My Studio → Machines (and Operations → Floor, the same component) opens a
 * machine's door beside the floor list: the studio's settings and the floor's
 * notes, both of which hold typing and are registered with the unsaved-changes
 * guard. The door's own ways out were plain state, so the X, Escape, or a tap
 * on another machine in the list beside it took a half-typed note away without
 * a word (a new machine re-seeded the same card; a close unmounted it). Each
 * now asks the door's leave scope first, and the door is keyed by machine.
 *
 * Mounted with the real section, the real door, the real notes card and the
 * real provider; the floor list is a stand-in that opens a machine the way
 * StudioInventoryManager's Open button does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-sara" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    ...real,
    doc: ref,
    collection: ref,
    onSnapshot: () => () => {},
    setDoc: async () => {},
    serverTimestamp: () => "now",
  };
});
const saved = vi.hoisted(() => ({ notes: vi.fn(async () => {}) }));
vi.mock("../catalog/mutations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../catalog/mutations")>()),
  saveStudioMachineNotes: saved.notes,
}));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudio: { id: "solon", name: "Solon" }, activeStudioId: "solon" }),
}));

const ROSTER = [
  { machineId: "m-chest-press", studioId: "solon", source: "catalog", basedOn: "m-chest-press", status: "active" },
  { machineId: "m-leg-press", studioId: "solon", source: "catalog", basedOn: "m-leg-press", status: "active" },
];
vi.mock("../../hooks/useStudioMachines", () => ({
  useStudioMachines: () => ({
    rosterEntries: ROSTER,
    catalog: [],
    byId: { "m-chest-press": { name: "Chest Press" }, "m-leg-press": { name: "Leg Press" } },
    loading: false,
  }),
}));
vi.mock("../../hooks/useStudioMachineSettings", () => ({ useStudioMachineSettings: () => ({ settingsByMachineId: {} }) }));
vi.mock("../catalog/useStudioMachineNotes", () => ({
  useStudioMachineNotes: () => ({
    notesByMachineId: { "m-chest-press": { notes: "Left pad sticks." }, "m-leg-press": { notes: "Footplate to 3." } },
  }),
}));
vi.mock("../admin/upkeep/useStudioUpkeep", () => ({ useStudioUpkeep: () => ({ events: [], loading: false }) }));
vi.mock("../machine-db/hooks", () => ({ useSharedMachines: () => ({ machines: [], loading: false, error: null }) }));
// The floor list: a row's Open, as StudioInventoryManager draws it.
vi.mock("../admin/machines/StudioInventoryManager", () => ({
  StudioInventoryManager: ({ onOpenMachine }: { onOpenMachine?: (id: string) => void }) => (
    <div>
      <button type="button" onClick={() => onOpenMachine?.("m-chest-press")}>
        Open Chest Press
      </button>
      <button type="button" onClick={() => onOpenMachine?.("m-leg-press")}>
        Open Leg Press
      </button>
    </div>
  ),
}));

import { ToastProvider } from "../../contexts/ToastContext";
import { UnsavedChangesProvider } from "../unsaved-changes";
import { MachinesSection } from "./MachinesSection";

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  saved.notes.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <ToastProvider>
          <MachinesSection authTrainer={null} />
        </ToastProvider>
      </UnsavedChangesProvider>,
    );
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const byText = (label: string) => {
  const b = [...document.body.querySelectorAll("button")].find((x) => x.textContent?.trim() === label || x.getAttribute("aria-label") === label);
  if (!b) throw new Error(`No button "${label}"`);
  return b as HTMLButtonElement;
};
const click = (label: string) => act(async () => byText(label).click());
const door = () => host.querySelector("aside.cp");
const doorTitle = () => door()?.querySelector(".cp__title")?.textContent ?? null;
const notes = () => door()!.querySelector("textarea") as HTMLTextAreaElement;
const type = (value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(notes(), value);
    notes().dispatchEvent(new Event("input", { bubbles: true }));
  });
const question = () => document.body.querySelector("[role='alertdialog']")?.textContent ?? "";
const answer = (a: "keep-editing" | "leave") =>
  act(async () => (document.querySelector(`[data-testid="leave-confirm"] [data-action="${a}"]`) as HTMLButtonElement).click());

describe("the machine's door on My Studio → Machines", () => {
  it("asks before another machine takes a half-typed floor note away", async () => {
    await click("Open Chest Press");
    expect(doorTitle()).toContain("Chest Press");
    await type("Left pad sticks. Use the footstool.");

    await click("Open Leg Press");
    expect(question()).toContain("You have unsaved changes to Solon’s notes on Chest Press.");
    // Nothing moved while the question is up.
    expect(doorTitle()).toContain("Chest Press");

    await answer("keep-editing");
    expect(doorTitle()).toContain("Chest Press");
    expect(notes().value).toBe("Left pad sticks. Use the footstool.");

    await click("Open Leg Press");
    await answer("leave");
    expect(doorTitle()).toContain("Leg Press");
    expect(notes().value).toBe("Footplate to 3.");
    expect(saved.notes).not.toHaveBeenCalled();
  });

  it("asks before the door's X or Escape closes it over typing", async () => {
    await click("Open Chest Press");
    await type("Half a thought");

    await click("Close");
    expect(question()).toContain("Solon’s notes on Chest Press");
    await answer("keep-editing");
    expect(door()).not.toBeNull();
    expect(notes().value).toBe("Half a thought");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(question()).toContain("Solon’s notes on Chest Press");
    await answer("leave");
    expect(door()).toBeNull();
  });

  it("opens, switches and closes without asking while nothing is typed, and the open machine again changes nothing", async () => {
    await click("Open Chest Press");
    await click("Open Chest Press");
    expect(question()).toBe("");
    await click("Open Leg Press");
    expect(question()).toBe("");
    expect(doorTitle()).toContain("Leg Press");
    await click("Close");
    expect(question()).toBe("");
    expect(door()).toBeNull();
  });
});
