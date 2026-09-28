import { describe, expect, it } from "vitest";
import {
  machineModelOf,
  modelForUnit,
  modelIdOf,
  modelName,
  modelsById,
  modelsOfMovement,
  modelsReadOf,
} from "./models";

const HOIST = { brand: "Hoist", model: "ROC-IT Leg Press", movementId: "m-leg-press", dials: ["Seat", { label: "Back Pad" }], notes: " 380 lb stack. " };

describe("a model record, read", () => {
  it("reads the maker, the name, the movement, the dials and the note", () => {
    expect(machineModelOf("hoist-rocit-lp", HOIST)).toEqual({
      id: "hoist-rocit-lp",
      brand: "Hoist",
      model: "ROC-IT Leg Press",
      movementId: "m-leg-press",
      dials: ["Seat", "Back Pad"],
      notes: "380 lb stack.",
    });
  });

  it("is no model without a maker, a name or a movement", () => {
    expect(machineModelOf("x", { ...HOIST, brand: " " })).toBeNull();
    expect(machineModelOf("x", { ...HOIST, model: undefined })).toBeNull();
    expect(machineModelOf("x", { ...HOIST, movementId: 7 })).toBeNull();
    expect(machineModelOf("", HOIST)).toBeNull();
    expect(machineModelOf("x", null)).toBeNull();
  });

  it("takes dials however the record holds them, and nothing that isn't one", () => {
    const m = machineModelOf("x", { ...HOIST, dials: ["Gap", { name: "Seat" }, { key: "arms" }, 4, null, { label: "" }] });
    expect(m?.dials).toEqual(["Gap", "Seat", "arms"]);
    expect(machineModelOf("x", { ...HOIST, dials: "Seat" })?.dials).toEqual([]);
  });
});

describe("which model a unit is", () => {
  it("is the id its roster entry names, or nothing", () => {
    expect(modelIdOf({ machineId: "m-leg-press", modelId: " hoist-rocit-lp " })).toBe("hoist-rocit-lp");
    expect(modelIdOf({ machineId: "m-leg-press" })).toBeNull();
    expect(modelIdOf({ modelId: 12 })).toBeNull();
    expect(modelIdOf(null)).toBeNull();
  });

  it("is only the record that id names, never a guess", () => {
    const read = modelsReadOf([{ id: "hoist-rocit-lp", data: HOIST }]);
    const byId = modelsById(read);
    expect(modelForUnit("hoist-rocit-lp", byId)?.brand).toBe("Hoist");
    // An entry naming a record that isn't there, or naming none, says nothing.
    expect(modelForUnit("nautilus-nitro", byId)).toBeNull();
    expect(modelForUnit(null, byId)).toBeNull();
    expect(modelForUnit("hoist-rocit-lp", null)).toBeNull();
  });
});

describe("a model as a person says it", () => {
  it("is the maker, then the name", () => {
    expect(modelName({ brand: "Hoist", model: "ROC-IT Leg Press" })).toBe("Hoist ROC-IT Leg Press");
  });

  it("never says the maker twice", () => {
    expect(modelName({ brand: "Hoist", model: "Hoist ROC-IT" })).toBe("Hoist ROC-IT");
    expect(modelName({ brand: "MedX", model: "medx" })).toBe("medx");
  });
});

describe("the collection, read", () => {
  it("keeps the records a screen can stand behind, and says so", () => {
    const read = modelsReadOf([
      { id: "hoist-rocit-lp", data: HOIST },
      { id: "broken", data: { brand: "Nautilus" } },
    ]);
    expect(read.state).toBe("ready");
    expect(read.state === "ready" && read.models.map((m) => m.id)).toEqual(["hoist-rocit-lp"]);
  });

  it("draws from nothing until it is read, and nothing from an empty or unreadable collection", () => {
    expect(modelsById({ state: "off" })).toBeNull();
    expect(modelsById({ state: "loading" })).toBeNull();
    expect(modelsById({ state: "unreadable" })).toBeNull();
    expect(modelsById(modelsReadOf([]))).toBeNull();
  });

  it("lists a movement's models by maker, then name", () => {
    const read = modelsReadOf([
      { id: "n", data: { brand: "Nautilus", model: "Nitro Plus Leg Press", movementId: "m-leg-press" } },
      { id: "h2", data: { brand: "Hoist", model: "ROC-IT Leg Press", movementId: "m-leg-press" } },
      { id: "h1", data: { brand: "Hoist", model: "HD Leg Press", movementId: "m-leg-press" } },
      { id: "l", data: { brand: "MedX", model: "Lumbar", movementId: "m-lumbar" } },
    ]);
    expect(read.state === "ready" && modelsOfMovement(read.models, "m-leg-press").map((m) => m.id)).toEqual(["h1", "h2", "n"]);
    expect(read.state === "ready" && modelsOfMovement(read.models, "m-neck")).toEqual([]);
  });
});
