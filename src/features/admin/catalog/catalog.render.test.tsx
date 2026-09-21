// @vitest-environment jsdom
/**
 * THE CATALOG TAB MOUNTS — the standard set in order, the queue with a
 * studio's offer open for a decision, and the read-only tab a franchise
 * owner sees. Firestore answers with three catalog machines and one pending
 * submission; writes are recorded, not sent.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "admin" } }, functions: {} }));

const writes: Array<{ path: string; data: Record<string, unknown> }> = [];

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    const path = [...base, ...parts.filter((p) => typeof p === "string")].join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  const snap = (rows: Array<Record<string, unknown>>) => ({
    docs: rows.map((r) => ({ id: String(r.id), data: () => r, exists: () => true })),
    size: rows.length,
    empty: rows.length === 0,
    forEach: (fn: (d: unknown) => void) => rows.forEach((r) => fn({ id: String(r.id), data: () => r })),
    docChanges: () => [],
    metadata: { fromCache: false },
  });
  const machines = [
    { id: "m-leg-press", name: "Leg Press", status: "active", inStandardSet: true, defaultOrder: 10, schemaVersion: 1, movementPattern: "push", anatomicalRegion: "lower" },
    { id: "m-chest", name: "Chest Press", status: "active", inStandardSet: true, defaultOrder: 20, schemaVersion: 1, movementPattern: "push", anatomicalRegion: "upper" },
    { id: "m-row", name: "Row", status: "active", inStandardSet: false, defaultOrder: 30, schemaVersion: 1, movementPattern: "pull", anatomicalRegion: "upper" },
  ];
  // A definition that clears the publish gate (features/admin/catalog/review.ts).
  // It used to be `{ name: "Sled" }` — which is the exact machine the gate now
  // refuses, and the reason the gate exists: every location inherits a catalog
  // entry, so a name and nothing else is twenty wrong setup cards.
  const sledDefinition = {
    name: "Sled",
    anatomicalRegion: "Legs",
    movementPattern: "Lower Body: Compound",
    kinematicClass: "compound-linear",
    primaryMuscles: ["quads"],
    execution: {
      concentricSeconds: 6,
      eccentricSeconds: 6,
      upperTurnaround: { description: "Stop short of lockout." },
      lowerTurnaround: { description: "Reverse before the stack touches." },
      keyCues: ["Heels flat, knees tracking the toes."],
    },
  };
  const submissions = [
    { id: "sub1", studioId: "solon", studioName: "Solon", machineId: "sm-solon-sled", definition: sledDefinition, basedOn: "m-leg-press", submittedBy: "lead", submittedByName: "Lee Leader", note: "Everyone loves it.", status: "pending" },
  ];
  const answer = (path: string) => (path === "machines" ? snap(machines) : path === "catalogSubmissions" ? snap(submissions) : snap([]));
  return {
    collection: ref,
    collectionGroup: ref,
    doc: ref,
    query: (q: { path?: string }) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const t = setTimeout(() => next(answer(target.path)), 0);
      return () => clearTimeout(t);
    },
    getDocs: async (target: { path?: string }) => answer(target?.path ?? ""),
    getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
    setDoc: async (target: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: target.path, data });
    },
    updateDoc: async (target: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: target.path, data });
    },
    writeBatch: () => {
      const ops: Array<{ path: string; data: Record<string, unknown> }> = [];
      return {
        set: (target: { path: string }, data: Record<string, unknown>) => ops.push({ path: target.path, data }),
        update: (target: { path: string }, data: Record<string, unknown>) => ops.push({ path: target.path, data }),
        delete: () => {},
        commit: async () => {
          writes.push(...ops);
        },
      };
    },
    serverTimestamp: () => "now",
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
  };
});

vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));

import { AdminMachinesTab } from "../machines/AdminMachinesTab";
import { StandardTemplateTab } from "../../admins/StandardTemplateTab";
import type { Trainer } from "../../../types";

// Operations overhaul (Sep 19 2026): the standard set moved from the Catalog
// tab to the Admins dashboard's Standard template; the queue and the creator
// stayed on the Catalog. The cases below mount whichever screen holds them.
const who = (isAdmin: boolean) =>
  ({ id: isAdmin ? "admin" : "owner", fullName: isAdmin ? "Ada Admin" : "Own Er", initials: "AA", role: isAdmin ? "Admin" : "FranchiseOwner", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] }) as unknown as Trainer;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(isAdmin: boolean, screen: "catalog" | "template" = "catalog") {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        {screen === "catalog" ? <AdminMachinesTab isAdmin={isAdmin} /> : <StandardTemplateTab authTrainer={who(isAdmin)} studios={[]} activeStudioId="solon" isAdmin={isAdmin} />}
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
};

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  writes.length = 0;
});

describe("Admins → Catalog and the Standard template", () => {
  it("shows the standard set in order and the machines outside it, and a move renumbers in tens", async () => {
    const el = await mount(true, "template");
    const rows = [...el.querySelectorAll(".adm-std__row .adm-std__name")].map((n) => n.textContent);
    expect(rows).toEqual(["Leg Press", "Chest Press", "Row"]);
    expect(el.textContent).toContain("2 machines, in the order a new floor starts in");
    await click(el.querySelector('button[aria-label="Move Chest Press up"]')!);
    expect(writes).toEqual([
      { path: "machines/m-chest", data: { defaultOrder: 10, updatedAt: "now", updatedBy: "admin" } },
      { path: "machines/m-leg-press", data: { defaultOrder: 20, updatedAt: "now", updatedBy: "admin" } },
    ]);
  });

  it("opens a studio's offer, suggests the catalog id, and Publish writes the machine, the decision and the studio's marker — then shows the PC command", async () => {
    const el = await mount(true);
    expect(el.textContent).toContain("1 machine waiting on corporate");
    await click([...el.querySelectorAll(".adm-sub__head")].find((b) => b.textContent?.includes("Sled"))!);
    const idInput = el.querySelector<HTMLInputElement>("#sub-id-sub1")!;
    expect(idInput.value).toBe("m-sled");
    await click([...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Publish to the catalog"))!);
    const paths = writes.map((w) => w.path);
    expect(paths).toEqual(["machines/m-sled", "catalogSubmissions/sub1", "studios/solon/roster/sm-solon-sled"]);
    expect(writes[0].data).toMatchObject({ id: "m-sled", name: "Sled", status: "active", inStandardSet: false, defaultOrder: 40 });
    expect(writes[1].data).toMatchObject({ status: "published", publishedAs: "m-sled" });
    // Nothing was reworded, so the studio's marker stays the plain one.
    expect(writes[2].data).toEqual({ submission: { id: "sub1", status: "published" } });
    expect(el.textContent).toContain("--from sm-solon-sled --to m-sled");
  });

  it("says whose words the catalog is about to adopt, before the tap", async () => {
    // The whole point of the gate. Solon wrote the cadence, the turnarounds
    // and the cues on their own machine; publishing makes those Max
    // Strength's on every floor, and the panel has to say so.
    const el = await mount(true);
    await click([...el.querySelectorAll(".adm-sub__head")].find((b) => b.textContent?.includes("Sled"))!);
    expect(el.textContent).toContain("Publishing makes these Max Strength's words");
    expect(el.textContent).toContain("execution and cadence");
    expect(el.textContent).toContain("Read the machine");
  });

  it("reads the offer against the machine it says it is based on", async () => {
    const el = await mount(true);
    await click([...el.querySelectorAll(".adm-sub__head")].find((b) => b.textContent?.includes("Sled"))!);
    expect(el.textContent).toContain("Leg Press");
    expect(el.textContent).toContain("it differs on");
  });

  it("opens the machine in the catalog editor, where a correction is saved onto the offer and nothing is published", async () => {
    const el = await mount(true);
    await click([...el.querySelectorAll(".adm-sub__head")].find((b) => b.textContent?.includes("Sled"))!);
    await click([...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Read the machine"))!);
    // The catalog editor, on the studio's machine, saying so.
    expect(el.textContent).toContain("Offered by Solon");
    expect(el.textContent).toContain("Nothing here is live");
    expect(el.querySelector(".adm-me")).not.toBeNull();
    expect(writes).toEqual([]);
  });

  it("Retire asks first, every time — with the count of floors that have it — and writes on the second tap", async () => {
    const el = await mount(true);
    // The Retire button on the Row row. The list is ordered by
    // resolveMachineOrder, which leaves these three in defaultOrder, so Row is
    // third. Identified by position rather than by the id in the markup: the
    // raw Firestore id is no longer printed on a row's face (Machine
    // authoring, Sep 2026), and the row says the machine's NAME instead.
    const retire = [...el.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Retire");
    expect(retire).toHaveLength(3);
    const rowRetire = retire[2];
    const rowText = rowRetire.closest(".adm-row")?.textContent ?? "";
    expect(rowText).toContain("Row");
    expect(rowText).not.toContain("Chest Press");
    await click(rowRetire);
    expect(writes).toEqual([]);
    const dialog = el.querySelector('[role="alertdialog"]')!;
    expect(dialog.getAttribute("aria-label")).toBe("Retire Row?");
    expect(dialog.textContent).toContain("No studio floor has it today.");
    await click([...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Retire it")!);
    expect(writes).toEqual([{ path: "machines/m-row", data: { status: "retired", updatedAt: "now", updatedBy: "admin" } }]);
  });

  it("gives a franchise owner the set to read and no queue, no switches, no New machine", async () => {
    const el = await mount(false);
    expect(el.textContent).not.toContain("Submitted by studios");
    expect([...el.querySelectorAll("button")].some((b) => b.textContent?.includes("New machine"))).toBe(false);
    // The rows still say which machines are in the set, read-only.
    expect(el.textContent).toContain("In the standard");
    expect(el.textContent).toContain("Not in the standard");
    const template = await mount(false, "template");
    expect(template.querySelector('button[aria-label="Move Chest Press up"]')).toBeNull();
    expect(template.textContent).toContain("in the order a new floor starts in");
  });
});
