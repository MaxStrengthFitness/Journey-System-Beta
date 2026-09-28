// @vitest-environment jsdom
/**
 * "STANDARD MACHINE" ON THE MACHINE'S OWN PAGE (wave 2 of the Machine Catalog
 * room, Sep 28 2026). AJ: "a machine just needs to be able to be marked as a
 * standard machine, a task only by admins". Mounted on its own and inside the
 * catalog editor; Firestore writes are recorded, not sent.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// The kit's switch (base-ui) builds a PointerEvent on a click; jsdom has none.
if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === "undefined") {
  (globalThis as { PointerEvent?: unknown }).PointerEvent = class PointerEvent extends MouseEvent {};
}

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-admin" } }, functions: {} }));

const writes: Array<{ kind: string; path: string; data: Record<string, unknown> }> = [];
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    ...real,
    doc: ref,
    collection: ref,
    onSnapshot: () => () => {},
    serverTimestamp: () => "now",
    updateDoc: async (t: { path: string }, data: Record<string, unknown>) => {
      writes.push({ kind: "update", path: t.path, data });
    },
    setDoc: async (t: { path: string }, data: Record<string, unknown>) => {
      writes.push({ kind: "set", path: t.path, data });
    },
  };
});

const toasts: string[] = [];
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ success: (m: string) => toasts.push(m), error: (m: string) => toasts.push(m), info: () => {} }),
}));

// Who is at the page: an administrator unless a test says otherwise.
const who = vi.hoisted(() => ({ isAdmin: true }));
vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useOptionalActiveStudio: () => ({ isAdmin: who.isAdmin }),
  useActiveStudio: () => ({ isAdmin: who.isAdmin, activeStudioId: "solon", activeStudio: { id: "solon", name: "Solon" } }),
}));

import { UnsavedChangesProvider } from "../../unsaved-changes";
import type { MachineCatalogEntry } from "../../../types/machines";
import { StandardMachineSwitch } from "./StandardMachineSwitch";
import { CatalogMachineEditor } from "../machines/CatalogMachineEditor";

const { MACHINE_DEFINITIONS } = await import("../../../data/machine-definitions");

/** The Leg Press as the live catalog holds it, with its flag set as a test says. */
function legPress(flag: boolean | undefined): MachineCatalogEntry {
  const m = { ...(MACHINE_DEFINITIONS["m-leg-press"] as MachineCatalogEntry) };
  if (flag === undefined) delete (m as Partial<MachineCatalogEntry>).inStandardSet;
  else m.inStandardSet = flag;
  return m;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <UnsavedChangesProvider>{node}</UnsavedChangesProvider>
      </StrictMode>,
    );
  });
  return host;
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

const theSwitch = (el: HTMLElement) => el.querySelector("[role='switch']") as HTMLElement | null;
const clickEl = (el: Element) => act(async () => (el as HTMLElement).click());
const dialog = () => document.body.querySelector("[role='alertdialog']");

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  writes.length = 0;
  toasts.length = 0;
  who.isAdmin = true;
});

describe("Standard machine, on the machine's own page", () => {
  it("reads a machine with no flag as a standard machine, as the Standard template does", async () => {
    const el = await mount(<StandardMachineSwitch machine={legPress(undefined)} canEdit />);
    expect(theSwitch(el)?.getAttribute("aria-checked")).toBe("true");
    expect(el.textContent).toContain("Standard machine");
    expect(el.textContent).toContain("A new studio starts with this machine");
  });

  it("asks before taking a machine out, in the Standard template's words, and then writes an explicit false", async () => {
    const el = await mount(<StandardMachineSwitch machine={legPress(true)} canEdit />);
    await clickEl(theSwitch(el)!);
    expect(writes).toEqual([]);
    expect(dialog()?.getAttribute("aria-label")).toBe("Take LEG PRESS out of the standard set?");
    expect(dialog()?.textContent).toContain("no floor loses it");
    await clickEl([...dialog()!.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Take it out")!);
    await settle();
    expect(writes).toEqual([
      { kind: "update", path: "machines/m-leg-press", data: { inStandardSet: false, updatedAt: "now", updatedBy: "uid-admin" } },
    ]);
    expect(toasts).toEqual(["LEG PRESS is out of the standard set. Floors that have it keep it."]);
  });

  it("puts a machine in at once", async () => {
    const el = await mount(<StandardMachineSwitch machine={legPress(false)} canEdit />);
    expect(theSwitch(el)?.getAttribute("aria-checked")).toBe("false");
    expect(el.textContent).toContain("Not in the standard set");
    await clickEl(theSwitch(el)!);
    await settle();
    expect(dialog()).toBeNull();
    expect(writes).toEqual([
      { kind: "update", path: "machines/m-leg-press", data: { inStandardSet: true, updatedAt: "now", updatedBy: "uid-admin" } },
    ]);
  });

  it("offers no switch to anyone but an administrator, and says who marks it", async () => {
    who.isAdmin = false;
    const el = await mount(<StandardMachineSwitch machine={legPress(true)} />);
    expect(theSwitch(el)).toBeNull();
    expect(el.textContent).toContain("An administrator marks a machine as a standard machine.");
    expect(el.querySelector(".adm-badge")?.textContent).toBe("Standard machine");
  });

  it("takes its 40px from the label round the switch", async () => {
    const el = await mount(<StandardMachineSwitch machine={legPress(true)} canEdit />);
    expect(el.querySelector("[data-testid='standard-machine']")?.className).toMatch(/\bmin-h-10\b/);
  });
});

describe("the catalog editor, on a machine that exists", () => {
  const editor = (machine: MachineCatalogEntry) => (
    <CatalogMachineEditor machine={machine} existingIds={["m-leg-press"]} catalogSize={20} onBack={() => {}} />
  );

  it("shows the machine's standing above the sections, from the administrator's own answer", async () => {
    const el = await mount(editor(legPress(true)));
    expect(el.querySelector(".adm-me")).not.toBeNull();
    expect(theSwitch(el)?.getAttribute("aria-checked")).toBe("true");
  });

  it("keeps the switch its own write: taking a machine out writes the flag and nothing else", async () => {
    const el = await mount(editor(legPress(true)));
    await clickEl(theSwitch(el)!);
    await clickEl([...dialog()!.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Take it out")!);
    await settle();
    expect(writes).toHaveLength(1);
    expect(Object.keys(writes[0].data).sort()).toEqual(["inStandardSet", "updatedAt", "updatedBy"]);
  });

  it("has no switch while a new machine is being created", async () => {
    const el = await mount(<CatalogMachineEditor existingIds={[]} catalogSize={20} onBack={() => {}} />);
    expect(theSwitch(el)).toBeNull();
  });
});
