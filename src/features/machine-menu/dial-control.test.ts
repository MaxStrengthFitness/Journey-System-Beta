import { describe, expect, it } from "vitest";
import {
  MAX_OPTION_BUTTONS,
  MAX_POSITIONS,
  canStep,
  dialControl,
  recordValuesFor,
  scaleOf,
  stepDial,
  studioValuesFor,
  wordChips,
  type DialControl,
  type DialField,
} from "./dial-control";
import { LEG_PRESS_HISTORY, averyRead } from "./fixtures";
import { parseSettingHistory } from "./setting-history";

const SEAT: DialField = { key: "seat", label: "Seat", type: "text", ghost: "6" };
const FOOT: DialField = { key: "footPlate", label: "Foot plate", type: "text", ghost: "High" };

const stepper = (c: DialControl) => {
  if (c.kind !== "stepper") throw new Error(`expected a stepper, got ${c.kind}`);
  return c;
};

describe("rule 1: the field's own options", () => {
  it("draws 8 or fewer as option buttons, with no ±", () => {
    const c = dialControl({ ...SEAT, type: "enum", options: ["In", "Out"] }, { current: "In" });
    expect(c).toEqual({ kind: "options", rule: 1, options: ["In", "Out"] });
    expect(stepDial(c, "In", 1)).toBeNull();
  });

  it("steps through more than 8 options, in their order, ends included", () => {
    const options = Array.from({ length: MAX_OPTION_BUTTONS + 1 }, (_, i) => `P${i + 1}`);
    const c = stepper(dialControl({ ...SEAT, options }, { current: "P1" }));
    expect([c.rule, c.scale.unit, c.positions]).toEqual([1, "list", options]);
    expect(stepDial(c, "P1", 1)).toBe("P2");
    expect(stepDial(c, "P1", -1)).toBeNull();
    expect(stepDial(c, "P9", 1)).toBeNull();
  });
});

describe("rule 2: the field's own min, max and step", () => {
  it("steps inside the field's bounds, with a position row when there are 12 or fewer", () => {
    const c = stepper(dialControl({ ...SEAT, min: 1, max: 10, step: 1 }, { current: "5" }));
    expect([c.rule, c.min, c.max, c.keypad]).toEqual([2, 1, 10, "decimal"]);
    expect(c.positions).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(stepDial(c, "10", 1)).toBeNull();
    expect(stepDial(c, "1", -1)).toBeNull();
    expect(stepDial(c, "5", 1)).toBe("6");
  });

  it("takes its own step, and holds at 0 without a min", () => {
    const c = stepper(dialControl({ ...SEAT, step: 0.5 }, { current: "6.5" }));
    expect([c.min, c.max, c.positions]).toEqual([0, null, null]);
    expect(stepDial(c, "6.5", 1)).toBe("7");
    expect(stepDial(c, "0", -1)).toBeNull();
    expect(canStep(c, "0", -1)).toBe(false);
  });

  it("offers a field, not a row, past 12 positions", () => {
    expect(stepper(dialControl({ ...SEAT, min: 1, max: 20, step: 1 }, { current: "5" })).positions).toBeNull();
  });
});

describe("rule 3: what this studio's clients are set to, once machine fit has answered", () => {
  it("steps over the studio's values, the current value included", () => {
    const c = stepper(dialControl(SEAT, { current: "4", studioValues: ["5", "6", "7"], recordValues: ["4"] }));
    expect([c.rule, c.scale]).toEqual([3, { unit: "number", step: 1 }]);
    expect(c.positions).toEqual(["4", "5", "6", "7"]);
  });

  it("shows the engine's spelling back as the machine's: halves and letters", () => {
    const halves = stepper(dialControl(SEAT, { current: "6", studioValues: ["6_5", "7"] }));
    expect([halves.scale, halves.positions]).toEqual([{ unit: "number", step: 0.5 }, ["6", "6.5", "7"]]);
    const letters = stepper(dialControl({ key: "pin", label: "Pin" }, { current: "B", studioValues: ["b", "d"] }));
    expect([letters.scale.unit, letters.positions]).toEqual(["letter", ["B", "C", "D"]]);
  });

  it("waits for machine fit's read: unanswered falls through to the client's record", () => {
    expect(stepper(dialControl(SEAT, { current: "5", studioValues: null, recordValues: ["4"] })).rule).toBe(4);
    expect(stepper(dialControl(SEAT, { current: "5", studioValues: [], recordValues: ["4"] })).rule).toBe(4);
  });

  it("isn't used when the studio's values don't agree on a scale", () => {
    const c = dialControl(SEAT, { current: "5", studioValues: ["5", "high"], recordValues: ["5"] });
    expect(stepper(c).rule).toBe(4);
  });
});

describe("rule 4: the current value and the client's record", () => {
  it("steps whole numbers by 1", () => {
    const c = stepper(dialControl(SEAT, { current: "5", recordValues: ["4", "Seat 5"] }));
    expect([c.rule, c.scale, c.positions]).toEqual([4, { unit: "number", step: 1 }, ["4", "5"]]);
    expect(stepDial(c, "5", 1)).toBe("6");
  });

  it("steps halves by 0.5 and single letters A → B", () => {
    expect(stepper(dialControl(SEAT, { current: "6", recordValues: ["6.5"] })).scale).toEqual({ unit: "number", step: 0.5 });
    const letters = stepper(dialControl({ key: "pin", label: "Pin" }, { current: "B", recordValues: ["A"] }));
    expect(letters.scale).toEqual({ unit: "letter" });
    expect([stepDial(letters, "B", 1), stepDial(letters, "A", -1), stepDial(letters, "Z", 1), stepDial(letters, "b", 1)]).toEqual(["C", null, null, "c"]);
  });

  it("makes a stepper of an empty dial once Use has filled it", () => {
    expect(dialControl(SEAT, { current: "" }).kind).toBe("text");
    expect(stepper(dialControl(SEAT, { current: "6" })).positions).toEqual(["6"]);
  });

  it("keeps the field's own bounds, and offers a field past 12 positions", () => {
    const c = stepper(dialControl({ ...SEAT, max: 7 }, { current: "7", recordValues: ["5"] }));
    expect(stepDial(c, "7", 1)).toBeNull();
    const wide = stepper(dialControl(SEAT, { current: "1", recordValues: ["20"] }));
    expect([wide.positions, wide.keypad]).toEqual([null, "decimal"]);
    expect(MAX_POSITIONS).toBe(12);
  });

  it("reads the Leg Press record: snapshots and both sides of each change", () => {
    const { logs } = averyRead(1);
    const rows = parseSettingHistory(LEG_PRESS_HISTORY, "avery");
    const values = recordValuesFor(SEAT, { snapshots: logs.filter((l) => l.machineId === "leg-press").map((l) => l.machineSettings), rows });
    expect(values.sort()).toEqual(["4", "5"]);
    expect(stepper(dialControl(SEAT, { current: "5", saved: "5", recordValues: values })).positions).toEqual(["4", "5"]);
  });
});

describe("rule 5: a word dial", () => {
  it("is a field with chips of the record's values plus the studio standard", () => {
    const c = dialControl(FOOT, { current: "High", recordValues: ["High", "low", "LOW"] });
    expect(c).toEqual({ kind: "text", rule: 5, chips: [{ value: "High", standard: true }, { value: "low", standard: false }] });
    expect(wordChips({ ...FOOT, ghost: "Mid" }, ["High"])).toEqual([{ value: "High", standard: false }, { value: "Mid", standard: true }]);
    expect(wordChips({ ...FOOT, ghost: null }, [])).toEqual([]);
  });

  it("never steps", () => {
    const c = dialControl(FOOT, { current: "High" });
    expect([stepDial(c, "High", 1), canStep(c, "High", -1)]).toEqual([null, false]);
  });
});

describe("stepping", () => {
  it("never steps an empty dial (no ± on an empty dial)", () => {
    const c = stepper(dialControl(SEAT, { current: "5", recordValues: ["4"] }));
    expect([stepDial(c, "", 1), stepDial(c, null, 1)]).toEqual([null, null]);
  });

  it("holds at 0 for a number with no min", () => {
    const c = stepper(dialControl(SEAT, { current: "0" }));
    expect([stepDial(c, "0", -1), stepDial(c, "0", 1)]).toEqual([null, "1"]);
  });

  it("works out which scale values agree on", () => {
    expect(scaleOf(["4", "5"])).toEqual({ unit: "number", step: 1 });
    expect(scaleOf(["4", "4.5"])).toEqual({ unit: "number", step: 0.5 });
    expect(scaleOf(["4.25"])).toBeNull();
    expect(scaleOf(["A", "c"])).toEqual({ unit: "letter" });
    expect(scaleOf(["A", "4"])).toBeNull();
    expect(scaleOf([])).toBeNull();
  });
});

describe("where the values come from", () => {
  it("takes the studio's values from machine fit's rows, null until answered", () => {
    const rows = [{ settings: { seat: "5" } }, { settings: { seat: "6", "back-pad": "2" } }, { settings: { seat: "5" } }];
    expect(studioValuesFor({ key: "Seat", label: "Seat" }, rows)).toEqual(["5", "6"]);
    expect(studioValuesFor(SEAT, null)).toBeNull();
    expect(studioValuesFor(SEAT, [])).toEqual([]);
  });

  it("finds a snapshot under any spelling of the storage key, and a history row by its label", () => {
    const values = recordValuesFor({ key: "Back Pad", label: "Back pad" }, {
      snapshots: [{ "Back Pad": "3" }, { "back-pad": "2" }, {}, null, { seat: "5" }],
      rows: [{ pairs: [{ label: "Back pad", from: "3", to: "1" }, { label: "Seat", from: "4", to: "5" }] }],
    });
    expect(values).toEqual(["3", "2", "1"]);
  });
});
