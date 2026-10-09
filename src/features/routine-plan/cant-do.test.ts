import { describe, expect, it } from "vitest";
import { ACADEMY_MOVEMENT_NAME } from "../catalog/names";
import { HEALTH_FLAVOURS } from "../client-notes/note-catalog";
import {
  CANT_DO_REASONS,
  activeCantDo,
  backOnLine,
  cantDoActive,
  cantDoLine,
  cantDoValue,
  dayAfterKey,
  healthNoteOffer,
  markCantDo,
  parseCantDoValue,
  reopenCantDo,
  replaceAt,
  reshapeForCantDo,
  standInLine,
  untilDayFrom,
  untilWords,
} from "./cant-do";
import type { FloorMachine } from "./starting-plan";
import type { CantDo, RoutinePlan } from "./types";

/** The twenty MSF machines, as a floor that uses the catalog ids. */
const ALL: FloorMachine[] = [
  "m-leg-press", "m-ext", "m-leg-curl", "m-compound-row", "m-pulldown", "m-pullover", "m-simple-row",
  "m-chest-press", "m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-bicep", "m-tricep-ext",
  "m-lumbar", "m-abs", "m-torso-rotation", "m-neck", "m-hip-abd", "m-hip-add",
].map((id) => ({ id }));

const nameOf = (id: string) => ACADEMY_MOVEMENT_NAME[id.replace(/^unit-/, "")] ?? id;
const who = { uid: "u-sam", name: "Sam" };

/** The no-reported-issues row's second workout: the road a new client starts on. */
const ROAD = ["m-lumbar", "m-compound-row", "m-dip", "m-hip-add", "m-pullover", "m-leg-press"];
const DAY_ONE = ["m-lumbar", "m-compound-row", "m-leg-press"];
const PLAN: RoutinePlan = { purpose: "Learning the protocol", intended: ROAD, building: true, madeByUid: "u-sam" };

describe("marking a machine the client can't do", () => {
  it("puts the Academy's documented substitute in its place, keeping the order", () => {
    const r = reshapeForCantDo({ intended: ROAD, routine: DAY_ONE, machineId: "m-dip", floor: ALL });
    // Exercise Substitutes.txt: Seated Dip → Chest Flye + Triceps Extension; the plan takes one.
    expect(r.replacedBy).toEqual(["m-chest-fly"]);
    expect(r.intended).toEqual(["m-lumbar", "m-compound-row", "m-chest-fly", "m-hip-add", "m-pullover", "m-leg-press"]);
    // Seated Dip wasn't in today's routine, so the routine is as it was.
    expect(r.routine).toEqual(DAY_ONE);
    expect(standInLine({ machineId: "m-dip", replacedBy: r.replacedBy }, nameOf)).toBe("Chest Flye instead of Seated Dip");
  });

  it("never stands in a machine the client can't do either, or one already in the plan", () => {
    const blocked = reshapeForCantDo({ intended: ROAD, routine: DAY_ONE, machineId: "m-dip", floor: ALL, cantDo: ["m-chest-fly"] });
    expect(blocked.replacedBy).toEqual(["m-tricep-ext"]);
    const inPlan = reshapeForCantDo({
      intended: [...ROAD.slice(0, 3), "m-chest-fly", ...ROAD.slice(3)],
      routine: DAY_ONE,
      machineId: "m-dip",
      floor: ALL,
    });
    expect(inPlan.replacedBy).toEqual(["m-tricep-ext"]);
  });

  it("falls back to a machine of the same Academy family on this floor", () => {
    const floor = ALL.filter((m) => m.id !== "m-chest-fly" && m.id !== "m-tricep-ext");
    const r = reshapeForCantDo({ intended: ROAD, routine: DAY_ONE, machineId: "m-dip", floor });
    // Upper Body — Push, the first on this floor in the floor's own order.
    expect(r.replacedBy).toEqual(["m-chest-press"]);
  });

  it("lets the machine simply leave when nothing on this floor fits, and says so", () => {
    const floor = ROAD.map((id) => ({ id }));
    const r = reshapeForCantDo({ intended: ROAD, routine: DAY_ONE, machineId: "m-dip", floor });
    expect(r.replacedBy).toEqual([]);
    expect(r.intended).toEqual(["m-lumbar", "m-compound-row", "m-hip-add", "m-pullover", "m-leg-press"]);
    expect(standInLine({ machineId: "m-dip", replacedBy: [] }, nameOf)).toBe("Seated Dip left out: nothing like it on this floor");
  });

  it("reshapes today's routine too, the stand-in in the machine's place", () => {
    const r = reshapeForCantDo({ intended: ROAD, routine: DAY_ONE, machineId: "m-lumbar", floor: ALL });
    // No documented substitute for the Lumbar; Trunk's next on the floor is Abdominals.
    expect(r.replacedBy).toEqual(["m-abs"]);
    expect(r.routine).toEqual(["m-abs", "m-compound-row", "m-leg-press"]);
    expect(r.intended[0]).toBe("m-abs");
  });

  it("changes nothing for a machine in neither list: it only goes on the bench", () => {
    const r = reshapeForCantDo({ intended: ROAD, routine: DAY_ONE, machineId: "m-neck", floor: ALL });
    expect(r).toEqual({ intended: ROAD, routine: DAY_ONE, replacedBy: [] });
  });

  it("keeps a studio's own unit ids, read through the floor's catalog ids", () => {
    const floor: FloorMachine[] = ALL.map((m) => ({ id: `unit-${m.id}`, canonicalId: m.id }));
    const unit = (ids: string[]) => ids.map((id) => `unit-${id}`);
    const r = reshapeForCantDo({ intended: unit(ROAD), routine: unit(DAY_ONE), machineId: "unit-m-dip", floor });
    expect(r.replacedBy).toEqual(["unit-m-chest-fly"]);
    expect(r.intended.every((id) => id.startsWith("unit-"))).toBe(true);
  });

  it("works out the whole tap: the entry, the reshaped plan and routine, and the change", () => {
    const m = markCantDo({
      plan: PLAN,
      routine: DAY_ONE,
      machineId: "m-dip",
      reason: "Surgery",
      until: "cleared",
      day: "2026-10-08",
      by: who,
      floor: ALL,
    });
    expect(m.entry).toEqual({
      machineId: "m-dip",
      reason: "Surgery",
      until: "cleared",
      day: "2026-10-08",
      byUid: "u-sam",
      byName: "Sam",
      replacedBy: ["m-chest-fly"],
      onRoad: true,
    });
    expect(m.plan.cantDo).toEqual([m.entry]);
    expect(m.plan.intended).toContain("m-chest-fly");
    expect(m.plan.intended).not.toContain("m-dip");
    expect(m.change).toEqual({ kind: "cantdo", machineIds: ["m-dip"], value: "Surgery · cleared", byUid: "u-sam", byName: "Sam" });
    // The reason is asked, never required, and nothing undefined is written.
    const bare = markCantDo({ plan: PLAN, routine: DAY_ONE, machineId: "m-dip", until: "always", day: "2026-10-08", by: { uid: "u-sam" }, floor: ALL });
    expect(Object.values(bare.entry)).not.toContain(undefined);
    expect("reason" in bare.entry).toBe(false);
    expect(bare.change.value).toBe("always");
  });

  it("keeps what first stood in when a mark is made again", () => {
    const first = markCantDo({ plan: PLAN, routine: DAY_ONE, machineId: "m-dip", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    const again = markCantDo({
      plan: first.plan,
      routine: first.routine,
      machineId: "m-dip",
      reason: "Injury or pain",
      until: "2026-11-03",
      day: "2026-10-09",
      by: who,
      floor: ALL,
    });
    expect(again.entry.replacedBy).toEqual(["m-chest-fly"]);
    // It was on the road when first marked, though it isn't any more.
    expect(again.entry.onRoad).toBe(true);
    expect(again.plan.cantDo).toHaveLength(1);
    expect(again.plan.intended).toEqual(first.plan.intended);
  });
});

describe("reopening a machine", () => {
  it("puts it back where its stand-in stands, and the stand-in leaves the road", () => {
    const m = markCantDo({ plan: PLAN, routine: DAY_ONE, machineId: "m-dip", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    const reopened = reopenCantDo(m.plan, m.routine, "m-dip");
    expect(reopened.intended).toEqual(ROAD);
    expect(reopened.cantDo).toEqual([]);
  });

  it("keeps a stand-in the client does now, and puts the machine in just before it", () => {
    const m = markCantDo({ plan: PLAN, routine: DAY_ONE, machineId: "m-lumbar", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    expect(m.routine).toEqual(["m-abs", "m-compound-row", "m-leg-press"]);
    const reopened = reopenCantDo(m.plan, m.routine, "m-lumbar");
    expect(reopened.intended.slice(0, 2)).toEqual(["m-lumbar", "m-abs"]);
    // The routine is the caller's and isn't changed: the Lumbar is on deck.
  });

  it("follows a stand-in that was marked too", () => {
    const a = markCantDo({ plan: PLAN, routine: DAY_ONE, machineId: "m-dip", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    const b = markCantDo({ plan: a.plan, routine: a.routine, machineId: "m-chest-fly", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    expect(b.entry.replacedBy).toEqual(["m-chest-press"]);
    const reopened = reopenCantDo(b.plan, b.routine, "m-dip");
    expect(reopened.intended[2]).toBe("m-dip");
    expect(reopened.intended).not.toContain("m-chest-press");
    expect(reopened.cantDo?.map((c) => c.machineId)).toEqual(["m-chest-fly"]);
  });

  it("puts it at the end of the road when nothing stood in", () => {
    const floor = ROAD.map((id) => ({ id }));
    const m = markCantDo({ plan: PLAN, routine: DAY_ONE, machineId: "m-dip", until: "cleared", day: "2026-10-08", by: who, floor });
    const reopened = reopenCantDo(m.plan, m.routine, "m-dip");
    expect(reopened.intended.at(-1)).toBe("m-dip");
    expect([...reopened.intended].sort()).toEqual([...ROAD].sort());
  });

  it("never adds a machine the road didn't have: an extra from today's routine goes back to being an extra", () => {
    const routine = [...DAY_ONE, "m-bicep"];
    const m = markCantDo({ plan: PLAN, routine, machineId: "m-bicep", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    expect(m.entry.onRoad).toBe(false);
    expect(m.plan.intended).toEqual(ROAD);
    const reopened = reopenCantDo(m.plan, m.routine, "m-bicep");
    expect(reopened.intended).toEqual(ROAD);
    expect(reopened.cantDo).toEqual([]);
  });

  it("changes nothing for a machine that isn't on the bench", () => {
    expect(reopenCantDo(PLAN, DAY_ONE, "m-neck")).toBe(PLAN);
  });
});

describe("day one, while Routine A is empty", () => {
  // AJ, Oct 8 2026: "this also counts with the consult visit, sometimes the
  // consult machines will not be the same as their a routine". Day one rides
  // on the plan and Routine A is empty until the Wrap-up ticks machines in,
  // so a mark made before the consult has to reach day one, or the consult
  // would run a machine the client can't do.
  const PLANNED: RoutinePlan = { ...PLAN, dayOne: DAY_ONE };

  it("puts the stand-in in the machine's place on day one", () => {
    const m = markCantDo({ plan: PLANNED, routine: [], machineId: "m-lumbar", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    expect(m.entry.replacedBy).toEqual(["m-abs"]);
    expect(m.plan.dayOne).toEqual(["m-abs", "m-compound-row", "m-leg-press"]);
    expect(m.plan.intended[0]).toBe("m-abs");
    // Routine A stays empty: nothing here puts day one into it.
    expect(m.routine).toEqual([]);
  });

  it("lets the machine leave day one when nothing on this floor fits", () => {
    const floor = ROAD.filter((id) => id !== "m-lumbar").map((id) => ({ id }));
    const m = markCantDo({ plan: PLANNED, routine: [], machineId: "m-lumbar", until: "cleared", day: "2026-10-08", by: who, floor });
    expect(m.entry.replacedBy).toEqual([]);
    expect(m.plan.dayOne).toEqual(["m-compound-row", "m-leg-press"]);
  });

  it("leaves day one alone for a machine that isn't on it, and adds none to a plan without one", () => {
    const m = markCantDo({ plan: PLANNED, routine: [], machineId: "m-dip", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    expect(m.plan.dayOne).toEqual(DAY_ONE);
    const plain = markCantDo({ plan: PLAN, routine: DAY_ONE, machineId: "m-lumbar", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    expect("dayOne" in plain.plan).toBe(false);
  });

  it("puts the machine back on day one where its stand-in stands when it is reopened", () => {
    const m = markCantDo({ plan: PLANNED, routine: [], machineId: "m-lumbar", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    const reopened = reopenCantDo(m.plan, [], "m-lumbar");
    expect(reopened.dayOne).toEqual(DAY_ONE);
    expect(reopened.intended).toEqual(ROAD);
    expect(reopened.cantDo).toEqual([]);
  });

  it("remembers where the machine stood on day one, only when it was on it", () => {
    const m = markCantDo({ plan: PLANNED, routine: [], machineId: "m-leg-press", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    expect(m.entry.dayOneAt).toBe(2);
    // A mark made again finds it off day one already, so the first mark's place stands.
    const again = markCantDo({ plan: m.plan, routine: [], machineId: "m-leg-press", reason: "Surgery", until: "always", day: "2026-10-09", by: who, floor: ALL });
    expect(again.entry.dayOneAt).toBe(2);
    // Not on day one, or no day one: no key at all (never `undefined`, which Firestore refuses).
    const off = markCantDo({ plan: PLANNED, routine: [], machineId: "m-dip", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    expect("dayOneAt" in off.entry).toBe(false);
    const plain = markCantDo({ plan: PLAN, routine: DAY_ONE, machineId: "m-lumbar", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    expect("dayOneAt" in plain.entry).toBe(false);
  });

  it("puts the machine back on day one where it stood when nothing stood in for it", () => {
    // §4.4: "Reopen puts the machine back where it stood". Marked before the
    // consult on a floor where nothing stands in, the Lumbar left day one;
    // reopened before the consult, the consult runs it again.
    const floor = ROAD.filter((id) => id !== "m-lumbar").map((id) => ({ id }));
    const m = markCantDo({ plan: PLANNED, routine: [], machineId: "m-lumbar", until: "cleared", day: "2026-10-08", by: who, floor });
    expect(m.plan.dayOne).toEqual(["m-compound-row", "m-leg-press"]);
    const reopened = reopenCantDo(m.plan, [], "m-lumbar");
    expect(reopened.dayOne).toEqual(DAY_ONE);
    expect(reopened.intended.at(-1)).toBe("m-lumbar");
    expect(reopened.cantDo).toEqual([]);
  });

  it("puts it back where it stood when its stand-in has left day one since, at the end when day one is shorter now", () => {
    const m = markCantDo({ plan: PLANNED, routine: [], machineId: "m-lumbar", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    const moved = { ...m.plan, dayOne: ["m-compound-row", "m-leg-press"] };
    expect(reopenCantDo(moved, [], "m-lumbar").dayOne).toEqual(DAY_ONE);
    const short: RoutinePlan = {
      ...PLAN,
      intended: ROAD.filter((id) => id !== "m-leg-press"),
      dayOne: ["m-compound-row"],
      cantDo: [{ machineId: "m-leg-press", until: "cleared", day: "2026-10-08", byUid: "u-sam", replacedBy: [], dayOneAt: 5 }],
    };
    expect(reopenCantDo(short, [], "m-leg-press").dayOne).toEqual(["m-compound-row", "m-leg-press"]);
  });

  it("keeps day one as it is when the stand-in is in Routine A by then", () => {
    // After the Wrap-up ticked Abdominals into Routine A, reopening the
    // Lumbar puts it on deck beside it; day one is no longer what runs.
    const m = markCantDo({ plan: PLANNED, routine: [], machineId: "m-lumbar", until: "cleared", day: "2026-10-08", by: who, floor: ALL });
    const reopened = reopenCantDo(m.plan, ["m-abs", "m-compound-row"], "m-lumbar");
    expect(reopened.dayOne).toEqual(m.plan.dayOne);
    expect(reopened.intended.slice(0, 2)).toEqual(["m-lumbar", "m-abs"]);
  });
});

describe("whether a mark still holds", () => {
  const dated: CantDo = { machineId: "m-dip", reason: "Surgery", until: "2026-10-20", day: "2026-10-08", byUid: "u-sam" };

  it("holds until cleared, always, or through its day", () => {
    expect(cantDoActive({ until: "cleared" }, "2027-01-01")).toBe(true);
    expect(cantDoActive({ until: "always" }, "2027-01-01")).toBe(true);
    expect(cantDoActive(dated, "2026-10-19")).toBe(true);
    // "An until-date in the past means the mark has ended" (the design
    // round, §4.4): until Oct 20 still holds on Oct 20, and has ended by
    // itself on Oct 21.
    expect(cantDoActive(dated, "2026-10-20")).toBe(true);
    expect(cantDoActive(dated, "2026-10-21")).toBe(false);
    expect(cantDoActive(dated, "2026-11-01")).toBe(false);
    // A value Journey can't read never lifts a mark.
    expect(cantDoActive({ until: "next week" }, "2027-01-01")).toBe(true);
  });

  it("reads only the marks that still hold, and none from no plan", () => {
    const plan: RoutinePlan = { ...PLAN, cantDo: [dated, { ...dated, machineId: "m-abs", until: "cleared" }] };
    expect(activeCantDo(plan, "2026-10-21").map((c) => c.machineId)).toEqual(["m-abs"]);
    expect(activeCantDo(plan, "2026-10-10")).toHaveLength(2);
    expect(activeCantDo(null, "2026-10-10")).toEqual([]);
  });

  it("takes a typed until-date only when it is today or later: a day gone would make a mark that has already ended", () => {
    expect(untilDayFrom("2026-10-20", "2026-10-08")).toBe("2026-10-20");
    expect(untilDayFrom("2026-10-08", "2026-10-08")).toBe("2026-10-08");
    expect(untilDayFrom("2026-10-07", "2026-10-08")).toBeNull();
    expect(untilDayFrom("", "2026-10-08")).toBeNull();
    expect(untilDayFrom("Oct 20", "2026-10-08")).toBeNull();
  });

  it("lets an ended mark stand in again, and holds the active ones out", () => {
    const plan: RoutinePlan = { ...PLAN, cantDo: [{ ...dated, machineId: "m-chest-fly" }] };
    const before = markCantDo({ plan, routine: DAY_ONE, machineId: "m-dip", until: "cleared", day: "2026-10-10", by: who, floor: ALL });
    expect(before.entry.replacedBy).toEqual(["m-tricep-ext"]);
    const after = markCantDo({ plan, routine: DAY_ONE, machineId: "m-dip", until: "cleared", day: "2026-10-21", by: who, floor: ALL });
    expect(after.entry.replacedBy).toEqual(["m-chest-fly"]);
  });
});

describe("the words", () => {
  it("says the bench's line", () => {
    expect(cantDoLine({ machineId: "m-dip", reason: "Surgery", until: "cleared" }, nameOf)).toBe("Seated Dip · Surgery · until cleared");
    expect(cantDoLine({ machineId: "m-dip", until: "always" }, nameOf)).toBe("Seated Dip · always");
    expect(cantDoLine({ machineId: "m-dip", until: "2026-10-20" }, nameOf, "2026-10-08")).toBe("Seated Dip · until Oct 20");
    expect(cantDoLine({ machineId: "m-dip", until: "2027-01-04" }, nameOf, "2026-10-08")).toBe("Seated Dip · until Jan 4 2027");
    expect(cantDoLine({ machineId: "m-dip", reason: "Surgery", until: "2026-10-20" }, nameOf, "2026-10-20")).toBe(
      "Seated Dip · Surgery · until Oct 20",
    );
    expect(cantDoLine({ machineId: "m-dip", reason: "Surgery", until: "2026-10-20" }, nameOf, "2026-10-21")).toBe(
      "Seated Dip · Surgery · back on Oct 21",
    );
    expect(untilWords("2026-10-20")).toBe("until Oct 20 2026");
  });

  it("says Back on, the day after, once a dated mark has ended, and nothing before", () => {
    expect(backOnLine({ until: "2026-10-20" }, "2026-10-21")).toBe("Back on Oct 21");
    expect(backOnLine({ until: "2026-10-20" }, "2026-10-20")).toBeNull();
    expect(backOnLine({ until: "2026-10-20" }, "2026-10-19")).toBeNull();
    expect(backOnLine({ until: "2026-12-31" }, "2027-01-02")).toBe("Back on Jan 1");
    expect(backOnLine({ until: "cleared" }, "2027-01-01")).toBeNull();
  });

  it("finds the day after on the key alone, across a month, a year and a leap day", () => {
    expect(dayAfterKey("2026-10-20")).toBe("2026-10-21");
    expect(dayAfterKey("2026-10-31")).toBe("2026-11-01");
    expect(dayAfterKey("2026-12-31")).toBe("2027-01-01");
    expect(dayAfterKey("2028-02-28")).toBe("2028-02-29");
    expect(dayAfterKey("2027-02-28")).toBe("2027-03-01");
    expect(dayAfterKey("someday")).toBe("someday");
  });

  it("says two stand-ins together", () => {
    expect(standInLine({ machineId: "m-chest-press", replacedBy: ["m-chest-fly", "m-tricep-ext"] }, nameOf)).toBe(
      "Chest Flye and Triceps Extension instead of Chest Press",
    );
  });

  it("stores a change's words and reads them back", () => {
    expect(cantDoValue({ reason: "Surgery", until: "2026-11-03" })).toBe("Surgery · 2026-11-03");
    expect(cantDoValue({ until: "cleared" })).toBe("cleared");
    expect(parseCantDoValue("Surgery · 2026-11-03")).toEqual({ reason: "Surgery", until: "2026-11-03" });
    expect(parseCantDoValue("always")).toEqual({ until: "always" });
    expect(parseCantDoValue(undefined)).toEqual({ until: "cleared" });
  });

  it("replaces in place without doubling a machine", () => {
    expect(replaceAt(["a", "b", "c"], "b", ["x"])).toEqual(["a", "x", "c"]);
    expect(replaceAt(["a", "b", "c"], "b", ["c"])).toEqual(["a", "c"]);
    expect(replaceAt(["a", "b"], "z", ["x"])).toEqual(["a", "b"]);
  });
});

describe("a health reason offers a Health note", () => {
  it("offers one for Surgery and for Injury or pain, filed under the notes' own Health flavours", () => {
    expect(healthNoteOffer("Surgery")).toEqual({ category: "health", flavour: "Surgery", label: "Surgery" });
    expect(healthNoteOffer("Injury or pain")).toEqual({ category: "health", flavour: "Injury", label: "Injury or pain" });
    // The words are the notes catalog's, so the two can't drift apart.
    for (const offer of [healthNoteOffer("Surgery"), healthNoteOffer("Injury or pain")]) {
      expect(HEALTH_FLAVOURS.some((f) => f.id === offer!.flavour && f.label === offer!.label)).toBe(true);
    }
  });

  it("offers none for any other reason, or for none", () => {
    expect(healthNoteOffer("Doesn't fit the machine")).toBeNull();
    expect(healthNoteOffer("Client won't")).toBeNull();
    expect(healthNoteOffer("Medication")).toBeNull();
    expect(healthNoteOffer(undefined)).toBeNull();
    expect(healthNoteOffer("  ")).toBeNull();
    expect(CANT_DO_REASONS.filter((r) => healthNoteOffer(r) !== null)).toEqual(["Surgery", "Injury or pain"]);
  });
});
