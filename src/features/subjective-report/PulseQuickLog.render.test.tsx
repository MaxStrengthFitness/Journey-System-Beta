// @vitest-environment jsdom
/**
 * Mounts Update Pulse (the quick-log) against a fake Firestore.
 *
 * It proves the whole floor flow: the eight areas draw as tiles with a
 * "when" sentence and never a number of days over 60; picking one shows its
 * three statements on the Dial with the reference document's words; a tap
 * stores the 0–10 anchor (8 for "Often") into the open draft through the
 * same autosave the full Pulse uses; Done goes back to the tiles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: {} }));
vi.mock("../../lib/firestore-errors", () => ({
  OperationType: { GET: "get", CREATE: "create", UPDATE: "update", DELETE: "delete" },
  handleFirestoreError: vi.fn(),
}));

let store: Array<Record<string, any>> = [];
const updateDocCalls: Array<{ path: string; data: any }> = [];
const addDocCalls: any[] = [];

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    collection: (_db: unknown, path: string) => ({ __collection: path }),
    doc: (_db: unknown, ...segments: string[]) => ({ __path: segments.join("/") }),
    query: (coll: any, ...constraints: any[]) => ({ ...coll, constraints }),
    where: (field: string, op: string, value: unknown) => ({ type: "where", field, op, value }),
    orderBy: (field: string, dir: string) => ({ type: "orderBy", field, dir }),
    limit: (n: number) => ({ type: "limit", n }),
    serverTimestamp: () => ({ __serverTime: true }),
    getDocs: async (q: any) => {
      await new Promise((r) => setTimeout(r, 0));
      const wheres = q.constraints.filter((c: any) => c.type === "where");
      const max = q.constraints.find((c: any) => c.type === "limit")?.n ?? Infinity;
      const rows = store.filter((d) => wheres.every((c: any) => (c.field in d ? d[c.field] === c.value : false)));
      return { docs: rows.slice(0, max).map(({ id, ...data }) => ({ id, data: () => data })) };
    },
    updateDoc: async (ref: any, data: any) => {
      updateDocCalls.push({ path: ref.__path, data });
    },
    addDoc: async (_coll: any, data: any) => {
      addDocCalls.push(data);
      return { id: "new-draft" };
    },
    deleteDoc: async () => {},
  };
});

import { PulseQuickLog, touchedSentence } from "./PulseQuickLog";
import { emptyAssessment } from "./scoring";
import { studioTodayKey } from "../../lib/studio-time";
import type { Client, Trainer } from "../../types";

const DAY = 86_400_000;
const daysAgo = (n: number) => studioTodayKey(new Date(Date.now() - n * DAY));
const secondsAgo = (days: number) => ({ seconds: Math.floor((Date.now() - days * DAY) / 1000) });

const client = { id: "judy", firstName: "Judy", lastName: "Daus", weight: "150" } as unknown as Client;
const trainer = { id: "t1", fullName: "AJ", initials: "AJ" } as unknown as Trainer;

let mounted: { root: Root; host: HTMLElement }[] = [];
async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  // Let the fake reads settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  mounted.push({ root, host });
  return host;
}

beforeEach(() => {
  vi.useRealTimers();
  updateDocCalls.length = 0;
  addDocCalls.length = 0;
  const a = emptyAssessment();
  a.answers = { sleepRecovery_1: { value: 5 }, sleepRecovery_2: { value: 5 }, sleepRecovery_3: { value: 5 } };
  store = [
    {
      id: "r1",
      clientId: "judy",
      status: "Finalized",
      isCheckInOnly: true,
      date: daysAgo(20),
      createdAt: secondsAgo(20),
      subjective: { ...a, completedAt: daysAgo(20) },
    },
  ];
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

describe("touchedSentence", () => {
  const now = Date.now();
  it("says when in words, never a count of days past two months", () => {
    expect(touchedSentence("never", undefined, now)).toBe("Never asked");
    expect(touchedSentence("fresh", now - 0.5 * DAY, now)).toBe("Today");
    expect(touchedSentence("fresh", now - 1.2 * DAY, now)).toBe("Yesterday");
    expect(touchedSentence("fresh", now - 3 * DAY, now)).toBe("3 days ago");
    expect(touchedSentence("fresh", now - 21 * DAY, now)).toBe("3 weeks ago");
    expect(touchedSentence("stale", now - 100 * DAY, now)).toBe("3 months ago");
    expect(touchedSentence("stale", now - 400 * DAY, now)).toBe("Over a year ago");
    expect(touchedSentence("unknown", undefined, now)).toBe("History not loaded");
  });
});

describe("PulseQuickLog", () => {
  it("draws the eight areas as tiles with a when-sentence, then one area on the Dial, and stores the anchor", async () => {
    const host = await mount(<PulseQuickLog client={client} trainer={trainer} machines={[]} onOpenFull={() => {}} />);

    const tiles = host.querySelectorAll<HTMLButtonElement>(".pq__tile");
    expect(tiles).toHaveLength(8);
    const sleepTile = Array.from(tiles).find((t) => t.textContent?.includes("Sleep & Recovery"))!;
    expect(sleepTile.querySelector(".pq__tile-when")?.textContent).toBe("3 weeks ago");
    const nutrition = Array.from(tiles).find((t) => t.textContent?.includes("Nutrition"))!;
    expect(nutrition.querySelector(".pq__tile-when")?.textContent).toBe("Never asked");
    expect(host.querySelector(".pq__full")?.textContent).toContain("full Pulse");

    await act(async () => sleepTile.click());
    expect(host.querySelector(".pq__area-title")?.textContent).toBe("Sleep & Recovery");
    const dials = host.querySelectorAll('[data-scale="frequency"]');
    expect(dials).toHaveLength(3);
    // The document's words, all five, under every bar.
    const legend = Array.from(dials[0].querySelectorAll(".rt__legend > span")).map((s) => s.textContent);
    expect(legend).toEqual(["Not at all", "Rarely", "Sometimes", "Often", "Nearly always"]);
    // The living rule: last time's "Sometimes" (5) is NOT pre-filled in a fresh draft.
    expect(dials[0].querySelector('[role="radio"][aria-checked="true"]')).toBeNull();

    // Tap "Often" on the first statement → stored as 8, the v2 anchor.
    const often = dials[0].querySelectorAll<HTMLButtonElement>('[role="radio"]')[3];
    await act(async () => often.click());
    expect(dials[0].querySelector(".rt__word")?.textContent).toBe("Often");

    // Done flushes the draft and goes back to the tiles.
    await act(async () => host.querySelector<HTMLButtonElement>(".pq__done")!.click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(host.querySelectorAll(".pq__tile")).toHaveLength(8);
    const written = addDocCalls[0] ?? updateDocCalls[0]?.data;
    expect(written).toBeTruthy();
    expect(written.subjective.answers.sleepRecovery_1.value).toBe(8);
    expect(written.subjective.answers.sleepRecovery_2).toBeUndefined();
    expect(written.status).toBe("Draft");
  });
});
