// @vitest-environment jsdom
/**
 * THE PROFILE DRAWS FROM WHAT IT HAS; ONLY A WRITE OR A WRONG SENTENCE WAITS
 * (the Wrap-up round, Oct 6 2026).
 *
 * The lab's A/B of the release found opening a profile slower, and the first
 * reading was that the profile waits for the server to say a client's machine
 * totals document is missing (before the migration, every client). Traced,
 * it doesn't: the Journey tab draws from the client's sessions and their sets
 * (ClientProfileView's own page read), never from the totals, and the lab's
 * extra wait was the emulator answering the previous profile's five set reads
 * in front of the next profile's. These hold that it stays so:
 *
 *   - the profile's totals readers draw at once from the client's own fields
 *     while the totals are loading, and follow when they answer;
 *   - the whole-history backfill, a WRITE, still waits for the answer;
 *   - the Journey tab's grid has no totals gate at all.
 *
 * The other guarded writes keep their own tests: Finish's rollup
 * (lib/sync-utils.finish.test.ts), Start's prefill and Log past session's
 * Save (their `totalsKnown`, held below by source), and the menu's "First
 * time" (MachineMenu.render.test.tsx, useMachineMenuData's totalsUnknown).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-coach" } }, functions: {} }));

let sessionReads = 0;
let commits = 0;

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const path = (...p: unknown[]) => p.filter((x) => typeof x === "string").join("/");
  return {
    ...real,
    collection: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    doc: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    query: (coll: unknown) => coll,
    where: () => ({}),
    getDocs: async (q: { __path?: string }) => {
      if (q?.__path === "sessions") sessionReads += 1;
      return { docs: [], size: 0, empty: true, forEach: () => {} };
    },
    writeBatch: () => ({
      set: () => {},
      update: () => {},
      commit: async () => {
        commits += 1;
      },
    }),
    serverTimestamp: () => ({ __server: true }),
    deleteField: () => ({ __delete: true }),
  };
});

import { useMachineStats, type MachineStatsState } from "../equipment/useMachineStats";
import { withMachineTotals, type MachineTotalsRead } from "./totals";

const LOADING: MachineTotalsRead = { state: "loading", data: null };

let root: Root | null = null;
let host: HTMLElement | null = null;
let seen: MachineStatsState | null = null;

function Probe({ client }: { client: object }) {
  seen = useMachineStats(client as never);
  return <div data-stats={seen.stats ? Object.keys(seen.stats).join(",") : "partial"} />;
}

async function render(client: object) {
  if (!host) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () => {
    root!.render(<Probe client={client} />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  sessionReads = 0;
  commits = 0;
  seen = null;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("the profile's machine figures while the totals are loading", () => {
  it("draw at once from the client's own fields (every client before the migration), with no read and no write", async () => {
    const client = {
      id: "draws-own-1",
      firstName: "Ada",
      machineStats: { "m-leg": { timesPerformed: 40 } },
      machineStatsBackfilledAt: { seconds: 1 },
    };
    await render(withMachineTotals(client, LOADING));
    expect(host!.querySelector("[data-stats]")?.getAttribute("data-stats")).toBe("m-leg");
    expect(sessionReads).toBe(0);
    expect(commits).toBe(0);
  });

  it("follow the totals when they answer, without waiting to draw first", async () => {
    const client = {
      id: "draws-own-2",
      firstName: "Ada",
      machineStats: { "m-leg": { timesPerformed: 40 } },
      machineStatsBackfilledAt: { seconds: 1 },
    };
    await render(withMachineTotals(client, LOADING));
    expect(seen!.stats!["m-leg"].timesPerformed).toBe(40);
    await render(withMachineTotals(client, { state: "ready", data: { machineStats: { "m-leg": { timesPerformed: 2 } } } }));
    // The merge rule: counts summed.
    expect(seen!.stats!["m-leg"].timesPerformed).toBe(42);
  });
});

describe("the whole-history backfill, a write, waits for the totals", () => {
  it("does not read or write while they are loading, and starts once the server says there is no document", async () => {
    // A migrated client: the marker lives in the totals document, so while it loads the profile draws
    // the partial figures from the sessions it has (stats null) and must NOT rebuild the history.
    const client = { id: "backfill-waits-1", firstName: "Bea" };
    await render(withMachineTotals(client, LOADING));
    expect(host!.querySelector("[data-stats]")?.getAttribute("data-stats")).toBe("partial");
    expect(sessionReads).toBe(0);
    await render(withMachineTotals(client, { state: "failed", data: null }));
    expect(sessionReads).toBe(0);
    await render(withMachineTotals(client, { state: "missing", data: null }));
    expect(sessionReads).toBe(1);
  });

  it("never starts for a client whose marker is in the totals document once it answers", async () => {
    const client = { id: "backfill-waits-2", firstName: "Cy" };
    await render(withMachineTotals(client, LOADING));
    await render(withMachineTotals(client, { state: "ready", data: { machineStats: {}, machineStatsBackfilledAt: { seconds: 2 } as never } }));
    expect(sessionReads).toBe(0);
    expect(seen!.stats).toEqual({});
  });
});

describe("the Journey tab has no totals gate", () => {
  const profile = readFileSync(join(__dirname, "../../components/ClientProfileView.tsx"), "utf8");
  const tracker = readFileSync(join(__dirname, "../../components/WorkoutTrackerView.tsx"), "utf8");
  const logPast = readFileSync(join(__dirname, "../client-history/LogPastSessionDialog.tsx"), "utf8");

  it("draws its grid when the client's sessions and sets are read, whatever the totals are doing", () => {
    expect(profile).not.toMatch(/machineTotalsKnown|machineTotalsStateOf|useMachineTotals/);
    const grid = profile.slice(profile.indexOf("<RecentJourneyView"), profile.indexOf("/>", profile.indexOf("<RecentJourneyView")));
    expect(grid).toMatch(/loading=\{isLoadingSessions\}/);
  });

  it("while Start's prefill and Log past session's Save still wait for them", () => {
    expect(tracker).toMatch(/const totalsKnown = !!clientId && selectedClient\?\.id === clientId && machineTotalsKnown\(selectedClient\);/);
    expect(logPast).toMatch(/const totalsKnown = client \? machineTotalsKnown\(client\) : false;/);
  });
});

// Keeps React's import used under the automatic runtime.
void React;
