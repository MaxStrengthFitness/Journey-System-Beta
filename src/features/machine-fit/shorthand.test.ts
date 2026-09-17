import { describe, expect, it } from "vitest";
import {
  fitValue,
  matchField,
  matchMachineLine,
  parseShorthand,
  parseShorthandBlock,
  type ShorthandField,
  type ShorthandMachine,
} from "./shorthand";

/** The Compound Row, the way Journey defines it: one list of fields, for every client. */
const ROW: ShorthandField[] = [
  { key: "gap", label: "Gap", type: "number" },
  { key: "seat", label: "Seat", type: "number" },
  { key: "chest-pad", label: "Chest Pad", type: "number" },
  { key: "handles", label: "Handles", type: "enum", options: ["In", "Out", "Wide", "Narrow"] },
];

/** A legacy machine: fields keyed by their label, all free text. */
const LEG_PRESS: ShorthandField[] = [
  { key: "Gap", label: "Gap", type: "text" },
  { key: "Pads", label: "Pads", type: "text" },
  { key: "Seat", label: "Seat", type: "text" },
  { key: "Shoulder Pads", label: "Shoulder Pads", type: "text" },
];

describe("AJ's four spellings of one Compound Row", () => {
  it('"Gap:4 Seat:3"', () => {
    expect(parseShorthand("Gap:4 Seat:3", ROW)).toEqual({ values: { gap: "4", seat: "3" }, leftovers: [], notes: [] });
  });

  it('"G:4,S:3"', () => {
    expect(parseShorthand("G:4,S:3", ROW).values).toEqual({ gap: "4", seat: "3" });
  });

  it('"Gap:6, Handles:in, seat: up, Chest:3 PILLOW" — places what it can, keeps the rest', () => {
    const r = parseShorthand("Gap:6, Handles:in, seat: up, Chest:3 PILLOW", ROW);
    expect(r.values).toEqual({ gap: "6", handles: "In", seat: "up", "chest-pad": "3" });
    // Nothing is thrown away: the pillow becomes a note on the machine.
    expect(r.leftovers).toEqual(["PILLOW"]);
    // …and it says what it was unsure of rather than silently fixing it.
    expect(r.notes).toEqual(['Seat: "up" is not a number']);
  });

  it('"GAP:4, S:4 C:4 H:W"', () => {
    const r = parseShorthand("GAP:4, S:4 C:4 H:W", ROW);
    expect(r.values).toEqual({ gap: "4", seat: "4", "chest-pad": "4", handles: "Wide" });
    expect(r.leftovers).toEqual([]);
  });
});

describe("the FileMaker grid's own forms", () => {
  it('reads "S- 8", "Pads- 1" and the bare "Gap 9"', () => {
    expect(parseShorthand("S- 8  Gap 9", LEG_PRESS).values).toEqual({ Seat: "8", Gap: "9" });
    expect(parseShorthand("S- 8 Pads- 1", LEG_PRESS).values).toEqual({ Seat: "8", Pads: "1" });
  });

  it("reads a decimal, a letter position, and the grid's letter-space-number", () => {
    expect(parseShorthand("Gap 8  P- 2  S- 3.75", LEG_PRESS).values).toEqual({ Gap: "8", Pads: "2", Seat: "3.75" });
    expect(parseShorthand("Pad- D, S- 6, Gap- 0", LEG_PRESS).values).toEqual({ Pads: "D", Seat: "6", Gap: "0" });
    expect(parseShorthand("S 8 G 9", LEG_PRESS).values).toEqual({ Seat: "8", Gap: "9" });
  });

  it("treats a printed label with nothing after it as not set", () => {
    // "S-  Gap-  WEIG" is an empty machine on the grid.
    expect(parseShorthand("S- Gap- WEIG", LEG_PRESS)).toEqual({ values: {}, leftovers: [], notes: [] });
    expect(parseShorthand("Seat- Gap- 4", LEG_PRESS).values).toEqual({ Gap: "4" });
    // An empty seat printed beside a filled gap: "Gap" is the next label, not the seat's value.
    expect(parseShorthand("S-  Gap 9", LEG_PRESS)).toEqual({ values: { Gap: "9" }, leftovers: [], notes: [] });
  });

  it("reads run-together shorthand", () => {
    expect(parseShorthand("S4 G2", LEG_PRESS).values).toEqual({ Seat: "4", Gap: "2" });
    expect(parseShorthand("s3.75 g0 p2", LEG_PRESS).values).toEqual({ Seat: "3.75", Gap: "0", Pads: "2" });
  });

  it("reads a multi-word label, by name or by initials", () => {
    expect(parseShorthand("Shoulder Pads: 3", LEG_PRESS).values).toEqual({ "Shoulder Pads": "3" });
    expect(parseShorthand("Should 3", LEG_PRESS).values).toEqual({ "Shoulder Pads": "3" });
    expect(parseShorthand("SP:3", LEG_PRESS).values).toEqual({ "Shoulder Pads": "3" });
    expect(parseShorthand("Chest Pad 4 seat 5", ROW).values).toEqual({ "chest-pad": "4", seat: "5" });
  });

  it("picks the load out of the line instead of calling it a setting", () => {
    expect(parseShorthand("S:4 G:0 WT:120", ROW)).toMatchObject({ values: { seat: "4", gap: "0" }, weight: "120", leftovers: [] });
    expect(parseShorthand("seat 4, weight 85 lbs", ROW)).toMatchObject({ values: { seat: "4" }, weight: "85", leftovers: [] });
    expect(parseShorthand("WEIG: 112", ROW).weight).toBe("112");
  });
});

describe("it would rather place too little than guess", () => {
  it("uses the chart convention to settle one letter between two fields", () => {
    // "S" could be Seat or Shin Pad. On a Max Strength chart S is the seat.
    const seats: ShorthandField[] = [
      { key: "seat", label: "Seat", type: "number" },
      { key: "shin-pad", label: "Shin Pad", type: "number" },
    ];
    expect(matchField("S", seats).field?.key).toBe("seat");
  });

  it("says a label is ambiguous rather than picking", () => {
    const twins: ShorthandField[] = [
      { key: "left", label: "Lever Left", type: "number" },
      { key: "right", label: "Lever Right", type: "number" },
    ];
    const r = parseShorthand("Lever: 4", twins);
    expect(r.values).toEqual({});
    expect(r.leftovers).toEqual(["Lever: 4"]);
    expect(r.notes[0]).toMatch(/more than one setting/);
  });

  it("keeps a label no field answers to, whole", () => {
    const r = parseShorthand("Seat:4, Footplate:2", ROW);
    expect(r.values).toEqual({ seat: "4" });
    expect(r.leftovers).toEqual(["Footplate: 2"]);
  });

  it("keeps the first value when a field is given twice, and says so", () => {
    const r = parseShorthand("S:4, Seat:5", ROW);
    expect(r.values).toEqual({ seat: "4" });
    expect(r.leftovers).toEqual(["Seat: 5"]);
    expect(r.notes).toEqual(["Seat was given twice; kept 4"]);
  });

  it("does not mistake a stray word for a label", () => {
    const r = parseShorthand("PILLOW under knees, S:4", ROW);
    expect(r.values).toEqual({ seat: "4" });
    expect(r.leftovers).toEqual(["PILLOW", "under", "knees"]);
  });

  it("leaves a range alone — 3-5 is a value, not a label and a number", () => {
    expect(parseShorthand("Seat: 3-5", LEG_PRESS).values).toEqual({ Seat: "3-5" });
  });

  it("is safe on nothing", () => {
    expect(parseShorthand("", ROW)).toEqual({ values: {}, leftovers: [], notes: [] });
    expect(parseShorthand("   ,, ;", ROW)).toEqual({ values: {}, leftovers: [], notes: [] });
    expect(parseShorthand("S:4", [])).toEqual({ values: {}, leftovers: ["S: 4"], notes: [] });
  });
});

describe("fitValue", () => {
  const handles = ROW[3];
  it("spells an option the machine's way", () => {
    expect(fitValue(handles, "in")).toEqual({ value: "In" });
    expect(fitValue(handles, "W")).toEqual({ value: "Wide" });
    expect(fitValue(handles, "n")).toEqual({ value: "Narrow" });
  });

  it("matches a numbered option however the number was typed", () => {
    const seat: ShorthandField = { key: "seat", label: "Seat", type: "enum", options: ["1", "2", "3"] };
    expect(fitValue(seat, "3.0")).toEqual({ value: "3" });
  });

  it("keeps a value that is not an option, with a note", () => {
    expect(fitValue(handles, "sideways")).toEqual({
      value: "sideways",
      note: 'Handles: "sideways" is not one of In / Out / Wide / Narrow',
    });
  });

  it("upper-cases a one-letter position", () => {
    expect(fitValue(LEG_PRESS[1], "d")).toEqual({ value: "D" });
  });
});

describe("a whole chart pasted at once", () => {
  const machines: ShorthandMachine[] = [
    { id: "m-compound-row", name: "Compound Row", fields: ROW },
    { id: "m-leg-press", name: "Leg Press", fields: LEG_PRESS },
    { id: "m-ext", name: "Leg Extension", fields: LEG_PRESS },
    { id: "sm-solon-hammer-row", name: "Hammer Row", fields: ROW },
  ];

  it("finds the machine by FileMaker's name for it, longest name first", () => {
    expect(matchMachineLine("Comp. Row: G:4, S:3", machines)).toMatchObject({
      machine: { id: "m-compound-row" },
      rest: "G:4, S:3",
    });
    expect(matchMachineLine("Leg Ext. S- 5 Gap- 4", machines)?.machine.id).toBe("m-ext");
    expect(matchMachineLine("Leg Press  Gap 8", machines)?.machine.id).toBe("m-leg-press");
    expect(matchMachineLine("Hammer Row - S:4", machines)).toMatchObject({ machine: { id: "sm-solon-hammer-row" }, rest: "S:4" });
    expect(matchMachineLine("Cable crossover S:4", machines)).toBeNull();
  });

  it("reads one machine per line and leaves unknown lines unplaced", () => {
    const lines = parseShorthandBlock(
      ["Comp. Row: GAP:4, S:4 C:4 H:W", "", "Leg Press  Gap 8  P- 2  S- 3.75", "Rowing ergometer 10 minutes"].join("\n"),
      machines,
    );
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ machineId: "m-compound-row", result: { values: { gap: "4", seat: "4", "chest-pad": "4", handles: "Wide" } } });
    expect(lines[1]).toMatchObject({ machineId: "m-leg-press", result: { values: { Gap: "8", Pads: "2", Seat: "3.75" } } });
    expect(lines[2]).toEqual({ line: "Rowing ergometer 10 minutes", machineId: null, result: null });
  });
});
