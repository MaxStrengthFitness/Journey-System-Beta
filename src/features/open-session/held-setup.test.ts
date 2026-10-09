import { describe, expect, it } from "vitest";
import {
  heldAuthorsOf,
  HELD_SETUP_LINE,
  cleanHeldSources,
  cleanHeldValues,
  hasHeldSetup,
  heldAsSettings,
  heldClosedError,
  heldClosedFor,
  heldKey,
  heldMoves,
  heldOverSaved,
  heldSetupEntry,
  heldSetupField,
  heldSourcesOf,
  heldValuesOf,
  type MoveField,
} from "./held-setup";

/* Settings held on an open session (the open session round, Oct 9 2026;
   AJ's "3a"): kept on the session until the client is chosen, then saved to
   the client at Assign, a held value winning only for the dials it set. */

const SEAT: MoveField = { key: "seat", label: "Seat", type: "text", ghost: "6", absolute: false };
const BACK: MoveField = { key: "backPad", label: "Back pad", type: "text", ghost: null, absolute: false };

describe("what the card keeps on the session", () => {
  it("says where the settings go, in one line", () => {
    expect(HELD_SETUP_LINE).toBe("Kept on this session · saved to the client when you choose them");
  });

  it("keeps the dials as trimmed strings, a dial with no value left out", () => {
    expect(cleanHeldValues({ seat: " 12 ", backPad: "", gap: 3, odd: null, list: ["1"] })).toEqual({ seat: "12", gap: "3" });
    expect(cleanHeldValues(null)).toEqual({});
    expect(cleanHeldValues(["12"])).toEqual({});
  });

  it("writes one machine at its own dotted path, or asks for a FieldPath for an id a path can't carry", () => {
    expect(heldSetupField("m-leg-press")).toBe("heldSetup.m-leg-press");
    expect(heldSetupField("sm-solon-rear_delt2")).toBe("heldSetup.sm-solon-rear_delt2");
    expect(heldSetupField("odd.id")).toBeNull();
    expect(heldSetupField("a/b")).toBeNull();
  });

  it("signs the entry with who saved it and the server's time, and never writes undefined", () => {
    const stamp = { __server: true };
    expect(heldSetupEntry({ seat: "12", backPad: " " }, "uid-coach", stamp)).toEqual({
      values: { seat: "12" },
      at: stamp,
      byUid: "uid-coach",
    });
  });

  /* The review (Oct 9 2026): a value taken from a suggestion was saved to
     the client as typed, so machine fit counted its own guess as evidence. */
  it("keeps where a value came from when it is a suggestion, only for a dial with a value, and leaves sources out when every value is typed", () => {
    const stamp = { __server: true };
    expect(heldSetupEntry({ seat: "6", backPad: "3" }, "u", stamp, { seat: "suggested", backPad: "typed", gap: "suggested" })).toEqual({
      values: { seat: "6", backPad: "3" },
      sources: { seat: "suggested" },
      at: stamp,
      byUid: "u",
    });
    expect(heldSetupEntry({ seat: "6" }, "u", stamp, { seat: "typed" })).not.toHaveProperty("sources");
    expect(heldSetupEntry({ seat: "6" }, "u", stamp, null)).not.toHaveProperty("sources");
    expect(cleanHeldSources({ seat: "legacy", odd: 3 }, { seat: "6", odd: "1" })).toEqual({ seat: "legacy" });
  });
});

describe("reading it back", () => {
  const session = {
    heldSetup: {
      "m-leg-press": { values: { seat: "12" }, at: null, byUid: "u" },
      "m-chest": { values: {}, at: null, byUid: "u" },
      "m-row": { values: { seat: " " } },
    },
  };

  it("reads each machine's values, and leaves out one an Undo emptied", () => {
    expect(heldValuesOf(session as never)).toEqual({ "m-leg-press": { seat: "12" } });
    expect(heldValuesOf(null)).toEqual({});
    expect(heldValuesOf({ heldSetup: undefined })).toEqual({});
  });

  it("knows there is something to clear even when every entry was emptied", () => {
    expect(hasHeldSetup(session as never)).toBe(true);
    expect(hasHeldSetup({ heldSetup: { "m-chest": { values: {} } } } as never)).toBe(true);
    expect(hasHeldSetup({ heldSetup: {} })).toBe(false);
    expect(hasHeldSetup(null)).toBe(false);
  });

  it("reads where each held value came from, a typed one or one with no value left out", () => {
    const withSources = {
      heldSetup: {
        "m-leg-press": { values: { seat: "6", backPad: "3" }, sources: { seat: "suggested", backPad: "typed" } },
        "m-row": { values: {}, sources: { seat: "suggested" } },
      },
    };
    expect(heldSourcesOf(withSources as never)).toEqual({ "m-leg-press": { seat: "suggested" } });
    expect(heldSourcesOf(session as never)).toEqual({});
    expect(heldAsSettings({ "m-leg-press": { seat: "6" } }, { "m-leg-press": { seat: "suggested" } })["m-leg-press"].sources).toEqual({
      seat: "suggested",
    });
  });

  it("is read by the card as saved settings, with no client named and nothing else on it", () => {
    expect(heldAsSettings({ "m-leg-press": { seat: "12" } })).toEqual({
      "m-leg-press": { clientId: "", machineId: "m-leg-press", settings: { seat: "12" }, updatedBy: "", updatedAt: null },
    });
  });

  it("keys the same values the same way, whatever order they came in", () => {
    expect(heldKey({ b: { y: "2", x: "1" }, a: { z: "3" } })).toBe(heldKey({ a: { z: "3" }, b: { x: "1", y: "2" } }));
    expect(heldKey({ a: { z: "3" } })).not.toBe(heldKey({ a: { z: "4" } }));
  });
});

describe("Assign: moving it to the client", () => {
  it("lays a held value over what the client has: it wins only for the dials it set", () => {
    expect(heldOverSaved({ seat: "4", backPad: "3" }, { seat: "12" })).toEqual({ seat: "12", backPad: "3" });
    expect(heldOverSaved(null, { seat: "12" })).toEqual({ seat: "12" });
  });

  it("plans one move a machine, with the client's dials kept and the held ones over them", () => {
    const moves = heldMoves({
      held: { "m-leg-press": { seat: "12" }, "m-chest": { backPad: "2" } },
      sources: { "m-chest": { backPad: "suggested" } },
      onFile: {
        "m-leg-press": { settings: { seat: "4", backPad: "3" }, sources: { seat: "suggested" }, fitAcks: { seat: { value: "4" } } },
      },
      serverAnswered: true,
      fieldsOf: () => [SEAT, BACK],
    });
    expect(moves.map((m) => m.machineId)).toEqual(["m-chest", "m-leg-press"]);
    const [chest, leg] = moves;
    expect(chest).toMatchObject({
      saved: {},
      draft: { backPad: "2" },
      writeDials: ["backPad"],
      changedSources: { backPad: "suggested" },
      firstSetup: true,
      fitRow: true,
      sources: null,
      fitAcks: null,
    });
    expect(leg).toMatchObject({
      saved: { seat: "4", backPad: "3" },
      draft: { seat: "12", backPad: "3" },
      writeDials: ["seat"],
      changedSources: {},
      firstSetup: false,
      fitRow: true,
      sources: { seat: "suggested" },
      fitAcks: { seat: { value: "4" } },
    });
  });

  it("never drops a held dial the machine's list doesn't show: it goes by its key", () => {
    const [move] = heldMoves({ held: { "m-x": { seat: "12", oldLabel: "5" } }, onFile: {}, fieldsOf: () => [SEAT] });
    expect(move.fields.map((f) => f.key)).toEqual(["seat", "oldLabel"]);
    expect(move.fields[1]).toEqual({ key: "oldLabel", label: "oldLabel", type: "text", ghost: null, absolute: false });
    expect(move.draft).toEqual({ seat: "12", oldLabel: "5" });
  });

  /* The review (Oct 9 2026): off an empty or cache-only read, the move
     claimed a first set-up ("Initial setup", "from —") and replaced the
     client's whole machine-fit row with only the held dials. */
  it("claims no first set-up and writes no fit row unless the server answered", () => {
    const [unread] = heldMoves({ held: { "m-x": { seat: "12" } }, onFile: {}, fieldsOf: () => [SEAT] });
    expect(unread).toMatchObject({ firstSetup: false, fitRow: false, writeDials: ["seat"] });
    const [copyOnly] = heldMoves({
      held: { "m-x": { seat: "12" } },
      onFile: { "m-x": { settings: { seat: "12" } } },
      serverAnswered: false,
      fieldsOf: () => [SEAT],
    });
    // The copy says Seat 12 already: the held dial is written by name all the same.
    expect(copyOnly).toMatchObject({ saved: { seat: "12" }, draft: { seat: "12" }, writeDials: ["seat"], firstSetup: false, fitRow: false });
  });

  it("moves nothing for a machine an Undo emptied", () => {
    expect(heldMoves({ held: { "m-x": {} }, onFile: {}, fieldsOf: () => [SEAT] })).toEqual([]);
  });
});

describe("an Undo that outlives Assign", () => {
  it("is refused with the client's name, and any other refusal names nobody", () => {
    const err = heldClosedError("Judy");
    expect(err).toBeInstanceOf(Error);
    expect(heldClosedFor(err)).toBe("Judy");
    expect(heldClosedFor(heldClosedError(""))).toBe("");
    expect(heldClosedFor(new Error("permission-denied"))).toBeNull();
    expect(heldClosedFor(null)).toBeNull();
  });
});

describe("heldAuthorsOf: who kept each machine's set-up (the whole-branch review, Oct 9 2026)", () => {
  it("names each machine's keeper by their sign-in uid, and nothing for an entry without one", () => {
    const session = {
      heldSetup: {
        "m-leg-press": { values: { seat: "12" }, at: null, byUid: "uid-first" },
        "m-chest": { values: { seat: "3" }, at: null, byUid: " " },
      },
    } as never;
    expect(heldAuthorsOf(session)).toEqual({ "m-leg-press": "uid-first" });
    expect(heldAuthorsOf(null)).toEqual({});
  });
});
