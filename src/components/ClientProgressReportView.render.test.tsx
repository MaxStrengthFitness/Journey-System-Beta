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

// The report reads the client's InBody variation from ActiveStudioContext
// (client codex, phase 2). This test mounts no studio provider, so it gets
// Max Strength's defaults, which is what the hook answers for a studio it
// cannot see.
vi.mock("../features/inbody/useInBodyVariation", async () => {
  const { DEFAULT_INBODY_VARIATION } = await vi.importActual<
    typeof import("../features/inbody/variation")
  >("../features/inbody/variation");
  return {
    useInBodyVariation: () => DEFAULT_INBODY_VARIATION,
    useInBodyVariationLookup: () => () => DEFAULT_INBODY_VARIATION,
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

/*
 * The session tile the client is handed (Sep 24 2026, lib/history-claims.ts).
 * A twelve-year client used to read "3 Total Sessions · First Session Sep 2"
 * - Journey's count and Journey's first day, printed as her whole story.
 */
describe("ClientProgressReportView — the session tile and a client's past", () => {
  const filed = {
    kind: "report" as const,
    data: {
      clientId: "client-bo",
      status: "Finalized",
      date: "2026-09-20",
      attendance: {
        totalSessions: 3,
        firstSessionDate: "2026-09-02",
        customStartDate: "2026-09-02",
        toggles: { totalSessions: true },
        narrative: "",
      },
    },
  };

  async function mountFor(client: Client, coverage?: "complete" | "partial" | "unknown") {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <ToastProvider>
          <ClientProgressReportView
            client={client}
            coverage={coverage}
            trainer={trainer}
            machines={[]}
            existingReportId="report-of-bo"
            onBack={() => {}}
          />
        </ToastProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("prints 'Total Sessions' and 'First Session' when Journey holds her whole story", async () => {
    nextRead = filed;
    await mountFor(bo, "complete");
    expect(text()).toContain("Total Sessions");
    expect(text()).toContain("First Session");
  });

  it("prints what the window counts for a migrating client, with her recorded sessions before Journey", async () => {
    nextRead = filed;
    const recorded = {
      ...bo,
      priorHistory: { sessions: 412, importedCount: 0, through: "2026-08-31", source: "filemaker" },
    } as Client;
    await mountFor(recorded, "partial");
    expect(text()).not.toContain("Total Sessions");
    expect(text()).not.toContain("First Session");
    expect(text()).toContain("412 before Journey");
    expect(text()).toMatch(/Since/);
  });

  it("claims neither when nobody knows how much of her story is here", async () => {
    nextRead = filed;
    await mountFor(bo);
    expect(text()).not.toContain("Total Sessions");
    expect(text()).not.toContain("First Session");
  });

  it("names the editor's count for what it is, too", async () => {
    nextRead = { kind: "report", data: { ...filed.data, status: "Draft" } };
    await mountFor(bo, "partial");
    expect(text()).toContain("Sessions Attended (Auto-Top)");
    expect(text()).not.toContain("Total Sessions Attended");
    expect(text()).toContain("Blank = All in Journey");
    expect(text()).toContain("Use First in Journey");
  });
});
