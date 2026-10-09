import { beforeEach, describe, expect, it, vi } from "vitest";

/* The two writes of settings held on an open session (the open session
   round, Oct 9 2026; AJ's "3a"): the card's Save keeps them on the session
   in one update, and Assign moves each machine to the client in the
   assign's own batch, writing only the dials it set; the journal copies and
   the fit rows go only once that batch has committed (the review). */

const w = vi.hoisted(() => ({
  updates: [] as { path: string; args: unknown[] }[],
  queued: [] as Record<string, unknown>[],
  copies: [] as string[],
  saveThrowsFor: null as string | null,
  nothingFor: null as string | null,
}));

vi.mock("../../firebase", () => ({ db: { __fake: true } }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...p: string[]) => ({ __path: p.join("/") }),
  updateDoc: (ref: { __path: string }, ...args: unknown[]) => {
    w.updates.push({ path: ref.__path, args });
    return Promise.resolve();
  },
  serverTimestamp: () => ({ __server: true }),
  FieldPath: class {
    parts: string[];
    constructor(...parts: string[]) {
      this.parts = parts;
    }
  },
}));
vi.mock("../equipment/mutations", () => ({
  queueSettingsSave: (batch: unknown, args: Record<string, unknown>) => {
    if (args.machineId === w.saveThrowsFor) throw new Error("names its client");
    w.queued.push({ ...args, batch });
    if (args.machineId === w.nothingFor) return null;
    return { result: {}, afterCommit: () => w.copies.push(String(args.machineId)) };
  },
}));

import { keepHeldSetup, queueHeldMoves } from "./held-store";
import { heldMoves, type MoveField } from "./held-setup";

const SEAT: MoveField = { key: "seat", label: "Seat", type: "text", ghost: null, absolute: false };
const author = { id: "uid-coach", fullName: "Jane Coach", initials: "JC" };
const journal = { studioId: "solon", origin: "in_session" as const, sessionId: "sess-open", sessionNumber: 12, sessionDay: "2026-10-09" };

beforeEach(() => {
  w.updates.length = 0;
  w.queued.length = 0;
  w.copies.length = 0;
  w.saveThrowsFor = null;
  w.nothingFor = null;
});

describe("keepHeldSetup: the card's Save in an open session", () => {
  it("is ONE update of the session, at the machine's own field, signed with the Auth uid and the server's time", async () => {
    await keepHeldSetup({ sessionId: "sess-open", machineId: "m-leg-press", values: { seat: " 12 ", backPad: "" }, byUid: "uid-coach" });
    expect(w.updates).toEqual([
      {
        path: "sessions/sess-open",
        args: [{ "heldSetup.m-leg-press": { values: { seat: "12" }, at: { __server: true }, byUid: "uid-coach" } }],
      },
    ]);
  });

  it("keeps a suggested value's source beside it, and never a typed one", async () => {
    await keepHeldSetup({
      sessionId: "sess-open",
      machineId: "m-leg-press",
      values: { seat: "6", backPad: "3" },
      sources: { seat: "suggested", backPad: "typed" },
      byUid: "uid-coach",
    });
    expect(w.updates[0].args[0]).toEqual({
      "heldSetup.m-leg-press": { values: { seat: "6", backPad: "3" }, sources: { seat: "suggested" }, at: { __server: true }, byUid: "uid-coach" },
    });
  });

  it("names the field with a FieldPath for an id a dotted path can't carry", async () => {
    await keepHeldSetup({ sessionId: "sess-open", machineId: "odd.id", values: { seat: "12" }, byUid: "uid-coach" });
    const [update] = w.updates;
    expect((update.args[0] as { parts: string[] }).parts).toEqual(["heldSetup", "odd.id"]);
    expect(update.args[1]).toMatchObject({ values: { seat: "12" } });
  });

  it("writes nothing without a session", async () => {
    await expect(keepHeldSetup({ sessionId: "", machineId: "m", values: {}, byUid: "u" })).rejects.toThrow();
    expect(w.updates).toEqual([]);
  });
});

describe("queueHeldMoves: Assign", () => {
  const moves = heldMoves({
    held: { "m-leg-press": { seat: "12" }, "m-chest": { seat: "3" } },
    sources: { "m-chest": { seat: "suggested" } },
    onFile: { "m-leg-press": { settings: { seat: "4", backPad: "3" } } },
    serverAnswered: true,
    fieldsOf: () => [SEAT],
  });
  const batch = { __batch: true } as never;

  it("puts each machine's save for the client into the assign's batch, only the dials it set, by name", () => {
    const out = queueHeldMoves(batch, { clientId: "c-judy", moves, nameOf: (id) => id.toUpperCase(), author, journal, homeStudioId: "solon" });
    expect(out.queued).toEqual(["m-chest", "m-leg-press"]);
    expect(out.failed).toEqual([]);
    expect(w.queued).toHaveLength(2);
    for (const s of w.queued) {
      expect(s.clientId).toBe("c-judy");
      expect(s.batch).toBe(batch);
      expect(s.dialsOnly).toBe(true);
      expect(s.writeDials).toEqual(["seat"]);
      expect(s.author).toEqual(author);
      expect(s.journal).toEqual(journal);
      expect(s.homeStudioId, "the server answered: the fit row is written").toBe("solon");
    }
    const leg = w.queued.find((s) => s.machineId === "m-leg-press")!;
    expect(leg).toMatchObject({ saved: { seat: "4", backPad: "3" }, draft: { seat: "12", backPad: "3" }, isInitialSetup: false, machineName: "M-LEG-PRESS" });
    const chest = w.queued.find((s) => s.machineId === "m-chest")!;
    expect(chest).toMatchObject({ saved: {}, draft: { seat: "3" }, isInitialSetup: true, changedSources: { seat: "suggested" } });
  });

  it("signs a move by whoever kept it, when that isn't the trainer choosing the client (a take-over)", () => {
    const keeper = { id: "uid-first", fullName: "First Trainer", initials: "FT" };
    queueHeldMoves(batch, {
      clientId: "c-judy",
      moves,
      nameOf: () => "",
      author,
      authorOf: (machineId) => (machineId === "m-chest" ? keeper : null),
      journal,
      homeStudioId: "solon",
    });
    expect(w.queued.find((s) => s.machineId === "m-chest")!.author).toEqual(keeper);
    expect(w.queued.find((s) => s.machineId === "m-leg-press")!.author).toEqual(author);
  });

  it("issues nothing outside the batch until afterCommit, then each move's journal copy and fit row", () => {
    const out = queueHeldMoves(batch, { clientId: "c-judy", moves, nameOf: () => "", author, journal, homeStudioId: "solon" });
    expect(w.copies, "before the commit").toEqual([]);
    out.afterCommit();
    expect(w.copies).toEqual(["m-chest", "m-leg-press"]);
  });

  it("writes no fit row and claims no first set-up when the server didn't answer", () => {
    const unread = heldMoves({ held: { "m-chest": { seat: "3" } }, onFile: {}, fieldsOf: () => [SEAT] });
    queueHeldMoves(batch, { clientId: "c-judy", moves: unread, nameOf: () => "", author, journal, homeStudioId: "solon" });
    expect(w.queued[0]).toMatchObject({ homeStudioId: null, isInitialSetup: false, dialsOnly: true, writeDials: ["seat"] });
  });

  it("says which move couldn't go in the batch, so the caller keeps what the session holds", () => {
    w.saveThrowsFor = "m-chest";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = queueHeldMoves(batch, { clientId: "c-judy", moves, nameOf: () => "", author, journal, homeStudioId: null });
    expect(out.queued).toEqual(["m-leg-press"]);
    expect(out.failed).toEqual(["m-chest"]);
    spy.mockRestore();
  });

  it("a move with nothing to write is queued, with no copy after the commit", () => {
    w.nothingFor = "m-chest";
    const out = queueHeldMoves(batch, { clientId: "c-judy", moves, nameOf: () => "", author, journal, homeStudioId: null });
    expect(out.queued).toEqual(["m-chest", "m-leg-press"]);
    out.afterCommit();
    expect(w.copies).toEqual(["m-leg-press"]);
  });
});
