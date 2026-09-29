// @vitest-environment jsdom
/**
 * WHAT CHANGED on a standard machine, mounted (catalog wave 3, Sep 29 2026).
 * Three answers — couldn't read, nothing recorded, the list — and a read
 * that happens only while the fold is open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = vi.hoisted(() => ({
  reads: [] as string[],
  docs: [] as Array<{ id: string; data: () => unknown }>,
  fail: false,
}));
// The read is one getDocs of machines/{id}/changes; here it answers from the fixture.
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
    getDocs: async (ref: { path: string }) => {
      store.reads.push(ref.path);
      if (store.fail) throw new Error("refused");
      return { docs: store.docs };
    },
  };
});
vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { MachineChangeLog, MachineChangeLogRead } from "./MachineChangeLog";
import type { MachineChange } from "../machine-codex/change-log";

const at = Date.UTC(2026, 8, 29, 18, 41);
const EDIT: MachineChange = { id: "c2", at, by: { uid: "u", name: "Elrond Peredhel" }, kind: "edited", fields: ["stopRules", "baselineLoad"] };
const MADE: MachineChange = { id: "c1", at: at - 86_400_000, by: { uid: "u", name: "Elrond Peredhel" }, kind: "created", fields: [] };
const PENDING: MachineChange = { id: "c3", at: 0, by: { uid: "u", name: "Elrond Peredhel" }, kind: "edited", fields: ["name"] };

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  store.reads = [];
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("what changed", () => {
  it("lists each save as a sentence with who, what and when, newest first", async () => {
    await act(async () =>
      root.render(<MachineChangeLog read={{ state: "ready", changes: [PENDING, EDIT, MADE] }} tz="America/New_York" />),
    );
    const items = [...host.querySelectorAll(".mcat-changes__item")];
    expect(items.map((i) => i.querySelector(".mcat-changes__what")?.textContent)).toEqual([
      "Elrond Peredhel changed the name.",
      "Elrond Peredhel changed the stop rules and the starting weight.",
      "Elrond Peredhel added it to the catalog.",
    ]);
    expect(items.map((i) => i.querySelector(".mcat-changes__when")?.textContent)).toEqual([
      "Just now, still sending",
      "Sep 29, 2026, 2:41 PM",
      "Sep 28, 2026, 2:41 PM",
    ]);
  });

  it("says a failed read, an empty log and a read in progress apart, and never 'never changed'", async () => {
    await act(async () => root.render(<MachineChangeLog read={{ state: "unreadable" }} />));
    expect(host.textContent).toBe("The change log couldn't be read just now.");
    await act(async () => root.render(<MachineChangeLog read={{ state: "ready", changes: [] }} />));
    expect(host.textContent).toContain("No changes recorded. The log began on Sep 29, 2026");
    expect(host.textContent).not.toMatch(/never/i);
    await act(async () => root.render(<MachineChangeLog read={{ state: "loading" }} />));
    expect(host.textContent).toBe("Reading what changed…");
  });

  it("reads only while its fold is open, once per machine, and a refused read says so", async () => {
    store.docs = [{ id: "c2", data: () => ({ at: { toMillis: () => at }, by: { uid: "u", name: "Elrond Peredhel" }, kind: "edited", fields: ["stopRules"] }) }];
    await act(async () => root.render(<MachineChangeLogRead catalogId="m-leg-press" active={false} />));
    expect(store.reads).toEqual([]);
    expect(host.textContent).toBe("Reading what changed…");
    await act(async () => root.render(<MachineChangeLogRead catalogId="m-leg-press" active={true} />));
    expect(store.reads).toEqual(["machines/m-leg-press/changes"]);
    expect(host.querySelector(".mcat-changes__what")?.textContent).toBe("Elrond Peredhel changed the stop rules.");
    await act(async () => root.render(<MachineChangeLogRead catalogId="m-leg-press" active={true} />));
    expect(store.reads).toHaveLength(1);
    store.fail = true;
    await act(async () => root.render(<MachineChangeLogRead catalogId="m-lumbar" active={true} />));
    expect(host.textContent).toBe("The change log couldn't be read just now.");
    store.fail = false;
  });
});
