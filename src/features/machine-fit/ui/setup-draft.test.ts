import { describe, expect, it } from "vitest";
import { EMPTY_DRAFTS, countDrafts, setupDraftReducer, shownOf, type SetupDraftState } from "./setup-draft";

const run = (actions: Parameters<typeof setupDraftReducer>[1][], from: SetupDraftState = EMPTY_DRAFTS) =>
  actions.reduce(setupDraftReducer, from);

describe("the Setup screen's drafts", () => {
  it("drafts a typed value, and forgets it when it is typed back to what is saved", () => {
    const typed = run([{ type: "set", machineId: "m-row", key: "Seat", value: "5", saved: "4", source: "typed" }]);
    expect(typed.drafts["m-row"]).toEqual({ values: { Seat: "5" }, sources: { Seat: "typed" } });
    expect(shownOf(typed.drafts["m-row"], { Seat: "4" }, "Seat")).toBe("5");
    expect(countDrafts(typed)).toEqual({ fields: 1, machines: 1, suggested: 0 });

    const back = run([{ type: "set", machineId: "m-row", key: "Seat", value: "4 ", saved: "4", source: "typed" }], typed);
    expect(back.drafts).toEqual({});
  });

  it("clearing a saved value is a draft too", () => {
    const cleared = run([{ type: "set", machineId: "m-row", key: "Seat", value: "", saved: "4", source: "typed" }]);
    expect(cleared.drafts["m-row"].values).toEqual({ Seat: "" });
    expect(shownOf(cleared.drafts["m-row"], { Seat: "4" }, "Seat")).toBe("");
  });

  it("accepting fills only the fields that show nothing — never over a saved or typed value", () => {
    const typed = run([{ type: "set", machineId: "m-row", key: "Gap", value: "2", saved: "", source: "typed" }]);
    const accepted = run(
      [
        {
          type: "accept",
          rows: [
            { machineId: "m-row", values: { Seat: "4", Gap: "0", Chest: "3" }, saved: { Chest: "5" } },
            { machineId: "m-press", values: { Seat: "3" }, saved: {} },
          ],
        },
      ],
      typed,
    );
    expect(accepted.drafts["m-row"].values).toEqual({ Gap: "2", Seat: "4" }); // Gap was typed, Chest was saved
    expect(accepted.drafts["m-row"].sources).toEqual({ Gap: "typed", Seat: "suggested" });
    expect(accepted.drafts["m-press"].sources).toEqual({ Seat: "suggested" });
    expect(countDrafts(accepted)).toEqual({ fields: 3, machines: 2, suggested: 2 });
    expect(accepted.lastAccept).toHaveLength(2);
  });

  it("undo takes back what the accept filled — and only what nobody has touched since", () => {
    const accepted = run([
      { type: "accept", rows: [{ machineId: "m-row", values: { Seat: "4", Chest: "3" }, saved: {} }] },
      // The trainer then corrects one of them by hand.
      { type: "set", machineId: "m-row", key: "Chest", value: "2", saved: "", source: "typed" },
    ]);
    const undone = run([{ type: "undoAccept" }], accepted);
    expect(undone.drafts["m-row"]).toEqual({ values: { Chest: "2" }, sources: { Chest: "typed" } });
    expect(undone.lastAccept).toBeNull();
    // Nothing to undo is nothing at all.
    expect(run([{ type: "undoAccept" }], undone)).toBe(undone);
  });

  it("an accept that fills nothing changes nothing", () => {
    const state = run([{ type: "accept", rows: [{ machineId: "m-row", values: { Seat: "4" }, saved: { Seat: "4" } }] }]);
    expect(state).toBe(EMPTY_DRAFTS);
  });

  it("files FileMaker shorthand as legacy, with its load and whatever could not be placed", () => {
    const state = run([
      { type: "shorthand", machineId: "m-row", values: { Seat: "4", Gap: "0" }, saved: { Gap: "0" }, weight: "112", note: "PILLOW" },
      { type: "shorthand", machineId: "m-row", values: {}, saved: {}, note: "foot stool" },
    ]);
    expect(state.drafts["m-row"]).toEqual({
      values: { Seat: "4" }, // Gap already says 0
      sources: { Seat: "legacy" },
      weight: "112",
      note: "PILLOW; foot stool",
    });
    expect(countDrafts(state).fields).toBe(3);
  });

  it("drafts a load, reverts one machine, and resets the lot", () => {
    const state = run([
      { type: "weight", machineId: "m-row", value: "112", saved: "100" },
      { type: "weight", machineId: "m-press", value: "80", saved: "80" },
      { type: "set", machineId: "m-abs", key: "Seat", value: "3", saved: "", source: "typed" },
    ]);
    expect(Object.keys(state.drafts).sort()).toEqual(["m-abs", "m-row"]);
    expect(Object.keys(run([{ type: "revert", machineId: "m-row" }], state).drafts)).toEqual(["m-abs"]);
    expect(run([{ type: "reset" }], state)).toBe(EMPTY_DRAFTS);
  });
});
