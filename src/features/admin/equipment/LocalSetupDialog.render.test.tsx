// @vitest-environment jsdom
/**
 * LOCAL SET-UP NEVER CHANGES WHAT A MACHINE IS (Sep 28 2026).
 *
 * Local set-up is the dialog behind a machine's "Local set-up" button (My
 * Studio → Machines, Operations → Floor, Admins → All locations): what this
 * studio calls a Max Strength machine, the unit's maker and serial number,
 * and a note about the unit. Its save used to rebuild the WHOLE roster
 * document (`source: "catalog"`, `basedOn` its own id, `status: "active"`)
 * and write it with setDoc(..., { merge: true }). So:
 *
 *   - on a studio's OWN machine it made the machine a copy of a catalog
 *     machine that does not exist, and useStudioMachines dropped it: off the
 *     floor list, the Active Session and the Catalog, with no way back to it
 *     on screen;
 *   - on a machine marked out of service it put it back in service;
 *   - a box cleared on purpose kept its old value, because a merge keeps
 *     every key the write leaves out (docs/KNOWN-TRAPS.md, "Write a roster
 *     override with updateDoc").
 *
 * Mounted with the real dialog over a small in-memory Firestore that keeps
 * Firestore's own rules for a merge, an update and deleteField(), with the
 * floor read back through the real useStudioMachines, so "stays on the
 * floor" means what a trainer's iPad would show.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Doc = Record<string, unknown>;

const fs = vi.hoisted(() => {
  const DELETE = Symbol("deleteField");
  const docs = new Map<string, Doc>();
  const writes: Array<{ kind: "set" | "update"; path: string; data: Doc; merge: boolean }> = [];
  const listeners = new Set<() => void>();
  const isMap = (v: unknown): v is Doc => typeof v === "object" && v !== null && !Array.isArray(v);
  const clone = (d: Doc): Doc => JSON.parse(JSON.stringify(d));

  /** setDoc(..., { merge: true }): maps merge key by key, all the way down. */
  const merge = (base: Doc, patch: Doc): Doc => {
    const out: Doc = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      if (value === DELETE) delete out[key];
      else if (isMap(value)) out[key] = merge(isMap(out[key]) ? (out[key] as Doc) : {}, value);
      else out[key] = value;
    }
    return out;
  };

  /** updateDoc: every key is a field path, and its value replaces that field whole. */
  const update = (base: Doc, patch: Doc): Doc => {
    const out = clone(base);
    for (const [path, value] of Object.entries(patch)) {
      const keys = path.split(".");
      const last = keys.pop()!;
      let node: Doc | undefined = out;
      for (const key of keys) {
        if (!isMap(node![key])) {
          // Deleting under a map that isn't there is a no-op, not a new map.
          if (value === DELETE) {
            node = undefined;
            break;
          }
          node![key] = {};
        }
        node = node![key] as Doc;
      }
      if (!node) continue;
      if (value === DELETE) delete node[last];
      else node[last] = isMap(value) ? clone(value) : value;
    }
    return out;
  };

  const notify = () => listeners.forEach((l) => l());
  return { DELETE, docs, writes, listeners, merge, update, notify, clone };
});

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  serverTimestamp: () => "now",
  deleteField: () => fs.DELETE,
  onSnapshot: (ref: { path: string }, next: (snap: unknown) => void) => {
    const fire = () =>
      next({
        docs: [...fs.docs.entries()]
          .filter(([p]) => p.startsWith(`${ref.path}/`) && !p.slice(ref.path.length + 1).includes("/"))
          .map(([p, data]) => ({ id: p.split("/").pop(), data: () => fs.clone(data) })),
      });
    fs.listeners.add(fire);
    fire();
    return () => fs.listeners.delete(fire);
  },
  setDoc: async (ref: { path: string }, data: Doc, opts?: { merge?: boolean }) => {
    fs.writes.push({ kind: "set", path: ref.path, data, merge: Boolean(opts?.merge) });
    fs.docs.set(ref.path, fs.merge(opts?.merge ? (fs.docs.get(ref.path) ?? {}) : {}, data));
    fs.notify();
  },
  updateDoc: async (ref: { path: string }, data: Doc) => {
    fs.writes.push({ kind: "update", path: ref.path, data, merge: false });
    const before = fs.docs.get(ref.path);
    if (!before) throw new Error(`No document to update: ${ref.path}`);
    fs.docs.set(ref.path, fs.update(before, data));
    fs.notify();
  },
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-leader" } } }));

const toasts = vi.hoisted(() => [] as string[]);
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({
    success: (m: string) => toasts.push(m),
    error: (m: string) => toasts.push(m),
    info: () => {},
  }),
}));

// The catalog is the Max Strength leg press, as the Academy wrote it.
vi.mock("../../../hooks/useMachineCatalog", async () => {
  const { MACHINE_DEFINITIONS } = await import("../../../data/machine-definitions");
  const legPress = MACHINE_DEFINITIONS["m-leg-press"];
  const catalog = [legPress];
  const byId = { [legPress.id]: legPress };
  return { useMachineCatalog: () => ({ catalog, byId, loading: false, failed: false }) };
});

const { MACHINE_DEFINITIONS } = await import("../../../data/machine-definitions");
const { useStudioMachines } = await import("../../../hooks/useStudioMachines");
const { LocalSetupDialog } = await import("./LocalSetupDialog");
import type { MachineCatalogEntry, MachineDefinition, StudioMachineRosterEntry } from "../../../types/machines";

const LEG_PRESS = MACHINE_DEFINITIONS["m-leg-press"];
const ROSTER = "studios/solon/roster";

/** Solon's own sled: a custom machine, most like the leg press. */
const SLED_DEFINITION = { ...(LEG_PRESS as MachineDefinition), name: "Solon Sled" };
const SLED: Doc = {
  machineId: "sm-solon-sled",
  studioId: "solon",
  source: "custom",
  basedOn: "m-leg-press",
  status: "active",
  definition: SLED_DEFINITION,
};

/** The floor as useStudioMachines resolves it: what every screen draws. */
function Floor() {
  const { machines } = useStudioMachines("solon", { includeInactive: true });
  return (
    <ul data-testid="floor">
      {machines.map((m) => (
        <li
          key={m.machineId}
          data-id={m.machineId}
          data-source={m.source}
          data-lineage={m.comparisonKey}
          data-status={m.rosterStatus}
        >
          {m.name}
        </li>
      ))}
    </ul>
  );
}

let host: HTMLDivElement;
let root: Root;
let closed = 0;

beforeEach(() => {
  fs.docs.clear();
  fs.writes.length = 0;
  toasts.length = 0;
  closed = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  fs.listeners.clear();
});

/**
 * The dialog as the doors open it: the stored entry, and the catalog machine
 * it follows (null for a studio's own machine, as My Studio passes it).
 */
async function open(machineId: string, catalogName: string) {
  const stored = fs.docs.get(`${ROSTER}/${machineId}`)!;
  const entry = { ...fs.clone(stored), machineId, studioId: "solon" } as unknown as StudioMachineRosterEntry;
  const catalog = entry.source === "catalog" ? (LEG_PRESS as MachineCatalogEntry) : null;
  await act(async () => {
    root.render(
      <>
        <Floor />
        <LocalSetupDialog
          studioId="solon"
          machineId={machineId}
          catalogName={catalogName}
          catalog={catalog as never}
          entry={entry as never}
          onClose={() => closed++}
        />
      </>,
    );
  });
}

const floor = () =>
  [...host.querySelectorAll<HTMLLIElement>("[data-testid='floor'] li")].map((li) => ({
    id: li.dataset.id,
    name: li.textContent,
    source: li.dataset.source,
    lineage: li.dataset.lineage,
    status: li.dataset.status,
  }));

const LABELS = ["What this studio calls it", "Manufacturer", "Serial number", "Notes about this unit"] as const;

const field = (label: string) => {
  const f = [...host.querySelectorAll(".adm-field")].find((el) => el.querySelector(".adm-label")?.textContent === label);
  return (f?.querySelector("input, textarea") ?? null) as HTMLInputElement | HTMLTextAreaElement | null;
};

const typeInto = (label: string, value: string) =>
  act(async () => {
    const el = field(label)!;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

const save = () => act(async () => button("Save local setup")!.click());

const stored = (machineId: string) => fs.docs.get(`${ROSTER}/${machineId}`)!;

describe("Local set-up on a studio's own machine", () => {
  it("can't take the machine off the floor, or make it anything but the studio's own", async () => {
    fs.docs.set(`${ROSTER}/sm-solon-sled`, fs.clone(SLED));
    await open("sm-solon-sled", "Solon Sled");
    const sled = { id: "sm-solon-sled", name: "Solon Sled", source: "custom", lineage: "m-leg-press", status: "active" };
    expect(floor()).toContainEqual(sled);

    // Whatever the dialog offers on it, fill it in and save it.
    const typed = { "What this studio calls it": "The Sled", Manufacturer: "Rogue", "Serial number": "RG-12", "Notes about this unit": "Pin sticks." };
    for (const label of LABELS) if (field(label)) await typeInto(label, typed[label]);
    if (button("Save local setup")) await save();

    // Still on the floor, still the studio's own, still most like the leg press.
    expect(floor()).toContainEqual(sled);
    expect(stored("sm-solon-sled")).toMatchObject({
      source: "custom",
      basedOn: "m-leg-press",
      status: "active",
      definition: SLED_DEFINITION,
    });
  });

  it("offers nothing to save, and says where the machine's details are changed", async () => {
    fs.docs.set(`${ROSTER}/sm-solon-sled`, fs.clone(SLED));
    await open("sm-solon-sled", "Solon Sled");

    expect(button("Save local setup")).toBeUndefined();
    for (const label of LABELS) expect(field(label), label).toBeNull();
    expect(host.querySelector("[role='dialog']")?.textContent).toContain("Edit");

    await act(async () => button("Close")!.click());
    expect(closed).toBe(1);
    expect(fs.writes).toEqual([]);
  });
});
