import { describe, expect, it } from "vitest";
import { nextSettings } from "../machine-fit/settings-write";
import { UNDO_REASON } from "./setting-history";
import {
  OTHER_REASON,
  PAIN_REASON,
  REASON_CHIPS,
  UNDO_MS,
  USE_ALL_FROM,
  USE_ALL_LABEL,
  WHY_PROMPT,
  asksWhy,
  changeWords,
  changedKeys,
  closedSaveWords,
  draftChanges,
  emptyDials,
  firstEmptyDial,
  isDraftDirty,
  isFirstSetup,
  isFixedDial,
  nextEmptyDial,
  nothingToUndoWords,
  notSetCount,
  offersHealthNote,
  reasonOf,
  rebaseDraft,
  refusedLaterWords,
  saveLabel,
  saveOutcomeWords,
  seedDraft,
  standardsForEmpty,
  suggestedSources,
  tileState,
  undoOnto,
  undoOutcomeWords,
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
    expect(isFixedDial(ROW[1])).toBe(true);
    expect(isFixedDial(ROW[0])).toBe(false);
  });

  /* Deliberately changed (the open session round, Oct 9 2026, finding 5):
     this said { gap: "0" } until then, so the first save on a machine with
     no Gap standard (ten of the twenty) wrote Gap 0 for a client nobody had
     set a gap for. With no value of its own the gap is an ordinary empty
     dial, and nothing is written for it. */
  it("leaves the gap empty, never 0, on a machine with no gap of its own, and a first save writes nothing for it", () => {
    const noGap: DraftField[] = [
      { key: "gap", label: "Gap", ghost: null },
      { key: "seat", label: "Seat", ghost: null },
    ];
    expect(seedDraft(noGap, {})).toEqual({ gap: "", seat: "" });
    expect(isFixedDial(noGap[0])).toBe(false);
    const draft = { ...seedDraft(noGap, {}), seat: "12" };
    expect(draftChanges(noGap, {}, draft)).toEqual([{ label: "Seat", from: "", to: "12" }]);
    expect(nextSettings(noGap, {}, draft)).toEqual({ seat: "12" });
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

  it("leaves Undo and Try again off for a strip that draws them as buttons", () => {
    const changes = draftChanges(LEG_PRESS, SAVED, draft);
    expect(saveOutcomeWords(changes, false, "saved", false)).toBe("Seat 5 saved");
    expect(saveOutcomeWords(changes, false, "queued", false)).toBe("Seat 5 saved on this iPad · it sends when the Wi-Fi is back");
    expect(saveOutcomeWords(changes, false, "failed", false)).toBe("Couldn't save Seat 5");
  });

  it("says what Undo did", () => {
    const changes = draftChanges(LEG_PRESS, SAVED, draft);
    expect(undoOutcomeWords(changes, false, "saved")).toBe("Seat back to 4");
    expect(undoOutcomeWords(changes, false, "queued")).toBe("Seat back to 4 on this iPad · it sends when the Wi-Fi is back");
    expect(undoOutcomeWords(changes, false, "failed")).toBe("Couldn't undo Seat 5");
    const two = draftChanges(LEG_PRESS, SAVED, { ...SAVED, seat: "5", backPad: "2" });
    expect(undoOutcomeWords(two, false, "saved")).toBe("2 changes undone");
    expect(undoOutcomeWords([{ label: "Seat", from: "", to: "4" }], false, "saved")).toBe("Seat back to not set");
    expect(undoOutcomeWords(two, true, "saved")).toBe("Set-up undone");
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

describe("the toast's Undo, laid onto the settings as they are now (undoOnto)", () => {
  // Set up, Seat 12, Save; Set up again, Back pad 3, Save; then the first toast's Undo.
  const first = undoPayload(LEG_PRESS, {}, { seat: "12" });

  it("takes back only what this save changed, and keeps a later save", () => {
    const laid = undoOnto(LEG_PRESS, first, { seat: "12", backPad: "3" })!;
    expect(laid.keys).toEqual(["seat"]);
    expect(nextSettings(LEG_PRESS, laid.payload.saved, laid.payload.draft)).toEqual({ backPad: "3" });
    expect(draftChanges(LEG_PRESS, laid.payload.saved, laid.payload.draft)).toEqual([{ label: "Seat", from: "12", to: "" }]);
    expect(laid.payload).toMatchObject({ reason: UNDO_REASON, isInitialSetup: false, fileNote: false });
  });

  it("is the save's own Undo when nothing has changed since", () => {
    const laid = undoOnto(LEG_PRESS, first, { seat: "12" })!;
    expect(laid.payload).toEqual(first);
  });

  it("leaves a dial changed since alone, and is nothing at all when every one has", () => {
    const two = undoPayload(LEG_PRESS, {}, { seat: "12", backPad: "3" });
    const laid = undoOnto(LEG_PRESS, two, { seat: "13", backPad: "3" })!;
    expect(laid.keys).toEqual(["backPad"]);
    expect(nextSettings(LEG_PRESS, laid.payload.saved, laid.payload.draft)).toEqual({ seat: "13" });
    expect(undoOnto(LEG_PRESS, first, { seat: "13" })).toBeNull();
    expect(nothingToUndoWords("Leg Press", "Avery")).toBe("Leg Press for Avery: changed again since, so nothing was undone.");
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

describe("rebaseDraft: the seed moved under the draft", () => {
  const seat: DraftField = { key: "seat", label: "Seat" };
  const gap: DraftField = { key: "gap", label: "Gap", ghost: null };

  // An empty gap (it was "0" until Oct 9 2026) → its catalog 2.
  it("lets an untouched dial follow the catalog arriving: an empty gap → its catalog 2, and a catalog-only dial its saved value", () => {
    const before = seedDraft([gap], {});
    expect(before).toEqual({ gap: "" });
    const after = seedDraft([{ ...gap, ghost: "2" }, seat], { seat: "5" });
    const draft = rebaseDraft(before, before, after);
    expect(draft).toEqual({ gap: "2", seat: "5" });
    expect(isDraftDirty([{ ...gap, ghost: "2" }, seat], draft, { seat: "5" })).toBe(false);
  });

  it("keeps a dial changed by hand, and moves the rest to another iPad's save", () => {
    const fields = [seat, { key: "backPad", label: "Back pad" }];
    const oldSeed = seedDraft(fields, { seat: "4", backPad: "2" });
    const mine = { ...oldSeed, seat: "5" };
    const newSeed = seedDraft(fields, { seat: "4", backPad: "3" });
    const draft = rebaseDraft(mine, oldSeed, newSeed);
    expect(draft).toEqual({ seat: "5", backPad: "3" });
    // Save writes only the trainer's change, never Back pad 3 → 2.
    expect(draftChanges(fields, { seat: "4", backPad: "3" }, draft)).toEqual([{ label: "Seat", from: "4", to: "5" }]);
  });

  it("changes nothing when the seed didn't move", () => {
    const seed = seedDraft([seat], { seat: "4" });
    expect(rebaseDraft({ seat: "6" }, seed, seed)).toEqual({ seat: "6" });
  });
});

describe("a save refused after the card closed", () => {
  it("says the machine, the client and the change, and where to set it again", () => {
    const changes = [{ label: "Seat", from: "4", to: "5" }];
    expect(refusedLaterWords("Leg Press", "Avery", changes, false)).toBe("Leg Press for Avery: couldn't save Seat 5. Set it again on the machine's card.");
    expect(refusedLaterWords("Leg Press", "", changes, false, true)).toBe("Leg Press: couldn't undo Seat 5. Set it again on the machine's card.");
  });
});

describe("quick set-up: the empty dials (the open session round, Oct 9 2026; AJ's \"2a\")", () => {
  const CHEST_FLY: DraftField[] = [
    { key: "Gap", label: "Gap", ghost: "1" },
    { key: "Back Pad", label: "Back pad", ghost: null },
    { key: "Seat", label: "Seat", ghost: null },
  ];

  it("counts the dials the card opens empty on: a fixed gap with its own value is not one", () => {
    expect(notSetCount(CHEST_FLY, {})).toBe(2);
    expect(notSetCount(CHEST_FLY, { Seat: "12" })).toBe(1);
    expect(notSetCount(CHEST_FLY, { Seat: "12", "Back Pad": "3" })).toBe(0);
    expect(notSetCount([], {})).toBe(0);
  });

  it("finds the first empty dial, and Next walks the rest in order, round to the start, never the one in hand", () => {
    const seed = seedDraft(CHEST_FLY, {});
    expect(emptyDials(CHEST_FLY, seed)).toEqual(["Back Pad", "Seat"]);
    expect(firstEmptyDial(CHEST_FLY, seed)).toBe("Back Pad");
    expect(nextEmptyDial(CHEST_FLY, seed, "Back Pad")).toBe("Seat");
    expect(nextEmptyDial(CHEST_FLY, seed, "Seat")).toBe("Back Pad");
    // Back pad typed: from it, Seat; from Seat, nothing left (Done).
    const typed = { ...seed, "Back Pad": "3" };
    expect(nextEmptyDial(CHEST_FLY, typed, "Back Pad")).toBe("Seat");
    expect(nextEmptyDial(CHEST_FLY, typed, "Seat")).toBeNull();
    expect(firstEmptyDial(CHEST_FLY, { ...typed, Seat: "12" })).toBeNull();
  });

  it("offers the studio standard for every empty dial that has one, and nothing for a dial with a value", () => {
    const fields: DraftField[] = [
      { key: "seat", label: "Seat", ghost: "6" },
      { key: "backPad", label: "Back pad", ghost: "3" },
      { key: "footPlate", label: "Foot plate", ghost: null },
    ];
    expect(standardsForEmpty(fields, { seat: "", backPad: "", footPlate: "" })).toEqual({ seat: "6", backPad: "3" });
    expect(standardsForEmpty(fields, { seat: "5", backPad: "", footPlate: "" })).toEqual({ backPad: "3" });
    expect(USE_ALL_FROM).toBe(2);
    expect(USE_ALL_LABEL).toBe("Use studio standard for all");
  });

  it("says a save that closed the card with the machine and the client, as the late refusal does", () => {
    const changes = [
      { label: "Seat", from: "", to: "12" },
      { label: "Back pad", from: "", to: "3" },
    ];
    expect(closedSaveWords("Chest Fly", "Avery", changes, true, "saved")).toBe("Chest Fly for Avery: set-up saved");
    expect(closedSaveWords("Chest Fly", "Avery", changes, true, "queued")).toBe(
      "Chest Fly for Avery: set-up saved on this iPad · it sends when the Wi-Fi is back",
    );
    expect(closedSaveWords("Leg Press", "", [{ label: "Seat", from: "4", to: "5" }], false, "saved")).toBe("Leg Press: Seat 5 saved");
  });
});
