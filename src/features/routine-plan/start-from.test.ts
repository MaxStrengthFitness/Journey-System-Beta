/**
 * Start from a routine… (the open session round, Oct 9 2026; AJ's "1b": "i
 * want to be able to take advantage of our routine builder so we can use it
 * if we wanted too"): the pure half. What the sheet offers, in which groups;
 * a routine's ids on this floor, with what the floor lacks named; and what a
 * tap does to today's list, keeping what is already done.
 */
import { describe, expect, it } from "vitest";
import type { Routine, RoutinePreset } from "../../types";
import {
  floorStatus,
  inHandAfterLay,
  laidToday,
  onThisFloor,
  startFromGroups,
  startFromLines,
  type StartFromInput,
} from "./start-from";
import type { FloorMachine } from "./starting-plan";
import { startingRoad, type StartingRoutine } from "./starting-routines";

const TODAY = "2026-10-09";

/** Westlake's floor: a catalog Leg Press, its own unit of the Compound Row, Lumbar, Chest Press, and a machine of its own. */
const floor: FloorMachine[] = [
  { id: "m-leg-press", name: "Leg Press" },
  { id: "unit-row", name: "Row (Hoist)", canonicalId: "m-compound-row" },
  { id: "m-lumbar", name: "Lumbar" },
  { id: "m-chest-press", name: "Chest Press" },
  { id: "sm-west-dip", name: "Dip Station" },
];

const NAMES: Record<string, string> = {
  "m-leg-press": "Leg Press",
  "unit-row": "Row (Hoist)",
  "m-lumbar": "Lumbar",
  "m-chest-press": "Chest Press",
  "sm-west-dip": "Dip Station",
  "m-leg-curl": "Leg Curl",
  "m-abs": "Abdominal",
  "m-hip-abd": "Abduction",
  "sol-leg": "LEG PRESS",
};
const nameOf = (id: string) => NAMES[id] ?? id;

const knee: StartingRoutine = {
  id: "academy-knee",
  name: "Knee issues",
  machineIds: ["m-leg-press", "m-compound-row", "m-leg-curl", "m-lumbar"],
  dayOne: ["m-leg-press", "m-leg-curl"],
  matchWords: ["knee"],
  isDefault: false,
  tier: "company",
  kind: "condition",
};
const walkIn: StartingRoutine = {
  id: "w-walkin",
  name: "Walk-in",
  machineIds: ["m-leg-press", "m-compound-row", "m-chest-press"],
  dayOne: ["m-leg-press", "m-compound-row"],
  matchWords: [],
  isDefault: false,
  tier: "studio",
  studioId: "westlake",
};
/** A start whose every machine this floor lacks: never offered (Start a plan's rule). */
const elsewhere: StartingRoutine = {
  id: "academy-elsewhere",
  name: "Somewhere else",
  machineIds: ["m-hip-abd"],
  dayOne: ["m-hip-abd"],
  matchWords: [],
  isDefault: false,
  tier: "company",
};

const preset = (id: string, name: string, machineIds: string[], tier: "company" | "studio" = "company"): RoutinePreset => ({
  id,
  name,
  machineIds,
  scope: tier === "company" ? "global" : "westlake",
  tier,
  ...(tier === "studio" ? { studioId: "westlake" } : null),
});
const fullBody = preset("t-full", "Full Body Foundations", ["m-chest-press", "m-compound-row", "m-leg-press", "m-abs"]);
const legs = preset("t-legs", "Legs day", ["m-leg-press", "m-lumbar"], "studio");
const nothingHere = preset("t-hips", "Hips", ["m-hip-abd"], "studio");

const routine = (id: string, name: string, machineIds: string[], plan?: Record<string, unknown>): Routine =>
  ({ id, clientId: "c-1", name, machineIds, ...(plan ? { plan } : null) }) as unknown as Routine;

function input(over: Partial<StartFromInput> = {}): StartFromInput {
  return {
    floor,
    todayYmd: TODAY,
    clientRoutines: null,
    starting: { routines: [knee, walkIn, elsewhere], choice: { use: null, defaultId: "w-walkin" } },
    templates: { company: [fullBody], studio: [legs, nothingHere] },
    nameOf,
    studioName: "Westlake",
    ...over,
  };
}

describe("what the sheet offers", () => {
  it("an open session (no client): the starting routines, the studio's templates and head office's, in that order", () => {
    const groups = startFromGroups(input());
    expect(groups.map((g) => [g.key, g.label])).toEqual([
      ["starting", "Starting routines"],
      ["studio", "Westlake's templates"],
      ["company", "Head office's templates"],
    ]);
  });

  it("once the client is known: their Routine A and Routine B first, under their name", () => {
    const groups = startFromGroups(
      input({
        clientRoutines: [routine("ra", "Routine A", ["m-lumbar", "m-leg-press"]), routine("rb", "Routine B", ["m-chest-press"])],
        firstName: "Judy",
      }),
    );
    expect(groups[0].label).toBe("Judy's routines");
    expect(groups[0].choices.map((c) => [c.label, c.machineIds])).toEqual([
      ["Routine A", ["m-lumbar", "m-leg-press"]],
      ["Routine B", ["m-chest-press"]],
    ]);
    // Without a name, never a pronoun.
    expect(startFromGroups(input({ clientRoutines: [routine("ra", "Routine A", ["m-lumbar"])] }))[0].label).toBe("This client's routines");
    // Each carries its routine, so the session it is laid on ran it (Next time; the whole-branch review, Oct 9 2026).
    expect(groups[0].choices.map((c) => c.routineId)).toEqual(["ra", "rb"]);
    // A starting routine or a template is nobody's routine.
    expect(groups.slice(1).flatMap((g) => g.choices).every((c) => c.routineId === undefined)).toBe(true);
  });

  it("a Routine A still empty runs its plan's day one, said as such; an empty Routine B isn't offered", () => {
    const groups = startFromGroups(
      input({
        clientRoutines: [
          routine("ra", "Routine A", [], { intended: ["m-leg-press", "m-lumbar"], dayOne: ["m-leg-press", "m-lumbar"] }),
          routine("rb", "Routine B", []),
        ],
      }),
    );
    expect(groups[0].choices.map((c) => [c.label, c.notes, c.machineIds])).toEqual([["Routine A", ["day one"], ["m-leg-press", "m-lumbar"]]]);
  });

  /*
   * The phase's review (Oct 9 2026): a client whose routines hadn't answered
   * had no group at all, then theirs landed at the top of the open sheet and
   * every row moved under the trainer's finger. Their place is held while
   * they read, and said once they are known to be none.
   */
  it("a client's routines still reading hold their place; known and none, said; an open session (no client) has no group of its own", () => {
    const reading = startFromGroups(input({ clientRoutines: "reading", firstName: "Judy" }));
    expect(reading[0]).toMatchObject({ key: "client", label: "Judy's routines", choices: [], status: "Reading Judy's routines…" });
    expect(startFromGroups(input({ clientRoutines: "reading" }))[0].status).toBe("Reading this client's routines…");
    const none = startFromGroups(input({ clientRoutines: [], firstName: "Judy" }));
    expect(none[0]).toMatchObject({ key: "client", label: "Judy's routines", choices: [], status: "None yet." });
    expect(startFromGroups(input({ clientRoutines: null })).map((g) => g.key)).not.toContain("client");
  });

  it("a starting routine lays its DAY ONE on this floor, as the plan builder makes it; the studio's default first; a start with nothing here isn't offered", () => {
    const starting = startFromGroups(input()).find((g) => g.key === "starting")!;
    expect(starting.choices.map((c) => [c.label, c.notes])).toEqual([
      ["Walk-in", ["default", "day one"]],
      ["Knee issues", ["day one"]],
    ]);
    const walk = starting.choices[0];
    expect(walk.machineIds).toEqual(startingRoad(walkIn, floor).startWith);
    // The studio's own unit of the Compound Row stands in for the catalog's.
    expect([...walk.machineIds].sort()).toEqual(["m-leg-press", "unit-row"]);
    // Day one's Leg Curl isn't on this floor: named, never dropped.
    const kneeChoice = starting.choices[1];
    expect(kneeChoice.machineIds).toEqual(["m-leg-press"]);
    expect(kneeChoice.missing).toEqual(["m-leg-curl"]);
  });

  it("the studio's choice is what it offers: a routine it left out isn't offered", () => {
    const starting = startFromGroups(input({ starting: { routines: [knee, walkIn], choice: { use: ["academy-knee"], defaultId: null } } })).find(
      (g) => g.key === "starting",
    )!;
    expect(starting.choices.map((c) => c.label)).toEqual(["Knee issues"]);
  });

  it("templates map catalog ids to this floor's units; a template with nothing on this floor isn't offered; what it lacks is named", () => {
    const groups = startFromGroups(input());
    const studio = groups.find((g) => g.key === "studio")!;
    expect(studio.choices.map((c) => c.label)).toEqual(["Legs day"]);
    const company = groups.find((g) => g.key === "company")!;
    expect(company.choices[0].machineIds).toEqual(["m-chest-press", "unit-row", "m-leg-press"]);
    expect(company.choices[0].missing).toEqual(["m-abs"]);
  });

  it("while a read is out, or after it failed, the group says so, never 'none'", () => {
    const reading = startFromGroups(input({ starting: null, templates: null }));
    expect(reading.map((g) => [g.label, g.status])).toEqual([
      ["Starting routines", "Reading the starting routines…"],
      ["Templates", "Reading the templates…"],
    ]);
    const failed = startFromGroups(input({ templates: "failed" }));
    expect(failed.find((g) => g.label === "Templates")?.status).toBe("The templates couldn't be read.");
  });

  /*
   * The phase's review (Oct 9 2026): a read that failed went on as if it had
   * answered, so a studio that chose its own Walk-in could be told it had
   * "no starting routines chosen", and a choice never read let head office's
   * default be called the default. As Start a plan says it: no default,
   * every one offered, and the sentence above them.
   */
  it("a starting routines read that failed claims nothing: no default, every one offered, and said above them, never 'none'", () => {
    const headDefault = { ...knee, isDefault: true };
    const failed = startFromGroups(
      input({ starting: { routines: [headDefault, walkIn], choice: { use: ["w-walkin"], defaultId: "w-walkin" }, failed: true, fromCode: true } }),
    ).find((g) => g.key === "starting")!;
    expect(failed.choices.map((c) => [c.label, c.notes])).toEqual([
      ["Knee issues", ["day one"]],
      ["Walk-in", ["day one"]],
    ]);
    expect(failed.status).toBeUndefined();
    expect(failed.notes).toEqual(["Couldn't read Westlake's starting routines just now.", "These are the Academy's, from Journey's own copy."]);
    // The studio's own read, failed, with the Academy's code copy matching none of its choice: never "none chosen".
    const nothing = startFromGroups(
      input({ starting: { routines: [elsewhere], choice: { use: ["w-walkin"], defaultId: null }, failed: true, fromCode: true } }),
    ).find((g) => g.key === "starting")!;
    expect(nothing.choices).toEqual([]);
    expect(nothing.status).toBe("Couldn't read Westlake's starting routines just now.");
    // Read from the app (not the code copy): the first sentence alone.
    const fromApp = startFromGroups(input({ starting: { routines: [knee], choice: null, failed: true, fromCode: false } })).find((g) => g.key === "starting")!;
    expect(fromApp.notes).toEqual(["Couldn't read Westlake's starting routines just now."]);
  });

  it("a studio with no starting routines chosen says so", () => {
    const starting = startFromGroups(input({ starting: { routines: [knee], choice: { use: [], defaultId: null } } })).find((g) => g.key === "starting")!;
    expect(starting.choices).toEqual([]);
    expect(starting.status).toBe("Westlake has no starting routines chosen.");
  });

  it("a machine the client can't do (Routine A's plan, read by every routine) is left out and named", () => {
    const held = { machineId: "m-leg-press", until: "cleared", day: "2026-10-01", byUid: "u-1" };
    const groups = startFromGroups(
      input({
        clientRoutines: [routine("ra", "Routine A", ["m-lumbar"], { intended: ["m-lumbar"], cantDo: [held] })],
      }),
    );
    const full = groups.find((g) => g.key === "company")!.choices[0];
    expect(full.machineIds).toEqual(["m-chest-press", "unit-row"]);
    expect(full.cantDo).toEqual(["m-leg-press"]);
    // A mark that has ended holds nothing.
    const ended = startFromGroups(
      input({
        clientRoutines: [routine("ra", "Routine A", ["m-lumbar"], { intended: ["m-lumbar"], cantDo: [{ ...held, until: "2026-10-05" }] })],
      }),
    );
    expect(ended.find((g) => g.key === "company")!.choices[0].cantDo).toEqual([]);
  });

  it("a machine out of service on the roster is left out and named", () => {
    const legsChoice = startFromGroups(input({ outOfService: ["m-lumbar"] })).find((g) => g.key === "studio")!.choices[0];
    expect(legsChoice.machineIds).toEqual(["m-leg-press"]);
    expect(legsChoice.outOfService).toEqual(["m-lumbar"]);
  });

  it("the client's own routine with nothing to lay here is still offered, as nothing to lay", () => {
    const groups = startFromGroups(input({ clientRoutines: [routine("ra", "Routine A", ["m-hip-abd"])] }));
    const a = groups[0].choices[0];
    expect(a.machineIds).toEqual([]);
    expect(a.missing).toEqual(["m-hip-abd"]);
    expect(startFromLines(a, nameOf).machines).toBe("None of its machines can go on today's list");
  });
});

describe("a floor not read yet", () => {
  // The phase's review (Oct 9 2026): a cold iPad's open session is seeded before its floor is read.
  it("is said in place of every group, never 'not on this floor'", () => {
    expect(floorStatus("reading", "Westlake")).toBe("Reading Westlake's floor…");
    expect(floorStatus("failed", "Westlake")).toBe("Couldn't read Westlake's floor just now. Try again in a moment.");
    expect(floorStatus("reading", null)).toBe("Reading this studio's floor…");
    expect(floorStatus("known", "Westlake")).toBeNull();
  });
});

describe("a routine's ids on this floor", () => {
  it("keeps this floor's own ids, maps a catalog id to this floor's unit, and lists what it lacks, each once", () => {
    expect(onThisFloor(["sm-west-dip", "m-compound-row", "m-leg-curl", "m-compound-row", 7, "", "m-leg-curl"], floor)).toEqual({
      machineIds: ["sm-west-dip", "unit-row"],
      missing: ["m-leg-curl"],
    });
  });

  it("finds a machine from another studio's floor by its name (a client's routine made elsewhere)", () => {
    expect(onThisFloor(["sol-leg"], floor, nameOf)).toEqual({ machineIds: ["m-leg-press"], missing: [] });
    expect(onThisFloor(["sol-leg"], floor)).toEqual({ machineIds: [], missing: ["sol-leg"] });
  });
});

describe("the words on a row", () => {
  it("the first four machines by name, then how many more, and each kind of machine left out, by name", () => {
    const choice = {
      key: "company:t",
      group: "company" as const,
      label: "Everything",
      machineIds: ["m-leg-press", "unit-row", "m-lumbar", "m-chest-press", "sm-west-dip"],
      missing: ["m-leg-curl", "m-abs"],
      cantDo: ["m-hip-abd"],
      outOfService: ["m-lumbar"],
      notes: [],
    };
    expect(startFromLines(choice, nameOf, { firstName: "Judy", studioName: "Westlake" })).toEqual({
      machines: "Leg Press · Row (Hoist) · Lumbar · Chest Press +1 more",
      leftOut: ["Not on Westlake's floor: Leg Curl, Abdominal", "Judy can't do for now: Abduction", "Out of service: Lumbar"],
    });
    expect(startFromLines({ ...choice, machineIds: ["m-leg-press"], missing: ["m-abs"], cantDo: [], outOfService: [] }, nameOf)).toEqual({
      machines: "Leg Press",
      leftOut: ["Not on this floor: Abdominal"],
    });
  });

  // The phase's review (Oct 9 2026): a unit of another studio's floor has no name Journey can find here.
  it("a machine Journey has no name for is counted, never printed as its id", () => {
    const base = { key: "client:A", group: "client" as const, label: "Routine A", machineIds: ["m-leg-press"], cantDo: [], outOfService: [], notes: [] };
    expect(startFromLines({ ...base, missing: ["m-abs", "sm-solon-dip"] }, nameOf, { studioName: "Westlake" }).leftOut).toEqual([
      "Not on Westlake's floor: Abdominal and 1 other machine",
    ]);
    expect(startFromLines({ ...base, missing: ["sm-solon-dip", "sm-solon-x"] }, nameOf, { studioName: "Westlake" }).leftOut).toEqual([
      "Not on Westlake's floor: 2 machines",
    ]);
  });
});

describe("what a tap does to today's list", () => {
  const done = (ids: string[]) => (id: string) => ids.includes(id);

  it("keeps what is already done today first, in the order done, then the routine's machines in its order", () => {
    expect(laidToday({ today: ["a", "b", "c"], laid: ["d", "c", "e"], done: done(["a", "c"]) })).toEqual(["a", "c", "d", "e"]);
  });

  it("a machine on today's list with no set yet makes way; an empty list takes the routine whole", () => {
    expect(laidToday({ today: ["b"], laid: ["d", "e"], done: done([]) })).toEqual(["d", "e"]);
    expect(laidToday({ today: [], laid: ["d", "e", "d"], done: done([]) })).toEqual(["d", "e"]);
  });

  it("the machine in hand stays while it is still to do; else the first machine still to do", () => {
    expect(inHandAfterLay({ next: ["a", "d", "e"], inHand: "d", done: done(["a"]) })).toBe("d");
    expect(inHandAfterLay({ next: ["a", "d", "e"], inHand: "b", done: done(["a"]) })).toBe("d");
    expect(inHandAfterLay({ next: ["a", "d", "e"], inHand: "a", done: done(["a"]) })).toBe("d");
    expect(inHandAfterLay({ next: ["a"], inHand: null, done: done(["a"]) })).toBeNull();
  });
});
