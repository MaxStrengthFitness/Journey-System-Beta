import { describe, expect, it } from "vitest";
import type { RoutinePreset } from "../../types";
import {
  MATCH_WORDS_MAX,
  cleanMatchWord,
  dayOneLine,
  dayOneOf,
  hasStartPart,
  newStartPart,
  otherDefaults,
  parkedStartOf,
  readStartPart,
  startListLine,
  startPartForSave,
  startPartProblem,
  startingSourceWords,
  withDayOneToggled,
  withDefault,
  withMatchWord,
  withPendingWord,
  withoutMatchWord,
} from "./start-part";
import { TEMPLATE_SOURCE } from "./starting-plan";
import { academyStartingRoutines, startingRoutineFromPreset, suggestFromStartingRoutines } from "./starting-routines";
import { startingSeedDoc } from "./starting-seed";

/** The eleven documents the seed writes, by id. */
const seedDocs = () => academyStartingRoutines().map((r) => ({ id: r.id, data: startingSeedDoc(r) }));

const ROAD = ["m-leg-press", "m-compound-row", "m-lumbar", "m-hip-abd", "m-chest-press"];
const names: Record<string, string> = {
  "m-leg-press": "Leg Press",
  "m-compound-row": "Compound Row",
  "m-lumbar": "Lumbar Extension",
  "m-hip-abd": "Abduction",
  "m-chest-press": "Chest Press",
};
const nameOf = (id: string) => names[id] ?? id;

describe("reading a stored start part", () => {
  it("is undefined when there is none, so the switch is off", () => {
    expect(readStartPart(undefined)).toBeUndefined();
    expect(readStartPart(null)).toBeUndefined();
    expect(readStartPart("yes")).toBeUndefined();
    expect(readStartPart(["m-leg-press"])).toBeUndefined();
    expect(hasStartPart({ start: undefined })).toBe(false);
    expect(hasStartPart({ start: { dayOne: [] } })).toBe(true);
  });

  it("checks every field and leaves an empty list out, so a part read twice compares equal", () => {
    const read = readStartPart({
      dayOne: [" m-leg-press ", "m-leg-press", 7, "m-compound-row"],
      steps: [{ label: "First workout adds", machineIds: ["m-hip-abd"] }, { label: "", machineIds: ["m-lumbar"] }, { label: "Empty", machineIds: [] }],
      matchWords: ["Low  Back", "low back", "", 3],
      default: "true",
      source: "  ",
      kind: "condition",
    });
    expect(read).toEqual({
      dayOne: ["m-leg-press", "m-compound-row"],
      steps: [{ label: "First workout adds", machineIds: ["m-hip-abd"] }],
      matchWords: ["low back"],
      kind: "condition",
    });
    expect(readStartPart(read)).toEqual(read);
    expect(readStartPart({ dayOne: [] })).toEqual({ dayOne: [] });
  });

  it("reads a seeded Academy routine whole: its steps, words, source and kind", () => {
    const doc = seedDocs().find((d) => d.id === "academy-low-back")!;
    const read = readStartPart(doc.data.start)!;
    expect(read.dayOne).toEqual(doc.data.start.dayOne);
    expect(read.steps).toEqual(doc.data.start.steps);
    expect(read.matchWords).toEqual(doc.data.start.matchWords);
    expect(read.source).toBe(TEMPLATE_SOURCE);
    expect(read.kind).toBe("condition");
  });
});

describe("day one", () => {
  it("starts empty when the switch goes on: nothing is guessed", () => {
    expect(newStartPart()).toEqual({ dayOne: [] });
  });

  it("is marked by a tap, in the template's order, and holds nothing the template doesn't", () => {
    let start = newStartPart();
    start = withDayOneToggled(start, "m-lumbar", ROAD);
    start = withDayOneToggled(start, "m-leg-press", ROAD);
    expect(start.dayOne).toEqual(["m-leg-press", "m-lumbar"]);
    start = withDayOneToggled(start, "m-compound-row", ROAD);
    expect(start.dayOne).toEqual(["m-leg-press", "m-compound-row", "m-lumbar"]);
    start = withDayOneToggled(start, "m-leg-press", ROAD);
    expect(start.dayOne).toEqual(["m-compound-row", "m-lumbar"]);
    // A machine taken out of the template above drops out of day one.
    expect(dayOneOf({ dayOne: ["m-compound-row", "m-gone"] }, ROAD)).toEqual(["m-compound-row"]);
    expect(withDayOneToggled({ dayOne: ["m-gone"] }, "m-lumbar", ROAD).dayOne).toEqual(["m-lumbar"]);
  });

  it("keeps day one's own order: the Academy's, repaired against the sequencing rules, isn't the road's", () => {
    const road = ["m-compound-row", "m-lumbar", "m-leg-press", "m-chest-press"];
    const seeded = { dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"] };
    expect(dayOneOf(seeded, road)).toEqual(["m-leg-press", "m-compound-row", "m-lumbar"]);
    // One put on goes in before the first day-one machine after it in the template.
    expect(withDayOneToggled(seeded, "m-chest-press", road).dayOne).toEqual(["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press"]);
    expect(withDayOneToggled({ dayOne: ["m-leg-press", "m-lumbar"] }, "m-compound-row", road).dayOne).toEqual([
      "m-compound-row",
      "m-leg-press",
      "m-lumbar",
    ]);
    // One taken off leaves the rest as they were; a machine not in the template is never put on.
    expect(withDayOneToggled(seeded, "m-compound-row", road).dayOne).toEqual(["m-leg-press", "m-lumbar"]);
    expect(withDayOneToggled(seeded, "m-gone", road).dayOne).toEqual(seeded.dayOne);
  });

  it("takes the seeded first step with it, so Start a plan never calls a machine off day one \"Consultation\"", () => {
    // A seeded routine's first step is its day one, the same machines.
    const seeded = {
      dayOne: ["m-leg-press", "m-lumbar"],
      steps: [
        { label: "Consultation", machineIds: ["m-leg-press", "m-lumbar"] },
        { label: "First workout adds", machineIds: ["m-compound-row", "m-hip-abd"] },
        { label: "Second workout adds", machineIds: ["m-chest-press"] },
      ],
    };
    // Lumbar off day one: out of the first step, and the workout after day one adds it.
    const off = withDayOneToggled(seeded, "m-lumbar", ROAD);
    expect(off.dayOne).toEqual(["m-leg-press"]);
    expect(off.steps).toEqual([
      { label: "Consultation", machineIds: ["m-leg-press"] },
      { label: "First workout adds", machineIds: ["m-compound-row", "m-hip-abd", "m-lumbar"] },
      { label: "Second workout adds", machineIds: ["m-chest-press"] },
    ]);
    // Compound Row on day one: into the first step, out of the one it was in.
    const on = withDayOneToggled(seeded, "m-compound-row", ROAD);
    expect(on.dayOne).toEqual(["m-leg-press", "m-compound-row", "m-lumbar"]);
    expect(on.steps).toEqual([
      { label: "Consultation", machineIds: ["m-leg-press", "m-compound-row", "m-lumbar"] },
      { label: "First workout adds", machineIds: ["m-hip-abd"] },
      { label: "Second workout adds", machineIds: ["m-chest-press"] },
    ]);
    // Taken off again, it goes back where it was: the round trip is no change once saved.
    const back = withDayOneToggled(on, "m-compound-row", ROAD);
    expect(startPartForSave(back, { machineIds: ROAD })).toEqual(startPartForSave(seeded, { machineIds: ROAD }));
    // A step emptied keeps its label in the draft, and the save leaves it out.
    const emptied = withDayOneToggled(seeded, "m-chest-press", ROAD);
    expect(emptied.steps![2]).toEqual({ label: "Second workout adds", machineIds: [] });
    expect(startPartForSave(emptied, { machineIds: ROAD })!.steps!.map((s) => s.label)).toEqual(["Consultation", "First workout adds"]);
  });

  it("leaves steps alone when the first of them isn't day one, and a last machine off day one with no next step falls to later", () => {
    const own = {
      dayOne: ["m-leg-press"],
      steps: [{ label: "Week two", machineIds: ["m-compound-row"] }],
    };
    expect(withDayOneToggled(own, "m-lumbar", ROAD).steps).toEqual(own.steps);
    const single = { dayOne: ["m-leg-press", "m-lumbar"], steps: [{ label: "Consultation", machineIds: ["m-leg-press", "m-lumbar"] }] };
    expect(withDayOneToggled(single, "m-lumbar", ROAD).steps).toEqual([{ label: "Consultation", machineIds: ["m-leg-press"] }]);
    // No steps stays no steps.
    expect("steps" in withDayOneToggled({ dayOne: ["m-leg-press"] }, "m-lumbar", ROAD)).toBe(false);
  });

  it("changed on a seeded Academy routine, gives Start a plan one Day one group and steps that agree with it", () => {
    const doc = seedDocs().find((d) => d.id === "academy-low-back")!;
    const road = doc.data.machineIds;
    let start = readStartPart(doc.data.start)!;
    const dropped = start.dayOne[start.dayOne.length - 1];
    const later = road.find((id: string) => !start.dayOne.includes(id))!;
    start = withDayOneToggled(start, dropped, road);
    start = withDayOneToggled(start, later, road);
    const saved = startPartForSave(start, { machineIds: road, tier: "company" })!;
    const routine = startingRoutineFromPreset({ id: doc.id, name: doc.data.name, machineIds: road, tier: "company", scope: "global", start: saved })!;
    const floor = road.map((id: string) => ({ id, canonicalId: id, name: id }));
    const steps = suggestFromStartingRoutines({ routines: [routine], choice: null, floor, pickedId: doc.id }).steps;
    // Exactly one group says day one's machines, and it is day one.
    expect(steps[0].machineIds.slice().sort()).toEqual(saved.dayOne.slice().sort());
    expect(steps.map((s) => s.label).filter((l) => l === "Day one")).toEqual([]);
    expect(steps.slice(1).some((s) => s.machineIds.includes(later))).toBe(false);
    expect(steps.slice(1).some((s) => s.machineIds.includes(dropped))).toBe(true);
  });

  it("says itself in a line, with the machines' names", () => {
    expect(dayOneLine(["m-leg-press", "m-compound-row", "m-lumbar"], nameOf)).toBe("Day one: Leg Press · Compound Row · Lumbar Extension");
    expect(dayOneLine([], nameOf)).toBe("Nothing on day one yet");
  });

  it("refuses a save with nothing on it, in a sentence that says the way out", () => {
    expect(startPartProblem(undefined, ROAD)).toBeNull();
    expect(startPartProblem({ dayOne: [] }, ROAD)).toBe(
      "Mark at least one machine for day one, or switch off Offer as a starting routine.",
    );
    expect(startPartProblem({ dayOne: ["m-gone"] }, ROAD)).not.toBeNull();
    expect(startPartProblem({ dayOne: ["m-lumbar"] }, ROAD)).toBeNull();
    // An empty template is refused first, in its own words, by the tab.
    expect(startPartProblem({ dayOne: [] }, [])).toBeNull();
  });
});

describe("the words that suggest it", () => {
  it("are lower case, trimmed and one space apart", () => {
    expect(cleanMatchWord("  Low   BACK ")).toBe("low back");
  });

  it("are added once, and a refusal says why", () => {
    let start = newStartPart();
    let r = withMatchWord(start, "Sciatica");
    expect(r.problem).toBeNull();
    start = r.start;
    expect(start.matchWords).toEqual(["sciatica"]);
    r = withMatchWord(start, " sciatica ");
    expect(r.problem).toBe('"sciatica" is already there.');
    expect(r.start).toBe(start);
    expect(withMatchWord(start, "   ").problem).toBe("Type a word or a short phrase first.");
    expect(withMatchWord(start, "x".repeat(41)).problem).toMatch(/40 letters or fewer/);
    const full = { dayOne: [], matchWords: Array.from({ length: MATCH_WORDS_MAX }, (_, i) => `word ${i}`) };
    expect(withMatchWord(full, "one more").problem).toMatch(/up to 40 words/);
  });

  it("typed but not added, go in with the save: nothing typed or a word already there changes nothing", () => {
    const start = { dayOne: ["m-leg-press"], matchWords: ["low back"] };
    expect(withPendingWord(start, "  Sciatica ")).toEqual({ start: { ...start, matchWords: ["low back", "sciatica"] }, problem: null });
    expect(withPendingWord(start, "LOW back")).toEqual({ start, problem: null });
    expect(withPendingWord(start, "   ")).toEqual({ start, problem: null });
    expect(withPendingWord(start, "x".repeat(41)).problem).toMatch(/40 letters or fewer/);
  });

  it("are taken out by a tap, and the last one out leaves no list behind", () => {
    const start = { dayOne: ["m-leg-press"], matchWords: ["low back", "sciatica"] };
    expect(withoutMatchWord(start, "low back")).toEqual({ dayOne: ["m-leg-press"], matchWords: ["sciatica"] });
    expect(withoutMatchWord(withoutMatchWord(start, "low back"), "sciatica")).toEqual({ dayOne: ["m-leg-press"] });
  });
});

describe("head office's default", () => {
  it("is switched on and off without leaving a false behind", () => {
    const on = withDefault({ dayOne: ["m-leg-press"] }, true);
    expect(on).toEqual({ dayOne: ["m-leg-press"], default: true });
    expect(withDefault(on, false)).toEqual({ dayOne: ["m-leg-press"] });
  });

  it("is never kept when the switch goes off: everything else is", () => {
    const start = {
      dayOne: ["m-leg-press"],
      steps: [{ label: "Consultation", machineIds: ["m-leg-press"] }],
      matchWords: ["knee"],
      default: true,
      source: TEMPLATE_SOURCE,
      kind: "condition" as const,
    };
    const { default: _gone, ...kept } = start;
    expect(parkedStartOf(start)).toEqual(kept);
  });

  it("names the other company templates that say they are it", () => {
    const presets = [
      { id: "a", name: "A", tier: "company", scope: "global", machineIds: [], start: { dayOne: ["m-leg-press"], default: true } },
      { id: "b", name: "B", tier: "company", scope: "global", machineIds: [], start: { dayOne: ["m-leg-press"] } },
      { id: "c", name: "C", tier: "studio", scope: "westlake", machineIds: [], start: { dayOne: ["m-leg-press"], default: true } },
      { id: "d", name: "D", tier: "company", scope: "global", machineIds: [] },
    ] as RoutinePreset[];
    expect(otherDefaults(presets, "b").map((p) => p.id)).toEqual(["a"]);
    expect(otherDefaults(presets, "a")).toEqual([]);
    expect(otherDefaults(presets, null).map((p) => p.id)).toEqual(["a"]);
  });
});

describe("what a save writes", () => {
  it("is null for a template that isn't a starting routine", () => {
    expect(startPartForSave(undefined, { machineIds: ROAD, tier: "company" })).toBeNull();
  });

  it("holds only the template's machines, clean words, no empty list and no undefined", () => {
    const saved = startPartForSave(
      {
        dayOne: ["m-lumbar", "m-leg-press", "m-gone"],
        steps: [
          { label: "First workout adds", machineIds: ["m-hip-abd", "m-gone"] },
          { label: "Later", machineIds: ["m-gone"] },
        ],
        matchWords: ["Low Back", "low back"],
        source: " docs/x.txt ",
        kind: "condition",
      },
      { machineIds: ROAD, tier: "company" },
    );
    expect(saved).toEqual({
      dayOne: ["m-lumbar", "m-leg-press"],
      steps: [{ label: "First workout adds", machineIds: ["m-hip-abd"] }],
      matchWords: ["low back"],
      source: "docs/x.txt",
      kind: "condition",
    });
    expect(JSON.stringify(saved)).not.toContain("undefined");
    expect(Object.values(saved!).includes(undefined)).toBe(false);
    expect(startPartForSave({ dayOne: ["m-leg-press"], matchWords: [] }, { machineIds: ROAD })).toEqual({ dayOne: ["m-leg-press"] });
  });

  it("writes default only on a company template, and only when it is on", () => {
    expect(startPartForSave({ dayOne: ["m-leg-press"], default: true }, { machineIds: ROAD, tier: "company" })).toEqual({
      dayOne: ["m-leg-press"],
      default: true,
    });
    expect(startPartForSave({ dayOne: ["m-leg-press"], default: true }, { machineIds: ROAD, tier: "studio" })).toEqual({
      dayOne: ["m-leg-press"],
    });
  });

  it("is read back by the app's reader as exactly the starting routine the editor showed", () => {
    let start = newStartPart();
    for (const id of ["m-leg-press", "m-compound-row", "m-lumbar"]) start = withDayOneToggled(start, id, ROAD);
    start = withMatchWord(start, "Low back").start;
    start = withMatchWord(start, "sciatica").start;
    start = withDefault(start, true);
    const saved = startPartForSave(start, { machineIds: ROAD, tier: "company" })!;
    const routine = startingRoutineFromPreset({ id: "t1", name: "Low back", machineIds: ROAD, tier: "company", scope: "global", start: saved });
    expect(routine).toMatchObject({
      id: "t1",
      machineIds: ROAD,
      dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"],
      matchWords: ["low back", "sciatica"],
      isDefault: true,
      tier: "company",
    });
  });

  it("round-trips every seeded Academy routine when nothing is touched (the seed's default: false is no default)", () => {
    for (const doc of seedDocs()) {
      const read = readStartPart(doc.data.start)!;
      // The seed writes default: false and an empty word list on the two
      // no-reported-issues rows; the editor leaves both out, and means the same.
      const { default: seededDefault, matchWords, ...rest } = doc.data.start;
      expect(seededDefault).toBe(false);
      const expected = matchWords && matchWords.length > 0 ? { ...rest, matchWords } : rest;
      expect(startPartForSave(read, { machineIds: doc.data.machineIds, tier: "company" }), doc.id).toEqual(expected);
      // And the app reads both as the same starting routine.
      const preset = { id: doc.id, name: doc.data.name, machineIds: doc.data.machineIds, tier: "company" as const, scope: "global" };
      expect(startingRoutineFromPreset({ ...preset, start: startPartForSave(read, preset) }), doc.id).toEqual(
        startingRoutineFromPreset({ ...preset, start: doc.data.start }),
      );
    }
  });
});

describe("the list's line", () => {
  it("says a starting routine's day one, what one still needs, and nothing for a plain template", () => {
    expect(startListLine({ machineIds: ROAD, start: { dayOne: ["m-leg-press", "m-compound-row"] } }, nameOf)).toBe(
      "Starting routine · day one: Leg Press · Compound Row",
    );
    expect(startListLine({ machineIds: ROAD, start: { dayOne: [] } }, nameOf)).toBe(
      "Starting routine · no day one yet, so no trainer is offered it",
    );
    expect(startListLine({ machineIds: ROAD }, nameOf)).toBeNull();
  });
});

describe("where it came from", () => {
  it("says an Academy file as the Academy's document", () => {
    expect(startingSourceWords(TEMPLATE_SOURCE)).toBe("From the Academy's Exercise Selection Template");
    expect(startingSourceWords(academyStartingRoutines()[0].source)).toBe("From the Academy's Exercise Selection Template");
    expect(startingSourceWords("docs/msf-academy/Academy 2/Academy - Exercise Instruction - Cues and Timing.txt")).toBe(
      "From the Academy's Exercise Instruction - Cues and Timing",
    );
  });

  it("says anything else as it was written, and nothing for no source", () => {
    expect(startingSourceWords("head office, Oct 2026")).toBe("From head office, Oct 2026");
    expect(startingSourceWords("From the Solon pilot")).toBe("From the Solon pilot");
    expect(startingSourceWords("  ")).toBeNull();
    expect(startingSourceWords(undefined)).toBeNull();
  });
});
