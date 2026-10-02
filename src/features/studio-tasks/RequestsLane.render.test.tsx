// @vitest-environment jsdom
/**
 * THE ASKS LANE, MOUNTED, WITH THE OPEN-QUESTIONS TRAIL (Relay room, Sep 28
 * 2026): a question about a client names her on its card; a reply and a
 * take-over each go onto her record by the person doing it; a question
 * answered lately keeps its answer on screen. Over a Firestore that refuses
 * undefined the way the real one does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  open: [] as unknown[],
  resolved: [] as unknown[],
  adds: [] as { path: string; data: Record<string, unknown> }[],
  updates: [] as { path: string; data: Record<string, unknown> }[],
  n: 0,
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-beregond" } }, functions: {} }));
vi.mock("./useStudioRequests", () => ({
  useStudioRequests: () => ({ open: state.open, expired: [], recentlyResolved: state.resolved, loading: false, failed: false }),
  useRequestReplies: () => ({ replies: [], loading: false }),
}));
vi.mock("firebase/firestore", () => {
  const hasUndefined = (v: unknown): boolean =>
    v === undefined || (Array.isArray(v) ? v.some(hasUndefined) : v !== null && typeof v === "object" && Object.values(v).some(hasUndefined));
  const ref = (...parts: unknown[]) => ({
    path: parts
      .map((p) => (typeof p === "string" ? p : (p as { path?: string } | null)?.path))
      .filter(Boolean)
      .join("/"),
  });
  return {
    collection: ref,
    doc: ref,
    addDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      if (hasUndefined(data)) throw new Error("Unsupported field value: undefined");
      state.n += 1;
      state.adds.push({ path: r.path, data });
      return { id: `doc${state.n}` };
    },
    updateDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      if (hasUndefined(data)) throw new Error("Unsupported field value: undefined");
      state.updates.push({ path: r.path, data });
    },
    setDoc: async () => {},
    deleteDoc: async () => {},
    writeBatch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
    serverTimestamp: () => "__now__",
    increment: (n: number) => n,
    deleteField: () => "__delete__",
    FieldPath: class {},
    Timestamp: { now: () => "__stamp__", fromDate: (d: Date) => ({ ms: d.getTime() }) },
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: () => () => {},
    getDocs: async () => ({ docs: [] }),
  };
});

import { ToastProvider } from "../../contexts/ToastContext";
import { RequestsLane } from "./RequestsLane";
import { BEREGOND, MABLUNG, ask } from "../relay/board/fixtures";

let root: Root | null = null;
let host: HTMLElement | null = null;

const nancy = { id: "c-nancy", firstName: "Nancy", lastName: "Took" };
const question = ask("q1", {
  kind: "question",
  title: "Nancy isn't feeling her seated dip",
  clientId: "c-nancy",
  threadId: "root-1",
  createdBy: MABLUNG,
});

beforeEach(() => {
  state.open = [question];
  state.resolved = [];
  state.adds = [];
  state.updates = [];
  state.n = 0;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = "";
});

async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <ToastProvider>
        <RequestsLane studioId="s1" author={BEREGOND} currentUserId={BEREGOND.id} clients={[nancy] as never} kinds="asks" title="Asks from teammates" />
      </ToastProvider>,
    );
  });
  return host;
}

const click = async (el: Element | null | undefined) => {
  expect(el, "the thing to tap").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await act(async () => {});
};
const button = (words: string) => [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === words);
const journal = () => state.adds.filter((a) => a.path === "journalEntries");

describe("the asks lane and the open-questions trail", () => {
  it("names the client a question is about, and says it's on her record", async () => {
    await render();
    expect(document.querySelector(".stq__item-client")?.textContent).toBe("About Nancy Took · on her record until it's answered");
  });

  it("puts a reply on the ask and on her record, by the person replying (the Auth uid)", async () => {
    await render();
    await click(button("Reply"));
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Reply to Nancy isn\'t feeling her seated dip"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Lower the seat to 4 and cue the elbows back.");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(document.querySelector(".stq__thread .stq__post"));
    expect(state.adds[0]).toMatchObject({ path: "studios/s1/taskRequests/q1/replies", data: { body: "Lower the seat to 4 and cue the elbows back." } });
    expect(journal()[0].data).toMatchObject({
      threadId: "root-1",
      clientId: "c-nancy",
      authorId: "uid-beregond",
      body: "Lower the seat to 4 and cue the elbows back.",
    });
  });

  it("writes a take-over onto her record", async () => {
    await render();
    await click(button("Take it"));
    expect(state.updates[0]).toMatchObject({ path: "studios/s1/taskRequests/q1", data: { claimedBy: BEREGOND } });
    expect(journal()[0].data).toMatchObject({ body: "Beregond took it on.", authorId: "uid-beregond", threadId: "root-1" });
  });

  it("keeps a closed question's answer on screen, with who answered", async () => {
    state.open = [];
    state.resolved = [
      { ...question, status: "resolved", resolution: "Seat 4, elbows back, slower on the way down.", resolvedBy: BEREGOND, resolvedAt: { toMillis: () => Date.now() } },
    ];
    await render();
    const answered = document.querySelector('[aria-label="Answered lately"]');
    expect(answered?.textContent).toContain("Nancy isn't feeling her seated dip");
    expect(answered?.textContent).toContain("About Nancy Took");
    expect(answered?.querySelector(".stq__answer")?.textContent).toBe("Beregond: Seat 4, elbows back, slower on the way down.");
  });

  it("leaves an ask with no client off every record", async () => {
    state.open = [ask("h1", { kind: "help", title: "A hand now at the Leg Press", createdBy: MABLUNG })];
    await render();
    expect(document.querySelector(".stq__item-client")).toBeNull();
    await click(button("Take it"));
    expect(journal()).toEqual([]);
  });
});
