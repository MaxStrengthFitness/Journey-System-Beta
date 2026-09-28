// @vitest-environment jsdom
/**
 * SINCE YOU WERE IN, MOUNTED (the second wave of the Relay room, Sep 28
 * 2026): the notice board reads the marker once, marks what came after it,
 * lets a tap mark one seen, and Mark all read moves the marker. Its reads are
 * stood in for here; the rules and sentences are since.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  marker: null as number | null,
  markerFails: false,
  sets: [] as { path: string; data: Record<string, unknown> }[],
  announcements: [] as { id: string; title: string; authorId?: string; authorName?: string; createdAt?: unknown; shortContent?: string }[],
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t-ioreth" } }, functions: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  collection: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  getDoc: async () => {
    if (fake.markerFails) throw Object.assign(new Error("denied"), { code: "permission-denied" });
    return { exists: () => fake.marker !== null, data: () => ({ at: fake.marker }) };
  },
  setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    fake.sets.push({ path: ref.path, data });
  },
  serverTimestamp: () => "__now__",
}));
vi.mock("../../../contexts/ActiveStudioContext", () => ({ useActiveStudio: () => ({ studios: [] }) }));
vi.mock("../../../hooks/useStudioMachines", () => ({
  useStudioMachines: () => ({
    machines: [{ machineId: "hip-add", name: "Hip Adductor" }],
    rosterEntries: [],
  }),
}));
vi.mock("./machine-care-store", () => ({
  useMachineCare: () => ({
    byMachineId: {
      "hip-add": { machineId: "hip-add", flag: { note: "Seat pin sheared.", by: { id: "t-mablung", name: "Mablung Ranger" }, at: Date.parse("2026-09-28T13:10:00Z") } },
    },
    loading: false,
    error: null,
  }),
}));
vi.mock("../../notifications/useHubAnnouncements", () => ({
  useHubAnnouncements: () => ({ announcements: fake.announcements, unread: [], unreadCount: 0 }),
}));

import { SinceYouWereIn } from "./SinceYouWereIn";
import { RelayProvider, type RelayContextValue } from "./RelayContext";
import { nowContext } from "./now-context";
import { resetLastSeen, resetTapped } from "./last-seen";
import { GLORFINDEL, IORETH, TODAY, trainerDoc } from "./fixtures";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  resetLastSeen();
  resetTapped();
  fake.marker = Date.parse("2026-09-27T21:00:00Z");
  fake.markerFails = false;
  fake.sets = [];
  fake.announcements = [
    { id: "a1", title: "Closed Monday, Oct 12 for the holiday", authorId: GLORFINDEL.id, authorName: GLORFINDEL.name, createdAt: Date.parse("2026-09-28T13:02:00Z") },
  ];
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function relayValue(over: Partial<RelayContextValue> = {}): RelayContextValue {
  return {
    studioId: "s1",
    studioName: "Westlake",
    authTrainer: { id: IORETH.id, fullName: IORETH.name } as never,
    uid: IORETH.id,
    trainers: [trainerDoc(GLORFINDEL, "StudioLeader")],
    clients: [{ id: "c-adelard", firstName: "Adelard", lastName: "Took", firstAppointmentDate: TODAY } as never],
    rosterStatus: "ready",
    schedules: [
      {
        id: "b1",
        clientId: "c-adelard",
        clientName: "Adelard Took",
        trainerId: IORETH.id,
        trainerName: IORETH.name,
        startTime: `${TODAY}T15:00:00-04:00`,
        status: "Scheduled",
        studioId: "s1",
      } as never,
    ],
    sessions: [],
    machines: [],
    now: nowContext([], 14 * 60 + 18, TODAY),
    canLead: false,
    panel: null,
    openCapture: () => {},
    openPanel: () => {},
    closePanel: () => {},
    ...over,
  };
}

async function render(over: Partial<RelayContextValue> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <RelayProvider value={relayValue(over)}>
        <SinceYouWereIn rows={[]} jobs={[]} resolved={[]} playbook={[]} />
      </RelayProvider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

const text = () => host?.textContent ?? "";
const button = (label: RegExp) =>
  [...(host?.querySelectorAll("button") ?? [])].find((b) => label.test(b.getAttribute("aria-label") ?? b.textContent ?? "")) as HTMLButtonElement | undefined;

describe("Since you were in", () => {
  it("lists what leadership posted, who is new this week and what was flagged, with the new ones counted", async () => {
    await render();
    expect(text()).toContain("Since you were in");
    expect(text()).toContain("Closed Monday, Oct 12 for the holiday");
    expect(text()).toContain("Studio Leader");
    expect(text()).toContain("Adelard Took · first visit today at 3:00 PM, with you");
    expect(text()).toContain("Seat pin sheared.");
    // The notice and the flag came after the marker; the new client's booking has no arrival time.
    expect(text()).toContain("2 new");
    // The first visit of the session moves the marker to now.
    expect(fake.sets.map((s) => s.path)).toEqual(["studios/s1/lastSeen/t-ioreth"]);
  });

  it("marks one seen on a tap, and all of them with Mark all read, which moves the marker", async () => {
    await render();
    await act(async () => button(/^New: Glorfindel Elf/)!.click());
    expect(text()).toContain("1 new");
    fake.sets = [];
    await act(async () => button(/Mark all read/)!.click());
    expect(text()).toContain("All read");
    expect(fake.sets).toHaveLength(1);
    expect(fake.sets[0].data).toEqual({ at: "__now__", updatedAt: "__now__" });
  });

  it("marks nothing new when the marker can't be read, and says so", async () => {
    fake.markerFails = true;
    await render();
    expect(text()).toContain("Couldn't check when you were last in, so nothing is marked new.");
    expect(text()).toContain("All read");
    expect(fake.sets).toEqual([]);
  });

  it("says it is checking while the studio's clients load, never that nobody is new", async () => {
    await render({ rosterStatus: "loading" });
    expect(text()).toContain("Checking for new clients…");
    expect(text()).not.toContain("Nobody's first visit falls this week.");
  });
});
