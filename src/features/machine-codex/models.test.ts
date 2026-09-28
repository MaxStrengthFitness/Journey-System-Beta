import { describe, expect, it } from "vitest";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import {
  dialSummary,
  dialsFromMovement,
  draftOf,
  emptyModelDraft,
  modelDocument,
  modelIdFor,
  modelLabel,
  modelProblems,
  modelsFor,
  type ModelWithId,
} from "./models";

const hoist: ModelWithId = {
  id: "mm-hoist-roc-it-leg-press",
  brand: "Hoist",
  model: "ROC-IT Leg Press",
  movementId: "m-leg-press",
  dials: [
    { key: "gap", label: "Gap", letter: "G" },
    { key: "seat-distance", label: "Seat Distance", letter: "S", default: "7" },
  ],
  updatedAt: null,
  updatedBy: "admin",
};

describe("the model record", () => {
  it("mints its id from the brand and model, once", () => {
    expect(modelIdFor("Hoist", "ROC-IT Leg Press")).toBe("mm-hoist-roc-it-leg-press");
    expect(modelIdFor("  ", "")).toBe("mm-model");
  });

  it("names the brand then the model, without saying the brand twice", () => {
    expect(modelLabel(hoist)).toBe("Hoist ROC-IT Leg Press");
    expect(modelLabel({ brand: "Hoist", model: "Hoist ROC-IT" })).toBe("Hoist ROC-IT");
    expect(modelLabel({ brand: "", model: "Nitro" })).toBe("Nitro");
    expect(modelLabel(null)).toBe("");
  });

  it("writes exactly its shape, leaving out what it does not say", () => {
    const doc = modelDocument({
      brand: " Hoist ",
      model: "ROC-IT Leg Press",
      movementId: "m-leg-press",
      dials: [
        { key: "", label: "Seat Distance", letter: " S ", default: "7", options: ["", " 1 ", "2"] },
        { key: "", label: "   " },
      ],
      notes: "  ",
    });
    expect(doc).toEqual({
      brand: "Hoist",
      model: "ROC-IT Leg Press",
      movementId: "m-leg-press",
      dials: [{ key: "seat-distance", label: "Seat Distance", letter: "S", default: "7", options: ["1", "2"] }],
    });
    // Only the fields the rules allow, beside the stamp the store adds.
    for (const k of Object.keys(doc)) {
      expect(["brand", "model", "movementId", "dials", "notes"]).toContain(k);
    }
  });

  it("keeps a dial's key once it has one", () => {
    const doc = modelDocument({ ...draftOf(hoist), dials: [{ key: "seat-distance", label: "Seat (distance)" }] });
    expect(doc.dials?.[0].key).toBe("seat-distance");
  });

  it("names what stops a save", () => {
    expect(modelProblems(emptyModelDraft())).toEqual([
      "Give it a brand — Hoist, Nautilus, MedX.",
      "Give it a model name — ROC-IT Leg Press.",
      "Say which MSF movement it is.",
    ]);
    expect(modelProblems(draftOf(hoist))).toEqual([]);
    const twins = { ...draftOf(hoist), dials: [{ key: "", label: "Seat" }, { key: "seat", label: "Seat 2" }] };
    expect(modelProblems(twins)[0]).toContain("Two dials share the key");
  });

  it("reads a stored model without trusting it", () => {
    const d = draftOf({ brand: "Hoist", dials: [{ key: 7, label: "x" } as never, { key: "gap", label: "Gap" }] });
    expect(d).toEqual({ brand: "Hoist", model: "", movementId: "", dials: [{ key: "gap", label: "Gap" }], notes: "" });
  });

  it("starts a model's dials from the movement's, keys and all", () => {
    const lp = MACHINE_DEFINITIONS["m-leg-press"];
    expect(dialsFromMovement(lp.settingFields).map((d) => d.key)).toEqual(lp.settingFields.map((f) => f.key));
  });

  it("lists one movement's models and says their dials in a line", () => {
    const other: ModelWithId = { ...hoist, id: "mm-medx-row", brand: "MedX", model: "Row", movementId: "m-compound-row" };
    expect(modelsFor([other, hoist], "m-leg-press").map((m) => m.id)).toEqual(["mm-hoist-roc-it-leg-press"]);
    expect(modelsFor([hoist], undefined)).toEqual([]);
    expect(dialSummary(hoist)).toBe("2 dials: G · S");
    expect(dialSummary({})).toBe("No dials recorded");
  });
});
