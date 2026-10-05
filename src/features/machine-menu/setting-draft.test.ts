import { describe, expect, it } from "vitest";
import { nextSettings } from "../machine-fit/settings-write";
import { UNDO_REASON } from "./setting-history";
import {
  OTHER_REASON,
  PAIN_REASON,
  REASON_CHIPS,
  UNDO_MS,
  WHY_PROMPT,
  asksWhy,
  changeWords,
  changedKeys,
  draftChanges,
  isDraftDirty,
  isFirstSetup,
  isFixedDial,
  offersHealthNote,
  reasonOf,
  saveLabel,
  saveOutcomeWords,
  seedDraft,
  suggestedSources,
  tileState,
  undoPayload,
  unsavedSettingsLabel,
  wasWords,
  type DraftField,
} from "./setting-draft";

const LEG_PRESS: DraftField[] = [
  { key: "seat", label: "Seat", ghost: "6" },
  { key: "backPad", label: "Back pad", ghost: "3" },
  { key: "footPlate", label: "Foot plate", ghost: "High" },
];
const ROW: DraftField[] = [
  { key: "seat", label: "Seat", ghost: "4" },
  { key: "gap", label: "Gap", ghost: "2" },
];
const SAVED = { seat: "4", backPad: "3", footPlate: "High" };

describe("the seed: fixed dials filled, nothing else", () => {
  it("seeds the gap with the machine's own value on a first set-up, and leaves the rest empty", () => {
    expect(seedDraft(ROW, {})).toEqual({ seat: "", gap: "2" });
    expect(seedDraft([{ key: "gap", label: "Gap", ghost: null }], {})).toEqual({ gap: "0" });
    expect(isFixedDial(ROW[1])).toBe(true);
    expect(isFixedDial(ROW[0])).toBe(false);
  });

  it("never fills a studio standard as a value", () => {
    expect(seedDraft(LEG_PRESS, {})).toEqual({ seat: "", backPad: "", footPlate: "" });
  });

  it("opens with the saved values, a fixed dial with nothing saved filled (today's rule)", () => {
    expect(seedDraft(LEG_PRESS, SAVED)).toEqual(SAVED);
    expect(seedDraft(ROW, { seat: "5" })).toEqual({ seat: "5", gap: "2" });
  });

  it("is never dirty on opening, first set-up or not", () => {
    for (const [fields, saved] of [[ROW, {}], [ROW, { seat: "5" }], [LEG_PRESS, SAVED], [LEG_PRESS, {}]] as const) {
      expect(isDraftDirty(fields, seedDraft(fields, saved), saved)).toBe(false);
      expect(changedKeys(fields, seedDraft(fields, saved), saved)).toEqual([]);
    }
  });

  it("knows a first set-up, counting a key the field list no longer shows", () => {
    expect(isFirstSetup({})).toBe(true);
    expect(isFirstSetup({ seat: "  " })).toBe(true);
    expect(isFirstSetup({ "Old Seat": "3" })).toBe(false);
  });
});

describe("Seat 4 → 5", () => {
  const draft = { ...SAVED, seat: "5" };

  it("is dirty, and says the change", () => {
    expect(isDraftDirty(LEG_PRESS, draft, SAVED)).toBe(true);
    expect(changedKeys(LEG_PRESS, draft, SAVED)).toEqual(["seat"]);
    const changes = draftChanges(LEG_PRESS, SAVED, draft);
    expect(changes).toEqual([{ label: "Seat", from: "4", to: "5" }]);
    expect(changeWords(changes)).toBe("Seat 4 → 5");
    expect(saveLabel(changes, false)).toBe("Save Seat 5");
    expect(asksWhy(false)).toBe(true);
    expect(WHY_PROMPT).toBe("Why? (optional)");
  });

  it("draws the tile live with 'was 4' under it", () => {
    const state = tileState(LEG_PRESS[0], draft, SAVED);
    expect(state).toEqual({ kind: "value", value: "5", fixed: false, was: "4" });
    expect(wasWords(state)).toBe("was 4");
    expect(wasWords(tileState(LEG_PRESS[1], draft, SAVED))).toBeNull();
  });

  it("says what became of the save", () => {
    const changes = draftChanges(LEG_PRESS, SAVED, draft);
    expect(saveOutcomeWords(changes, false, "saved")).toBe("Seat 5 saved · Undo");
    expect(saveOutcomeWords(changes, false, "queued")).toBe("Seat 5 saved on this iPad · it sends when the Wi-Fi is back · Undo");
    expect(saveOutcomeWords(changes, false, "failed")).toBe("Couldn't save Seat 5 · Try again");
  });

  it("isn't dirty once it is back at 4, and ignores trailing spaces", () => {
    expect(isDraftDirty(LEG_PRESS, { ...SAVED, seat: "4 " }, SAVED)).toBe(false);
    expect(draftChanges(LEG_PRESS, SAVED, { ...SAVED, seat: " 4" })).toEqual([]);
  });

  it("joins several changes", () => {
    const changes = draftChanges(LEG_PRESS, SAVED, { ...SAVED, seat: "5", backPad: "2" });
    expect(changeWords(changes)).toBe("Seat 4 → 5 · Back pad 3 → 2");
    expect(saveLabel(changes, false)).toBe("Save 2 changes");
    expect(saveOutcomeWords(changes, false, "saved")).toBe("2 changes saved · Undo");
  });

  it("says a cleared dial plainly", () => {
    const changes = draftChanges(LEG_PRESS, SAVED, { ...SAVED, seat: "" });
    expect(changeWords(changes)).toBe("Seat 4 → —");
    expect(saveLabel(changes, false)).toBe("Save 1 change");
    expect(tileState(LEG_PRESS[0], { ...SAVED, seat: "" }, SAVED)).toEqual({ kind: "empty", standard: "6", was: "4" });
  });
});

describe("a first set-up", () => {
  it("reads 'Seat — → 4', saves the seeded gap with it, and asks no reason", () => {
    const draft = { ...seedDraft(ROW, {}), seat: "4" };
    const changes = draftChanges(ROW, {}, draft);
    expect(changeWords(changes)).toBe("Seat — → 4 · Gap — → 2");
    expect(saveLabel(changes, true)).toBe("Save set-up");
    expect(saveOutcomeWords(changes, true, "saved")).toBe("Set-up saved · Undo");
    expect(saveOutcomeWords(changes, true, "failed")).toBe("Couldn't save set-up · Try again");
    expect(asksWhy(true)).toBe(false);
  });

  it("shows an empty dial as Not set with its standard, and the fixed one as Same for every client", () => {
    const draft = seedDraft(ROW, {});
    expect(tileState(ROW[0], draft, {})).toEqual({ kind: "empty", standard: "4", was: null });
    expect(tileState(ROW[1], draft, {})).toEqual({ kind: "value", value: "2", fixed: true, was: null });
    expect(tileState({ key: "x", label: "X", ghost: "" }, { x: "" }, {})).toEqual({ kind: "empty", standard: null, was: null });
  });

  it("says 'was not set' once Use has filled an empty dial", () => {
    expect(wasWords(tileState(ROW[0], { seat: "4", gap: "2" }, {}))).toBe("was not set");
  });
});

describe("the reason: asked, never required", () => {
  it("offers AJ's chips, in order", () => {
    expect([...REASON_CHIPS]).toEqual(["Comfort or fit", "Range of motion", "Alignment", "Pain or discomfort", "Matches the guide", "Other…"]);
  });

  it("saves with no reason (saveSettings writes its default), a chip's words, or what was typed", () => {
    expect(reasonOf(null)).toBe("");
    expect(reasonOf("Range of motion")).toBe("Range of motion");
    expect(reasonOf(OTHER_REASON, "  knee feels pinched  ")).toBe("knee feels pinched");
    expect(reasonOf(OTHER_REASON, "")).toBe("");
  });

  it("offers a Health note after a save for pain or discomfort, and only then", () => {
    expect(offersHealthNote(PAIN_REASON)).toBe(true);
    expect(offersHealthNote("Comfort or fit")).toBe(false);
    expect(offersHealthNote("")).toBe(false);
  });
});

describe("Undo", () => {
  it("writes 4 back through the same path, reason Undone, no second journal copy", () => {
    const before = { seat: "4", backPad: "3", footPlate: "High", "Old Seat": "9" };
    const after = { seat: "5", backPad: "3", footPlate: "High", "Old Seat": "9" };
    const undo = undoPayload(LEG_PRESS, before, after);
    expect(undo).toEqual({
      saved: after,
      draft: before,
      reason: UNDO_REASON,
      isInitialSetup: false,
      fileNote: false,
    });
    expect(draftChanges(LEG_PRESS, undo.saved, undo.draft)).toEqual([{ label: "Seat", from: "5", to: "4" }]);
    // saveSettings writes the map whole: a key the fields don't show survives.
    expect(nextSettings(LEG_PRESS, undo.saved, undo.draft)).toEqual(before);
    expect(UNDO_MS).toBe(10_000);
  });

  it("takes a first set-up back to nothing", () => {
    const undo = undoPayload(ROW, {}, { seat: "4", gap: "2" });
    expect(draftChanges(ROW, undo.saved, undo.draft)).toEqual([
      { label: "Seat", from: "4", to: "" },
      { label: "Gap", from: "2", to: "" },
    ]);
    expect(nextSettings(ROW, undo.saved, undo.draft)).toEqual({});
  });
});

describe("the rest", () => {
  it("marks a value Use filled as suggested while it is still the draft's", () => {
    expect(suggestedSources({ seat: "6" }, { seat: "6" })).toEqual({ seat: "suggested" });
    expect(suggestedSources({ seat: "6" }, { seat: "7" })).toEqual({});
  });

  it("names the draft for the app's leave question", () => {
    expect(unsavedSettingsLabel("Leg Press", "Avery")).toBe("Leg Press settings for Avery");
    expect(unsavedSettingsLabel("Leg Press", "")).toBe("Leg Press settings");
  });
});
