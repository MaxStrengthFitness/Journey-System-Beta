// @vitest-environment jsdom
/**
 * THE MACHINE TRENDS PANEL MOUNTS.
 *
 * A green typecheck and a green pure-module suite say nothing about whether a
 * component renders — the four-tab profile shipped exactly that combination
 * and threw on the first tap. This file is the check: it mounts the panel
 * against a faked `machineTrends/{id}` document and reads what lands in the
 * DOM.
 *
 * It also pins the two behaviours that cost money or mislead:
 *   - a CLOSED panel reads nothing at all;
 *   - a failed read says "could not be loaded", never "nobody trains here".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t1" } }, functions: {} }));

const reads: string[] = [];
let answer: { exists: boolean; data?: Record<string, unknown>; throws?: boolean } = { exists: false };

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
  getDoc: async (ref: { path: string }) => {
    reads.push(ref.path);
    if (answer.throws) throw new Error("permission-denied");
    return { exists: () => answer.exists, data: () => answer.data };
  },
}));

import { MachineTrendsPanel } from "./MachineTrendsPanel";
import { __resetMachineTrendCache } from "../equipment/useMachineTrend";

let host: HTMLDivElement;
let root: Root;

async function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{node}</StrictMode>);
  });
  // let the read's promise settle
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  reads.length = 0;
  __resetMachineTrendCache();
  answer = { exists: false };
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const full = {
  machineId: "m-compound-row",
  clients: 12,
  sets: 140,
  sessions: 120,
  load: { min: 60, p25: 90, median: 120, p75: 150, max: 220, avg: 124 },
  settings: {
    "chest-pad": {
      "3": { clients: 9, sets: 55, medianBest: 120, byHeight: {} },
      "2": { clients: 2, sets: 8, medianBest: null, byHeight: {} },
    },
  },
  byHeight: { "64": { clients: 6, sets: 44, medianBest: 90 } },
  studios: {},
  windowDays: 90,
  computedAt: "2026-09-14T07:00:00.000Z",
};

describe("MachineTrendsPanel", () => {
  it("reads nothing while the foldable is closed", async () => {
    await mount(<MachineTrendsPanel machineId="m-compound-row" active={false} />);
    expect(reads).toEqual([]);
  });

  it("draws the settings table and the height table once opened", async () => {
    answer = { exists: true, data: full };
    await mount(<MachineTrendsPanel machineId="m-compound-row" active />);
    expect(reads).toEqual(["machineTrends/m-compound-row"]);

    const text = host.textContent ?? "";
    expect(text).toContain("12 clients, 140 sets, 120 sessions in the last 90 days.");
    expect(text).toContain("Best loads run from 60 to 220 lb");
    expect(text).toContain("Chest pad");
    expect(text).toContain("120 lb");
    // The value with two clients keeps its count and withholds its median.
    expect(text).toContain("fewer than 5");
    expect(text).toContain("5'4\"");
    // Never a name, and never a claim we have no sample for.
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("NaN");

    // The busiest value is first in the DOM, not whichever key came back first.
    const rowHeads = Array.from(host.querySelectorAll("tbody th")).map((n) => n.textContent);
    expect(rowHeads.slice(0, 2)).toEqual(["3", "2"]);
  });

  it("says a failed read is unknown, not empty", async () => {
    answer = { exists: false, throws: true };
    await mount(<MachineTrendsPanel machineId="m-compound-row" active />);
    const text = host.textContent ?? "";
    expect(text).toContain("could not be loaded");
    expect(text).not.toContain("Nobody has trained");
  });

  it("says nobody has trained here when the document is absent", async () => {
    answer = { exists: false };
    await mount(<MachineTrendsPanel machineId="m-neck" active />);
    expect(host.textContent ?? "").toContain("Nobody has trained on this machine recently.");
  });

  it("says 'not enough' rather than a load below the minimum sample", async () => {
    answer = { exists: true, data: { ...full, clients: 3, sets: 9, sessions: 8, load: null } };
    await mount(<MachineTrendsPanel machineId="m-abs" active />);
    const text = host.textContent ?? "";
    expect(text).toContain("not enough to say anything about loads yet");
    expect(text).not.toContain("Best loads run");
  });
});
