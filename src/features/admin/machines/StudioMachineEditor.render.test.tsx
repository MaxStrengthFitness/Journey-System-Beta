// @vitest-environment jsdom
/**
 * A STUDIO CAN ACTUALLY EDIT ITS MACHINE, and what it writes is a diff.
 *
 * The two doors that did not exist before this round: a custom machine was
 * uneditable once saved, and a catalog machine's local copy could override
 * only its name. These pin the write shape, because getting it wrong is
 * silent — an override that stores a value equal to the catalog's freezes
 * that field, and a correction from head office then reaches every location
 * except the ones that "changed" it to what they were already inheriting.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "leader" } },
}));

const writes: Array<{ kind: string; path: string; data: Record<string, unknown> }> = [];

vi.mock("firebase/firestore", () => ({
  doc: (...parts: unknown[]) => ({
    path: parts.filter((p) => typeof p === "string").join("/"),
  }),
  serverTimestamp: () => "now",
  setDoc: async (t: { path: string }, data: Record<string, unknown>) => {
    writes.push({ kind: "set", path: t.path, data });
  },
  updateDoc: async (t: { path: string }, data: Record<string, unknown>) => {
    writes.push({ kind: "update", path: t.path, data });
  },
}));

const toasts: string[] = [];
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({
    success: (m: string) => toasts.push(m),
    error: (m: string) => toasts.push(m),
    info: () => {},
  }),
}));

const { MACHINE_DEFINITIONS } = await import("../../../data/machine-definitions");
const { StudioMachineEditor } = await import("./StudioMachineEditor");
import type { MachineCatalogEntry, StudioMachineRosterEntry } from "../../../types/machines";

const legPress = MACHINE_DEFINITIONS["m-leg-press"] as MachineCatalogEntry;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(props: Record<string, unknown>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <StudioMachineEditor
          studioId="solon"
          studioName="Solon"
          catalog={[legPress]}
          rosteredIds={new Set()}
          scope="studio"
          backLabel="The floor"
          onBack={() => {}}
          {...(props as any)}
        />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host!;
}

async function type(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function save(el: HTMLElement) {
  const btn = [...el.querySelectorAll("button")].find((b) =>
    /Save changes|Create this machine/.test(b.textContent ?? ""),
  )!;
  await act(async () => btn.click());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
  writes.length = 0;
  toasts.length = 0;
});

const rosterEntry: StudioMachineRosterEntry = {
  machineId: "m-leg-press",
  studioId: "solon",
  source: "catalog",
  basedOn: "m-leg-press",
  status: "active",
};

describe("a studio's copy of a catalog machine", () => {
  it("stores only the line that differs, so the rest keeps inheriting", async () => {
    const el = await mount({
      entry: rosterEntry,
      resolved: legPress,
      catalogEntry: legPress,
    });

    const baseline = el.querySelector("#machine-section-baseline")!;
    await type(
      baseline.querySelector("textarea") as HTMLTextAreaElement,
      "Seat back to P3 — ours is the older frame.",
    );
    await save(el);

    expect(writes).toHaveLength(1);
    const w = writes[0];
    expect(w.path).toBe("studios/solon/roster/m-leg-press");
    // updateDoc, NOT setDoc with merge. Firestore merges maps deeply, so a
    // merge write would keep a key the studio had just reverted.
    expect(w.kind).toBe("update");

    const overrides = w.data.overrides as Record<string, any>;
    // Only the baseline, and inside it only the one line.
    expect(Object.keys(overrides)).toEqual(["universalBaseline"]);
    expect(Object.keys(overrides.universalBaseline)).toEqual(["seatHeightPosition"]);
    expect(overrides.universalBaseline.seatHeightPosition).toContain("older frame");
    // The company's method is nowhere near this write.
    expect(overrides.execution).toBeUndefined();
    expect(overrides.musculature).toBeUndefined();
  });

  it("says in plain English what this floor now differs on", async () => {
    const el = await mount({
      entry: rosterEntry,
      resolved: legPress,
      catalogEntry: legPress,
    });
    const baseline = el.querySelector("#machine-section-baseline")!;
    await type(baseline.querySelector("textarea") as HTMLTextAreaElement, "P3 here.");
    await save(el);
    expect(toasts[0]).toContain("differs from the standard on baseline setup");
    expect(toasts[0]).toContain("everything else still follows it");
  });

  it("writes an empty override set when a studio puts everything back", async () => {
    // The revert path. If this wrote with merge, "use the standard" would
    // appear to work and then silently not.
    const el = await mount({
      entry: { ...rosterEntry, overrides: { name: "Our Leg Press" } },
      resolved: { ...legPress, name: "Our Leg Press" },
      catalogEntry: legPress,
    });

    const identity = el.querySelector("#machine-section-identity")!;
    await type(identity.querySelector("input") as HTMLInputElement, legPress.name);
    await save(el);

    expect(writes[0].data.overrides).toEqual({});
    expect(toasts[0]).toContain("follows the Max Strength standard exactly");
  });
});

describe("a studio's own machine", () => {
  it("creates one with its whole definition and its lineage", async () => {
    const el = await mount({ rosteredIds: new Set<string>() });
    const identity = el.querySelector("#machine-section-identity")!;
    await type(identity.querySelector("input") as HTMLInputElement, "Hammer Sled");
    await save(el);

    expect(writes).toHaveLength(1);
    expect(writes[0].kind).toBe("set");
    expect(writes[0].path).toBe("studios/solon/roster/sm-solon-hammer-sled");
    expect(writes[0].data.source).toBe("custom");
    // Self-contained: nothing is inherited, so the whole definition is stored.
    expect((writes[0].data.definition as any).name).toBe("Hammer Sled");
  });

  it("never re-mints the id when the machine is renamed", async () => {
    // machineId is a foreign key in exerciseLogs, clientMachineSettings and
    // routines, all queried across studios. Re-minting it on a rename would
    // orphan every set ever logged on the machine.
    const custom: StudioMachineRosterEntry = {
      machineId: "sm-solon-hammer-sled",
      studioId: "solon",
      source: "custom",
      status: "active",
      definition: { ...legPress, name: "Hammer Sled" },
    };
    const el = await mount({
      entry: custom,
      resolved: custom.definition,
      rosteredIds: new Set(["sm-solon-hammer-sled"]),
    });

    const identity = el.querySelector("#machine-section-identity")!;
    await type(identity.querySelector("input") as HTMLInputElement, "The Sled");
    await save(el);

    expect(writes[0].kind).toBe("update");
    // The id is the ORIGINAL, not sm-solon-the-sled.
    expect(writes[0].path).toBe("studios/solon/roster/sm-solon-hammer-sled");
    expect(writes[0].data.machineId).toBe("sm-solon-hammer-sled");
    expect((writes[0].data.definition as any).name).toBe("The Sled");
  });

  it("refuses a new machine whose name collides with one already on the floor", async () => {
    const el = await mount({ rosteredIds: new Set(["sm-solon-hammer-sled"]) });
    const identity = el.querySelector("#machine-section-identity")!;
    await type(identity.querySelector("input") as HTMLInputElement, "Hammer Sled");
    await save(el);

    expect(writes).toHaveLength(0);
    // The save bar keeps the edits and says why, rather than a toast that
    // disappears before it is read.
    expect(el.textContent).toContain("already has a machine with that name");
  });
});
