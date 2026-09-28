// @vitest-environment jsdom
/**
 * HEAD OFFICE'S OWN NAMES FOR A MACHINE (wave 2 of the Machine Catalog room,
 * Sep 28 2026): on the machine's page in the catalog editor, added and taken
 * off at once, refused in words when a name says nothing new or already
 * means another movement. Firestore writes are recorded, not sent.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-admin" } }, functions: {} }));

const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    ...real,
    doc: ref,
    collection: ref,
    onSnapshot: () => () => {},
    serverTimestamp: () => "now",
    arrayUnion: (...v: unknown[]) => ({ union: v }),
    arrayRemove: (...v: unknown[]) => ({ remove: v }),
    updateDoc: async (t: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: t.path, data });
    },
  };
});

const toasts: string[] = [];
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ success: (m: string) => toasts.push(m), error: (m: string) => toasts.push(m), info: () => {} }),
}));

const who = vi.hoisted(() => ({ isAdmin: true, catalog: [] as unknown[] }));
vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useOptionalActiveStudio: () => ({ isAdmin: who.isAdmin }),
}));
vi.mock("../../../hooks/useMachineCatalog", () => ({
  useMachineCatalog: () => ({ catalog: who.catalog, byId: {}, loading: false, failed: false }),
}));

import { UnsavedChangesProvider } from "../../unsaved-changes";
import type { MachineCatalogEntry } from "../../../types/machines";
import { MachineAliases, movementIdOfCatalogMachine } from "./MachineAliases";

const lumbar = (aliases?: string[]) =>
  ({ id: "m-lumbar", name: "LUMBAR", status: "active", inStandardSet: true, ...(aliases ? { aliases } : {}) }) as unknown as MachineCatalogEntry;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(machine: MachineCatalogEntry) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <UnsavedChangesProvider>
          <MachineAliases machine={machine} />
        </UnsavedChangesProvider>
      </StrictMode>,
    );
  });
  return host;
}

const input = (el: HTMLElement) => el.querySelector("input") as HTMLInputElement;
async function type(el: HTMLElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(el), value);
    input(el).dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const button = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label) as
    | HTMLButtonElement
    | undefined;
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  writes.length = 0;
  toasts.length = 0;
  who.isAdmin = true;
  who.catalog = [];
});

describe("head office's own names on a machine's page", () => {
  it("shows the names Find already knows from the code, and head office's own", async () => {
    const el = await mount(lumbar(["Bad Back Box"]));
    const badges = [...el.querySelectorAll(".adm-badge")].map((b) => b.textContent);
    expect(badges).toEqual(expect.arrayContaining(["Lumbar Extension", "LUMBAR", "Low Back"]));
    expect(el.querySelector(".adm-rows")?.textContent).toContain("Bad Back Box");
  });

  it("adds a name at once, tidied, and says Find knows it", async () => {
    const el = await mount(lumbar());
    expect(el.textContent).toContain("None yet.");
    await type(el, "  Bad   Back Box ");
    await act(async () => button(el, "Add")!.click());
    await settle();
    expect(writes).toEqual([
      { path: "machines/m-lumbar", data: { aliases: { union: ["Bad Back Box"] }, updatedAt: "now", updatedBy: "uid-admin" } },
    ]);
    expect(input(el).value).toBe("");
    expect(toasts).toEqual(["Find knows “Bad Back Box” for Lumbar Extension now, on every floor."]);
  });

  it("refuses a name that says nothing new, or means another movement, and writes nothing", async () => {
    const el = await mount(lumbar());
    await type(el, "low back");
    await act(async () => button(el, "Add")!.click());
    expect(el.querySelector(".adm-hint--error")?.textContent).toBe("Find already knows “low back” for Lumbar Extension.");
    await type(el, "Torso Arm");
    // Typing again clears the old sentence until the next try.
    expect(el.querySelector(".adm-hint--error")).toBeNull();
    await act(async () => button(el, "Add")!.click());
    expect(el.querySelector(".adm-hint--error")?.textContent).toBe("“Torso Arm” already means Pulldown.");
    expect(writes).toEqual([]);
  });

  it("checks another movement's head office names too", async () => {
    who.catalog = [{ id: "m-abs", aliases: ["The Box"] }];
    const el = await mount(lumbar());
    await type(el, "the box");
    await act(async () => button(el, "Add")!.click());
    expect(el.querySelector(".adm-hint--error")?.textContent).toBe("“the box” already means Abdominals.");
  });

  it("takes a name off at once", async () => {
    const el = await mount(lumbar(["Bad Back Box"]));
    await act(async () => button(el, "Take “Bad Back Box” off")!.click());
    await settle();
    expect(writes).toEqual([
      { path: "machines/m-lumbar", data: { aliases: { remove: ["Bad Back Box"] }, updatedAt: "now", updatedBy: "uid-admin" } },
    ]);
  });

  it("offers nothing to change to anyone but an administrator", async () => {
    who.isAdmin = false;
    const el = await mount(lumbar(["Bad Back Box"]));
    expect(input(el)).toBeNull();
    expect(button(el, "Take “Bad Back Box” off")).toBeUndefined();
    expect(el.textContent).toContain("Bad Back Box");
  });

  it("isn't drawn for a catalog machine that is none of the twenty", async () => {
    expect(movementIdOfCatalogMachine({ id: "m-hip-sled" })).toBeNull();
    expect(movementIdOfCatalogMachine({ id: "m-lumbar" })).toBe("m-lumbar");
    const el = await mount({ id: "m-hip-sled", name: "Hip Sled" } as unknown as MachineCatalogEntry);
    expect(el.innerHTML).toBe("");
  });
});
