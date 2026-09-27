// @vitest-environment jsdom
/**
 * THE SEVEN-DAY GRID READS WITHOUT A MOUSE (voice review follow-up, Sep 27
 * 2026): every square carries its day and count for a screen reader, a
 * one-line legend says what the colours mean, tapping a duty shows each
 * day's count, and the panel's headings sit under Team's h3.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t-lead" } }, functions: {} }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: () => ({}),
  addDoc: async () => ({ id: "new" }),
  setDoc: async () => {},
  updateDoc: async () => {},
  serverTimestamp: () => new Date(),
  Timestamp: { fromDate: (d: Date) => d },
}));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));
const reads = vi.hoisted(() => ({ requestsFor: [] as (string | null)[], submissionsFor: [] as string[] }));
vi.mock("./useStudioRequests", () => ({
  useStudioRequests: (studioId: string | null) => {
    reads.requestsFor.push(studioId);
    return { open: [], expired: [], recentlyResolved: [], loading: false };
  },
}));
vi.mock("./playbook-mutations", () => ({
  watchSubmissions: (_s: string, requestId: string) => {
    reads.submissionsFor.push(requestId);
    return () => {};
  },
}));
vi.mock("./useTaskCompliance", () => ({
  useTaskCompliance: () => ({ rows: [], dateKeys: [], loading: false, error: null, instances: [], machineIds: [], machineNames: {} }),
}));

import type { ComponentProps } from "react";
import type { TaskTemplate } from "./types";
import type { TaskRequest } from "./requests";
import { ManagePanel } from "./ManagePanel";

const template = { id: "close", studioId: "s1", title: "Closing checklist", kind: "facility", category: "ops", target: { kind: "facility" }, recurrence: { type: "daily" }, active: true } as TaskTemplate;
const dateKeys = ["2026-09-14", "2026-09-15", "2026-09-16"];
const compliance = {
  rows: [
    {
      template,
      cells: [
        { dateKey: "2026-09-14", planned: 3, done: 2, flagged: 1 },
        { dateKey: "2026-09-15", planned: 3, done: 3, flagged: 0 },
        { dateKey: "2026-09-16", planned: 0, done: 0, flagged: 0 },
      ],
      dueDays: 2,
      doneDays: 1,
    },
  ],
  dateKeys,
  loading: false,
  error: null,
  instances: [],
  machineIds: [],
  machineNames: {},
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(extra: Partial<ComponentProps<typeof ManagePanel>> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <ManagePanel studioId="s1" templates={[template]} compliance={compliance as never} {...extra} />
      </StrictMode>,
    );
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  reads.requestsFor = [];
  reads.submissionsFor = [];
});

describe("ManagePanel's seven days", () => {
  it("labels every square with its day and count, and says what the colours mean", async () => {
    const el = await mount();
    const squares = [...el.querySelectorAll<HTMLElement>("td .stm__cell")];
    expect(squares.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Monday, Sep 14: 2 of 3 done, 1 with a problem reported",
      "Tuesday, Sep 15: 3 of 3 done",
      "Wednesday, Sep 16: not due",
    ]);
    expect(squares.every((s) => s.getAttribute("role") === "img")).toBe(true);
    const legend = el.querySelector('[data-testid="stm-legend"]')?.textContent ?? "";
    expect(legend).toContain("all done");
    expect(legend).toContain("a problem reported");
    expect(legend).toContain("not due");
  });

  it("shows each day's count one tap away, not only on hover", async () => {
    const el = await mount();
    expect(el.textContent).not.toContain("Mon: 2 of 3 done");
    const duty = [...el.querySelectorAll<HTMLButtonElement>("th button")].find((b) => b.textContent?.includes("Closing checklist"));
    expect(duty?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => duty!.click());
    expect(duty?.getAttribute("aria-expanded")).toBe("true");
    expect(el.textContent).toContain("Mon: 2 of 3 done, 1 with a problem reported · Tue: 3 of 3 done · Wed: not due");
  });

  it("opens no second requests or submissions listener when Team hands it what it reads", async () => {
    const initiative = {
      id: "ini-1",
      kind: "initiative",
      status: "open",
      title: "Five progress reports",
      target: { perTrainer: 5 },
      createdBy: { id: "t-lead", name: "Lee Leader" },
      replyCount: 0,
    } as unknown as TaskRequest;
    const progress = {
      started: 1,
      met: 0,
      expected: 2,
      totalEntries: 3,
      ratio: 0,
      perTrainer: [
        { trainerId: "t-a", trainerName: "Ann Park", count: 3, target: 5, met: false, entries: [] },
        { trainerId: "t-b", trainerName: "Bo Chen", count: 0, target: 5, met: false, entries: [] },
      ],
    };
    const el = await mount({
      requests: { open: [initiative], expired: [] },
      initiativeProgress: new Map([["ini-1", progress]]),
    });
    expect(el.textContent).toContain("Five progress reports");
    expect(el.textContent).toContain("0 of 2 trainers done");
    expect(el.textContent).toContain("Ann Park");
    expect(reads.requestsFor.every((s) => s === null)).toBe(true);
    expect(reads.submissionsFor).toEqual([]);
  });

  it("reads for itself when nothing is handed to it", async () => {
    await mount();
    expect(reads.requestsFor).toContain("s1");
  });

  it("puts its headings under Team's h3", async () => {
    const el = await mount();
    expect(el.querySelectorAll("h2")).toHaveLength(0);
    expect([...el.querySelectorAll("h4")].map((h) => h.textContent)).toEqual(["Studio task list", "Last 7 days", "Team initiatives"]);
  });
});
