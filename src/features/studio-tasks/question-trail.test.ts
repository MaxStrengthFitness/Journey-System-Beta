/**
 * The open-questions trail (Relay room, Sep 28 2026), over a fake Firestore
 * that refuses undefined the way the real one does. Every line on the
 * client's record is written by the person doing it (their Auth uid), and a
 * record that doesn't take a line never loses what the board already has.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  adds: [] as { path: string; data: Record<string, unknown> }[],
  updates: [] as { path: string; data: Record<string, unknown> }[],
  sets: [] as { path: string; data: Record<string, unknown> }[],
  fail: null as null | ((path: string) => boolean),
  n: 0,
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t-ioreth" } }, functions: {} }));
vi.mock("firebase/firestore", () => {
  const hasUndefined = (v: unknown): boolean =>
    v === undefined || (Array.isArray(v) ? v.some(hasUndefined) : v !== null && typeof v === "object" && Object.values(v).some(hasUndefined));
  const refuse = (path: string, data: unknown) => {
    if (hasUndefined(data)) throw new Error("Unsupported field value: undefined");
    if (state.fail?.(path)) throw new Error("unavailable");
  };
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    collection: ref,
    doc: ref,
    addDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      refuse(r.path, data);
      state.n += 1;
      state.adds.push({ path: r.path, data });
      return { id: `doc${state.n}` };
    },
    updateDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      refuse(r.path, data);
      state.updates.push({ path: r.path, data });
    },
    setDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      refuse(r.path, data);
      state.sets.push({ path: r.path, data });
    },
    deleteDoc: async () => {},
    serverTimestamp: () => "__now__",
    increment: (n: number) => ({ increment: n }),
    deleteField: () => "__delete__",
    FieldPath: class {},
    Timestamp: { now: () => "__stamp__", fromDate: (d: Date) => ({ ms: d.getTime() }) },
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: () => () => {},
    writeBatch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
  };
});

import { BEREGOND, IORETH, MABLUNG, ask } from "../relay/board/fixtures";
import {
  answerAskWithTrail,
  claimAskWithTrail,
  hasTrail,
  journalAuthorOf,
  postQuestion,
  reopenAskWithTrail,
  replyWithTrail,
  trailLine,
} from "./question-trail";

const ioreth = journalAuthorOf("uid-ioreth", IORETH.name)!;
const beregond = journalAuthorOf("uid-beregond", BEREGOND.name)!;
const question = ask("q1", {
  kind: "question",
  title: "Nancy isn't feeling her seated dip",
  clientId: "c-nancy",
  threadId: "root-1",
  createdBy: MABLUNG,
});

beforeEach(() => {
  state.adds = [];
  state.updates = [];
  state.sets = [];
  state.fail = null;
  state.n = 0;
});

const journal = () => state.adds.filter((a) => a.path === "journalEntries");

describe("asking a question about one client", () => {
  it("writes her record's thread first, by the asker, then the ask carrying its id", async () => {
    const out = await postQuestion({
      input: { studioId: "s1", author: { id: "uid-ioreth", name: IORETH.name }, title: "Nancy isn't feeling her seated dip", priority: "low", expiry: "none" },
      client: { id: "c-nancy" },
      question: "Nancy isn't feeling her seated dip\nI couldn't get her to activate it. Can anyone help?",
      who: ioreth,
    });
    expect(out).toEqual({ requestId: "doc2", rootId: "doc1", failed: null });
    const [root, request] = state.adds;
    expect(root.path).toBe("journalEntries");
    expect(root.data).toMatchObject({
      clientId: "c-nancy",
      studioId: "s1",
      kind: "question",
      importance: "elevated",
      authorId: "uid-ioreth",
      authorName: IORETH.name,
      authorInitials: "IH",
      threadId: null,
      resolvedAt: null,
      body: "Nancy isn't feeling her seated dip\nI couldn't get her to activate it. Can anyone help?",
    });
    expect(request.path).toBe("studios/s1/taskRequests");
    expect(request.data).toMatchObject({ kind: "question", clientId: "c-nancy", threadId: "doc1", title: "Nancy isn't feeling her seated dip" });
  });

  it("posts nothing when her record doesn't take the thread, and says so", async () => {
    state.fail = (path) => path === "journalEntries";
    const out = await postQuestion({
      input: { studioId: "s1", author: { id: "uid-ioreth", name: IORETH.name }, title: "Q" },
      client: { id: "c-nancy" },
      question: "Q",
      who: ioreth,
    });
    expect(out).toEqual({ requestId: null, rootId: null, failed: "record" });
    expect(state.adds).toEqual([]);
  });

  it("keeps the thread when the board doesn't take the ask, and a retry makes no second thread", async () => {
    state.fail = (path) => path === "studios/s1/taskRequests";
    const first = await postQuestion({
      input: { studioId: "s1", author: { id: "uid-ioreth", name: IORETH.name }, title: "Q" },
      client: { id: "c-nancy" },
      question: "Q",
      who: ioreth,
    });
    expect(first).toEqual({ requestId: null, rootId: "doc1", failed: "board" });
    state.fail = null;
    const again = await postQuestion({
      input: { studioId: "s1", author: { id: "uid-ioreth", name: IORETH.name }, title: "Q" },
      client: { id: "c-nancy" },
      question: "Q",
      who: ioreth,
      rootId: first.rootId,
    });
    expect(again.failed).toBeNull();
    expect(journal()).toHaveLength(1);
    expect(state.adds[1].data.threadId).toBe("doc1");
  });
});

describe("the trail on her record", () => {
  it("puts a reply on the ask and the same words on the thread, by the person replying", async () => {
    const out = await replyWithTrail({ studioId: "s1", request: question, author: BEREGOND, who: beregond, body: "Lower the seat to 4 and cue the elbows back." });
    expect(out).toBe("written");
    expect(state.adds[0]).toMatchObject({ path: "studios/s1/taskRequests/q1/replies", data: { body: "Lower the seat to 4 and cue the elbows back." } });
    expect(journal()[0].data).toMatchObject({
      threadId: "root-1",
      clientId: "c-nancy",
      kind: "question",
      importance: "standard",
      authorId: "uid-beregond",
      body: "Lower the seat to 4 and cue the elbows back.",
    });
  });

  it("says who took it on, and who handed it back", async () => {
    await claimAskWithTrail({ studioId: "s1", request: question, author: BEREGOND, claimed: true, who: beregond });
    await claimAskWithTrail({ studioId: "s1", request: question, author: BEREGOND, claimed: false, who: beregond });
    expect(state.updates.map((u) => u.data.claimedBy)).toEqual([BEREGOND, null]);
    expect(journal().map((j) => [j.data.body, j.data.authorId])).toEqual([
      ["Beregond took it on.", "uid-beregond"],
      ["Beregond handed it back.", "uid-beregond"],
    ]);
  });

  it("writes the answer by the person answering, then closes the thread", async () => {
    const out = await answerAskWithTrail({ studioId: "s1", request: question, author: BEREGOND, answer: "Seat 4, elbows back, slower on the way down.", who: beregond });
    expect(out).toBe("written");
    expect(state.updates[0]).toMatchObject({ path: "studios/s1/taskRequests/q1", data: { status: "resolved", resolution: "Seat 4, elbows back, slower on the way down." } });
    expect(journal()[0].data).toMatchObject({ body: "Answered: Seat 4, elbows back, slower on the way down.", authorId: "uid-beregond", threadId: "root-1" });
    expect(state.updates[1]).toEqual({ path: "journalEntries/root-1", data: { resolvedAt: "__stamp__", updatedAt: "__now__" } });
  });

  it("says so when a question is closed with no answer", async () => {
    await answerAskWithTrail({ studioId: "s1", request: question, author: IORETH, answer: "", who: ioreth });
    expect(state.updates[0].data).not.toHaveProperty("resolution");
    expect(journal()[0].data.body).toBe("Ioreth closed it without an answer.");
  });

  it("opens the ask and the thread again, and says who", async () => {
    const out = await reopenAskWithTrail({ studioId: "s1", request: question, who: ioreth });
    expect(out).toBe("written");
    expect(state.updates[0]).toMatchObject({ path: "studios/s1/taskRequests/q1", data: { status: "open" } });
    expect(state.updates[1]).toEqual({ path: "journalEntries/root-1", data: { resolvedAt: null, updatedAt: "__now__" } });
    expect(journal()[0].data.body).toBe("Ioreth opened it again.");
  });

  it("writes nothing on any record for an ask with no thread", async () => {
    const plain = ask("a1", { kind: "help", title: "A hand at the Leg Press" });
    expect(hasTrail(plain)).toBe(false);
    expect(await claimAskWithTrail({ studioId: "s1", request: plain, author: BEREGOND, claimed: true, who: beregond })).toBe("none");
    expect(await answerAskWithTrail({ studioId: "s1", request: plain, author: BEREGOND, answer: "Done", who: beregond })).toBe("none");
    expect(journal()).toEqual([]);
  });

  it("never throws when the record doesn't take a line: the board keeps what it has", async () => {
    state.fail = (path) => path === "journalEntries";
    const out = await replyWithTrail({ studioId: "s1", request: question, author: BEREGOND, who: beregond, body: "Try seat 4." });
    expect(out).toBe("failed");
    expect(state.adds.map((a) => a.path)).toEqual(["studios/s1/taskRequests/q1/replies"]);
    expect(await trailLine(question, null, "no one signed in")).toBe("failed");
  });

  it("names the writer by the Auth uid, or not at all", () => {
    expect(journalAuthorOf(null, IORETH.name)).toBeNull();
    expect(journalAuthorOf("uid-x", "Imrahil Prince", "ip")).toEqual({ id: "uid-x", initials: "IP", fullName: "Imrahil Prince" });
    expect(journalAuthorOf("uid-y", "")).toEqual({ id: "uid-y", initials: "AT", fullName: "A trainer" });
  });
});
