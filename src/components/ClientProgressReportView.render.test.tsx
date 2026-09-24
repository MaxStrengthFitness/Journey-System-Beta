// @vitest-environment jsdom
/**
 * The progress report editor refuses another client's report, MOUNTED
 * (Sep 24 2026).
 *
 * Until then a report left open for one client could come back under the
 * next client's name, and saving wrote to the first client's document. The
 * app no longer hands the editor such a report (report-selection.ts), and
 * this is the defence behind that: the editor reads the report, sees whose
 * it is, and says so in a sentence instead of opening it. It also no longer
 * shows the new-report chooser while a filed report is still being read, or
 * when the read failed — a failed read is "unknown", never "start again".
 *
 * Firestore is faked: `getDoc` hands back whatever the test sets.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../firebase", () => ({
  db: { __fake: true },
  auth: { currentUser: { uid: "uid-jane" } },
}));

type NextRead =
  | { kind: "report"; data: Record<string, unknown> }
  | { kind: "missing" }
  | { kind: "pending" };
let nextRead: NextRead = { kind: "missing" };
const writes: string[] = [];

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const path = (...parts: unknown[]) => parts.filter((p) => typeof p === "string").join("/");
  return {
    ...real,
    collection: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    doc: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts), id: parts[parts.length - 1] }),
    query: (coll: unknown) => coll,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: () => () => {},
    getDocs: async () => ({ docs: [], size: 0, empty: true }),
    getDoc: (ref: { id: string }) => {
      const read = nextRead;
      if (read.kind === "pending") return new Promise(() => {});
      return Promise.resolve({
        id: ref.id,
        exists: () => read.kind === "report",
        data: () => (read.kind === "report" ? read.data : undefined),
      });
    },
    addDoc: async (ref: { __path: string }) => {
      writes.push(ref.__path);
      return { id: "new-report" };
    },
    updateDoc: async (ref: { __path: string }) => {
      writes.push(ref.__path);
    },
    serverTimestamp: () => ({ __server: true }),
  };
});

import { ToastProvider } from "../contexts/ToastContext";
import { ClientProgressReportView } from "./ClientProgressReportView";
import type { Client, Trainer } from "../types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bo = { id: "client-bo", firstName: "Bo", lastName: "Castellanos-Whitfield" } as Client;
const trainer = { id: "t1", fullName: "Alex Rivera", initials: "AR" } as Trainer;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(existingReportId?: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <ToastProvider>
        <ClientProgressReportView
          client={bo}
          trainer={trainer}
          machines={[]}
          existingReportId={existingReportId}
          onBack={() => {}}
        />
      </ToastProvider>,
    );
  });
  // Let the report read settle.
  await act(async () => {
    await Promise.resolve();
  });
}

const text = () => host!.textContent ?? "";

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  writes.length = 0;
});

describe("ClientProgressReportView — whose report it opens", () => {
  it("refuses a report that belongs to another client, and says so", async () => {
    nextRead = {
      kind: "report",
      data: { clientId: "client-ann", status: "Draft", date: "2026-06-01" },
    };
    await mount("report-of-ann");

    expect(text()).toContain("This report is for a different client");
    expect(text()).toContain("Bo Castellanos-Whitfield");
    expect(text()).toContain("Nothing has been changed");
    // Not the chooser, and nothing written.
    expect(text()).not.toContain("Initialize Report");
    expect(writes).toEqual([]);
  });

  it("says it is opening the report while the read is in flight, not 'start a new one'", async () => {
    nextRead = { kind: "pending" };
    await mount("report-of-bo");
    expect(text()).toContain("Opening the report");
    expect(text()).not.toContain("Initialize Report");
  });

  it("says a report that no longer exists could not be found", async () => {
    nextRead = { kind: "missing" };
    await mount("gone");
    expect(text()).toContain("could not be found");
    expect(text()).not.toContain("Initialize Report");
  });

  it("opens this client's own report", async () => {
    nextRead = {
      kind: "report",
      data: { clientId: "client-bo", status: "Draft", date: "2026-06-01" },
    };
    await mount("report-of-bo");
    expect(text()).not.toContain("different client");
    expect(text()).not.toContain("Opening the report");
    expect(text()).not.toContain("Initialize Report");
  });

  it("a new report starts at the chooser, for the client on screen", async () => {
    await mount(undefined);
    expect(text()).toContain("Initialize Report");
    expect(text()).toContain("Bo");
    expect(text()).toContain("Castellanos-Whitfield");
  });
});
