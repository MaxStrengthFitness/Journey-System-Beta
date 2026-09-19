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
  const submissions = [
    { id: "sub1", studioId: "solon", studioName: "Solon", machineId: "sm-solon-sled", definition: { name: "Sled" }, basedOn: "m-leg-press", submittedBy: "lead", submittedByName: "Lee Leader", note: "Everyone loves it.", status: "pending" },
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

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(isAdmin: boolean) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <AdminMachinesTab isAdmin={isAdmin} />
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

describe("Operations → Catalog", () => {
  it("shows the standard set in order and the machines outside it, and a move renumbers in tens", async () => {
    const el = await mount(true);
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
    expect(writes[2].data).toEqual({ submission: { id: "sub1", status: "published" } });
    expect(el.textContent).toContain("--from sm-solon-sled --to m-sled");
  });

  it("Retire asks first, every time — with the count of floors that have it — and writes on the second tap", async () => {
    const el = await mount(true);
    // The Retire button on the Row card: the last one (the creator lists the
    // catalog in defaultOrder, Row is third) and, to be sure, the one whose
    // nearest ancestor with a machine id in it says m-row.
    const retire = [...el.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Retire");
    expect(retire).toHaveLength(3);
    const rowRetire = retire.find((b) => {
      let node: HTMLElement | null = b.parentElement;
      while (node && !node.textContent?.includes("m-")) node = node.parentElement;
      return node?.textContent?.includes("m-row") && !node.textContent.includes("m-chest");
    })!;
    await click(rowRetire);
    expect(writes).toEqual([]);
    const dialog = el.querySelector('[role="alertdialog"]')!;
    expect(dialog.getAttribute("aria-label")).toBe("Retire Row?");
    expect(dialog.textContent).toContain("No studio floor has it today.");
    await click([...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Retire")!);
    expect(writes).toEqual([{ path: "machines/m-row", data: { status: "retired", updatedAt: "now", updatedBy: "admin" } }]);
  });

  it("gives a franchise owner the set to read and no queue, no switches, no New machine", async () => {
    const el = await mount(false);
    expect(el.textContent).not.toContain("Submitted by studios");
    expect(el.querySelector('button[aria-label="Move Chest Press up"]')).toBeNull();
    expect([...el.querySelectorAll("button")].some((b) => b.textContent?.includes("New machine"))).toBe(false);
    expect(el.textContent).toContain("In the standard set");
  });
});
