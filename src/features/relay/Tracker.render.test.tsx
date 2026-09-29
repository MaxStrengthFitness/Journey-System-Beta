// @vitest-environment jsdom
/**
 * THE TRACKER, MOUNTED (Relay room, Sep 28 2026): Relay's second tab over
 * data handed in through its hooks, and a Firestore that refuses undefined
 * the way the real one does. The sorting itself is ./tracker.test.ts; this
 * holds the screen: the lists and their order, "I can't" and its Undo, the
 * Tracking box, a failed read, and who a notification says sent it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  uid: "t-ioreth",
  rows: [] as unknown[],
  templates: [] as unknown[],
  open: [] as unknown[],
  resolved: [] as unknown[],
  jobs: [] as unknown[],
  failed: false,
  updates: [] as { path: string; data: Record<string, unknown> }[],
  adds: [] as { path: string; data: Record<string, unknown> }[],
  calls: [] as string[],
}));

vi.mock("../../firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return { uid: state.uid };
    },
  },
  functions: {},
}));

vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "s1",
    activeStudio: { id: "s1", name: "Westlake", shiftHours: { open: "06:00", mid: "10:00", closing: "16:00", close: "20:00" } },
  }),
}));

vi.mock("../studio-tasks/useStudioTasks", () => ({
  useStudioTasks: () => ({ rows: state.rows, templates: state.templates, loading: false, error: null }),
}));
vi.mock("../studio-tasks/useStudioRequests", () => ({
  useStudioRequests: () => ({ open: state.open, expired: [], recentlyResolved: state.resolved, loading: false, failed: state.failed }),
}));
vi.mock("./jobs/useTeamJobs", () => ({
  useTeamJobs: () => ({ jobs: state.jobs, loading: false, error: null }),
}));
vi.mock("../studio-tasks/useTaskActions", () => ({
  useTaskActions: () => ({
    busyIds: new Set(),
    busy: false,
    complete: async (r: { id: string }) => void state.calls.push(`complete:${r.id}`),
    reopen: async (r: { id: string }) => void state.calls.push(`reopen:${r.id}`),
    completeGroup: async () => {},
    completeMany: async () => {},
    toggleClaim: async () => {},
    toggleClaimGroup: async () => {},
    assign: async () => {},
    closeWithNote: async () => {},
  }),
}));
// The dialogs are mounted for real by relay/planner.render.test; here they
// only need to say whether they are open.
vi.mock("../studio-tasks/TaskManager", () => ({ TaskManager: () => null }));
vi.mock("../studio-tasks/TaskNoteDialog", () => ({ TaskNoteDialog: () => null }));
vi.mock("./jobs/JobSheet", () => ({
  JobSheet: ({ open, job }: { open: boolean; job: { title: string } | null }) => (open ? <div role="dialog">{job?.title}</div> : null),
}));

/** Firestore refuses undefined anywhere in a write; so does this one. */
function hasUndefined(v: unknown): boolean {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.some(hasUndefined);
  if (v && typeof v === "object") return Object.values(v).some(hasUndefined);
  return false;
}
vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    doc: ref,
    collection: ref,
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: () => () => {},
    updateDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      if (hasUndefined(data)) throw new Error("Function updateDoc() called with invalid data. Unsupported field value: undefined");
      state.updates.push({ path: r.path, data });
    },
    addDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      if (hasUndefined(data)) throw new Error("Function addDoc() called with invalid data. Unsupported field value: undefined");
      state.adds.push({ path: r.path, data });
      return { id: "new" };
    },
    setDoc: async () => {},
    deleteDoc: async () => {},
    writeBatch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
    deleteField: () => "__delete__",
    serverTimestamp: () => "__now__",
    arrayUnion: (...v: unknown[]) => ({ union: v }),
    arrayRemove: (...v: unknown[]) => ({ remove: v }),
    increment: (n: number) => n,
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d },
  };
});

import { ToastProvider } from "../../contexts/ToastContext";
import { MyTasksPanel } from "./MyTasksPanel";
import { RelayProvider, type RelayContextValue } from "./board/RelayContext";
import { nowContext } from "./board/now-context";
import { readTracked, resetTracked, trackItem } from "./board/tracked";
import { forgetPersonalMemory } from "../sign-out/memory";
import { BEREGOND, GLORFINDEL, IORETH, MABLUNG, TODAY, ask, job, row, template, trainerDoc } from "./board/fixtures";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T14:18:00-04:00`));
  resetTracked();
  forgetPersonalMemory();
  Object.assign(state, { uid: IORETH.id, rows: [], templates: [], open: [], resolved: [], jobs: [], failed: false, updates: [], adds: [], calls: [] });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const personal = (id: string, extra: Parameters<typeof template>[1] = {}) =>
  template(id, { scope: "personal", ownerId: IORETH.id, kind: "facility", target: { kind: "facility" }, category: "ops", title: id, ...extra });

function relayValue(over: Partial<RelayContextValue> = {}): RelayContextValue {
  return {
    studioId: "s1",
    studioName: "Westlake",
    authTrainer: trainerDoc(IORETH),
    uid: state.uid,
    trainers: [],
    clients: [],
    schedules: [],
    sessions: [],
    machines: [],
    now: nowContext([], 14 * 60 + 18, TODAY),
    canLead: false,
    panel: null,
    openCapture: vi.fn(),
    openPanel: () => {},
    closePanel: () => {},
    openRelayTab: vi.fn(),
    ...over,
  };
}

async function render(relayOver: Partial<RelayContextValue> = {}, trainers = [trainerDoc(IORETH), trainerDoc(BEREGOND), trainerDoc(GLORFINDEL, "StudioLeader")]) {
  const relay = relayValue(relayOver);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <ToastProvider>
        <RelayProvider value={relay}>
          <MyTasksPanel authTrainer={trainerDoc(IORETH)} clients={[]} trainers={trainers} />
        </RelayProvider>
      </ToastProvider>,
    );
  });
  return { relay, h: host };
}

const click = async (el: Element | null | undefined) => {
  expect(el, "the thing to tap").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await act(async () => {});
};
const heads = () => [...document.querySelectorAll(".rtk-main .pl__list-head")].map((h) => (h.textContent ?? "").replace(/\s*\d+$/, "").trim());
const inSection = (id: string) => document.querySelector(`[aria-labelledby="${id}"]`);
const button = (scope: ParentNode | null, words: string) =>
  [...(scope ?? document).querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === words || b.getAttribute("aria-label") === words);
const list = (name: string) => [...document.querySelectorAll<HTMLButtonElement>(".rtk-list")].find((b) => b.querySelector(".rtk-list__t")?.textContent === name);

describe("the Tracker", () => {
  it("sorts Today by when: Handed to you, then Now, then Closing", async () => {
    const chore = template("closing-wipe", { title: "Lumbar Extension wipe" });
    state.rows = [
      row(personal("call-physio", { title: "Call Hugo's physio", timeOfDay: "09:30" }), undefined),
      row(personal("sign-card", { title: "Sign the birthday card", timeOfDay: "17:00" }), undefined),
      row(chore, "lu", "open", { instance: { assignedTo: IORETH, assignedBy: GLORFINDEL } as never }),
    ];
    state.open = [
      ask("report", { kind: "handoff", title: "Finish Hugo's report", createdBy: BEREGOND, forId: IORETH.id, forName: IORETH.name }),
      ask("cover", { kind: "cover", title: "Cover at 4:20", createdBy: MABLUNG, claimedBy: IORETH, dueOn: TODAY }),
    ];
    await render();
    expect(heads()).toEqual(["Handed to you", "Now", "Closing · from 4:00 PM"]);
    const handed = inSection("rtk-handed");
    expect(handed?.textContent).toContain("From Beregond");
    expect(handed?.textContent).toContain("Glorfindel put your name on it");
    // A leader's assignment is simply yours: Done or I can't, never "Take it".
    expect(button(handed, "Take it")).toBeUndefined();
    expect(inSection("rtk-now")?.textContent).toContain("You took it on the Board");
    expect(list("Today")?.getAttribute("aria-pressed")).toBe("true");
    expect(list("Today")?.querySelector(".rtk-list__n")?.textContent).toBe("5");
  });

  it("says I can't on an ask handed to you: back on the board, and Undo puts your name back", async () => {
    state.open = [ask("report", { kind: "handoff", title: "Finish Hugo's report", createdBy: BEREGOND, forId: IORETH.id, forName: IORETH.name })];
    await render();
    await click(button(inSection("rtk-handed"), "I can't"));
    expect(state.updates).toEqual([{ path: "studios/s1/taskRequests/report", data: { forId: "__delete__", forName: "__delete__" } }]);
    expect(document.querySelector(".rbd-undo__t")?.textContent).toBe("Back on the board, for anyone to take.");
    await click(button(document, "Undo"));
    expect(state.updates[1]).toEqual({ path: "studios/s1/taskRequests/report", data: { forId: IORETH.id, forName: IORETH.name } });
  });

  it("steps you off a team job someone put you on, and Undo steps you back on without ringing the poster's bell", async () => {
    state.jobs = [job("cards", { title: "Birthday cards", assignees: [IORETH], assigneeIds: [IORETH.id], createdBy: GLORFINDEL })];
    await render();
    await click(button(inSection("rtk-handed"), "I can't"));
    expect(state.updates[0].path).toBe("studios/s1/teamJobs/cards");
    expect(state.updates[0].data.assigneeIds).toEqual({ remove: [IORETH.id] });
    await click(button(document, "Undo"));
    expect(state.updates[1].data.assigneeIds).toEqual({ union: [IORETH.id] });
    expect(state.adds).toEqual([]);
  });

  it("says when a team job was claimed and finished, in plain words, under the job (Relay's third wave)", async () => {
    const at = (iso: string) => ({ toMillis: () => new Date(iso).getTime() });
    state.jobs = [
      job("cards", {
        title: "Birthday cards",
        assignees: [IORETH],
        assigneeIds: [IORETH.id],
        createdBy: GLORFINDEL,
        claims: { [state.uid]: { name: IORETH.name, trainerId: IORETH.id, at: at(`${TODAY}T10:12:00-04:00`) } },
      }),
      job("mirrors", {
        title: "Mirrors",
        status: "done",
        closedOn: TODAY,
        completedBy: IORETH,
        completedAt: at(`${TODAY}T10:40:00-04:00`),
        claims: { [state.uid]: { name: IORETH.name, trainerId: IORETH.id, at: at(`${TODAY}T10:12:00-04:00`) } },
      }),
    ];
    await render();
    expect(inSection("rtk-handed")?.textContent).toContain("Claimed by you 10:12 AM");
    await click(list("Done"));
    expect(inSection("rtk-done")?.textContent).toContain("Claimed by you 10:12 AM · done 10:40 AM");
  });

  it("asks the team to take a chore a leader named you on (only a leader may take the name off)", async () => {
    const chore = template("closing-wipe", { title: "Lumbar Extension wipe" });
    state.rows = [row(chore, "lu", "open", { machineName: "Lumbar Extension", instance: { assignedTo: IORETH, assignedBy: GLORFINDEL } as never })];
    const { relay } = await render();
    await click(button(inSection("rtk-handed"), "I can't"));
    expect(relay.openCapture).toHaveBeenCalledWith(
      expect.objectContaining({ destination: "floor", askKind: "help", text: expect.stringContaining("Lumbar Extension wipe (Lumbar Extension)") }),
    );
    expect(state.updates).toEqual([]);
  });

  it("closes an ask handed to you and tells the asker, as the signed-in person (the Auth uid, not the older trainer id)", async () => {
    state.uid = "auth-ioreth";
    state.open = [ask("report", { kind: "handoff", title: "Finish Hugo's report", createdBy: BEREGOND, forId: IORETH.id, forName: IORETH.name })];
    await render();
    await click(button(inSection("rtk-handed"), "Done"));
    expect(state.updates[0].path).toBe("studios/s1/taskRequests/report");
    expect(state.updates[0].data.status).toBe("resolved");
    expect(state.adds).toHaveLength(1);
    expect(state.adds[0].path).toBe(`trainers/${BEREGOND.id}/notifications`);
    expect(state.adds[0].data.actor).toEqual({ id: "auth-ioreth", name: IORETH.name });
  });

  it("offers your own to-do on the Board, and hands it to someone only for a leader", async () => {
    state.rows = [row(personal("towels", { title: "Check the towel order", estMinutes: 3 }), undefined)];
    const trainerView = await render();
    await click(button(inSection("rtk-now"), "Offer “Check the towel order” on the Board: anyone at the studio can take it"));
    expect(trainerView.relay.openCapture).toHaveBeenCalledWith(expect.objectContaining({ destination: "floor", text: "Check the towel order", estMinutes: 3 }));
    expect(button(inSection("rtk-now"), "Hand “Check the towel order” to someone at the studio")).toBeUndefined();
    act(() => root?.unmount());
    host?.remove();

    const leaderView = await render({ canLead: true });
    await click(button(inSection("rtk-now"), "Hand “Check the towel order” to someone at the studio"));
    expect(leaderView.relay.openCapture).toHaveBeenCalledWith(expect.objectContaining({ destination: "someone", text: "Check the towel order" }));
  });

  it("walks Coming up, Anytime, Someday and Done, and takes a tick back from Done", async () => {
    const done = row(personal("filed", { title: "Filed Belladonna's note" }), undefined, "done", {
      instance: { status: "done", completedAt: { toMillis: () => new Date(`${TODAY}T13:52:00-04:00`).getTime() } } as never,
    });
    state.rows = [row(personal("neck", { title: "Finish the Neck module", category: "growth" }), undefined), done];
    state.open = [ask("seat", { title: "Spare seat pin", claimedBy: IORETH }), ask("mirror", { title: "Mirror bolts", claimedBy: IORETH, dueOn: "2026-10-01" })];
    await render();

    await click(list("Coming up"));
    expect(document.querySelector(".rtk-main .pl__h2")?.textContent).toBe("Coming up");
    expect(inSection("rtk-coming-taken")?.textContent).toContain("Mirror bolts");
    expect(inSection("rtk-coming-taken")?.textContent).toContain("due Thu");

    await click(list("Anytime"));
    expect(inSection("rtk-anytime")?.textContent).toContain("Spare seat pin");

    await click(list("Someday · Growth"));
    expect(inSection("rtk-someday")?.textContent).toContain("Finish the Neck module");

    await click(list("Done"));
    const doneList = inSection("rtk-done");
    expect(doneList?.textContent).toContain("Filed Belladonna's note");
    expect(doneList?.textContent).toContain("1:52 PM · Your list");
    await click(button(doneList, "Reopen “Filed Belladonna's note”"));
    expect(state.calls).toEqual([`reopen:${done.id}`]);
  });

  it("remembers the list you were on, and a sign-out forgets it", async () => {
    await render();
    await click(list("Done"));
    act(() => root?.unmount());
    host?.remove();
    await render();
    expect(list("Done")?.getAttribute("aria-pressed")).toBe("true");
    act(() => root?.unmount());
    host?.remove();
    forgetPersonalMemory();
    await render();
    expect(list("Today")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("carries what you are tracking, with a door to the Board and a way to stop", async () => {
    trackItem("s1", TODAY, { id: "group:wipe-down:any", title: "Wipe-down round", done: 1, total: 3 });
    const { relay } = await render();
    expect(document.querySelector(".rtk-box__t")?.textContent).toBe("Wipe-down round · 1 of 3");
    await click(button(document.querySelector(".rtk-box"), "Show it on the Board"));
    expect(relay.openRelayTab).toHaveBeenCalledWith("floor");
    await click(button(document.querySelector(".rtk-box"), "Stop tracking"));
    expect(readTracked("s1", TODAY)).toBeNull();
    expect(document.querySelector(".rtk-box__none")?.textContent).toContain("Take a job on the Board");
  });

  it("never calls a list empty when a read failed", async () => {
    state.failed = true;
    await render();
    expect(document.body.textContent).toContain("Some of your list couldn't be loaded");
    expect(document.body.textContent).not.toContain("Nothing on your list today");
  });

  it("answers a question handed to you beside the list: the answer on the ask and on her record, and her thread closes", async () => {
    state.open = [
      ask("q1", { kind: "question", title: "Nancy isn't feeling her seated dip", createdBy: MABLUNG, forId: IORETH.id, forName: IORETH.name, clientId: "c-nancy", threadId: "root-1" }),
    ];
    const openPanel = vi.fn();
    await render({ openPanel, clients: [{ id: "c-nancy", firstName: "Nancy", lastName: "Took" }] as never });
    const handed = inSection("rtk-handed");
    expect(button(handed, "Done")).toBeUndefined();
    await click(button(handed, "Answer"));
    expect(openPanel).toHaveBeenCalledTimes(1);
    const panel = openPanel.mock.calls[0][0] as { kicker: string; foot: ReactElement };
    expect(panel.kicker).toBe("A question for the team");

    // The panel's foot, drawn where the Context Panel would draw it.
    const footHost = document.createElement("div");
    document.body.appendChild(footHost);
    const footRoot = createRoot(footHost);
    await act(async () => footRoot.render(panel.foot));
    const answerButton = [...footHost.querySelectorAll("button")].find((b) => b.textContent?.includes("Answer"))!;
    expect(answerButton.disabled).toBe(true);
    const area = footHost.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your answer"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, "Seat 4, elbows back.");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(answerButton);
    expect(state.updates[0]).toMatchObject({ path: "studios/s1/taskRequests/q1", data: { status: "resolved", resolution: "Seat 4, elbows back." } });
    expect(state.adds.find((a) => a.path === "journalEntries")?.data).toMatchObject({
      body: "Answered: Seat 4, elbows back.",
      authorId: IORETH.id,
      threadId: "root-1",
      clientId: "c-nancy",
    });
    expect(state.updates.find((u) => u.path === "journalEntries/root-1")?.data).toMatchObject({ resolvedAt: expect.anything() });
    act(() => footRoot.unmount());
  });

  it("says so kindly when Today really is empty", async () => {
    await render();
    expect(document.body.textContent).toContain("Nothing on your list today");
    expect(document.body.textContent).toContain("Your own to-dos are yours alone");
  });
});
