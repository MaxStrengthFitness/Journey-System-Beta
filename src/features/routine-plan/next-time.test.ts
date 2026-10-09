/**
 * The Wrap-up's Next time, the pure half (the design round, Oct 8 2026,
 * §4.7): what is offered, the line that asks, Routine A for next time as
 * the ticks change, the Road under them, and the one write on the way out.
 */
import { describe, expect, it } from "vitest";
import type { Routine } from "../../types";
import {
  asRoutineIds,
  nextTimeAfter,
  nextTimeAsk,
  nextTimeAskWords,
  nextTimeAtFinish,
  nextTimeOffer,
  nextTimeProgressLine,
  nextTimeRoad,
  nextTimeWhyWords,
  nextTimeWrite,
  ranAsFree,
  routineHolds,
  routineWords,
  sameTicks,
  tickedInOrder,
  withRoutineNow,
  type NextTimeSnapshot,
} from "./next-time";
import type { RoutinePlan } from "./types";

const NAMES: Record<string, string> = {
  "m-leg-press": "Leg Press",
  "m-compound-row": "Compound Row",
  "m-lumbar": "Lumbar",
  "m-chest-press": "Chest Press",
  "m-hip-abd": "Hip Abduction",
  "m-ext": "Leg Extension",
  "m-curl": "Leg Curl",
};
const nameOf = (id: string) => NAMES[id] ?? id;
const FLOOR = Object.keys(NAMES).map((id) => ({ id, name: NAMES[id] }));
const TODAY = "2026-10-08";
const WHO = { uid: "uid-sam", name: "Sam Lee" };

const plan = (extra: Partial<RoutinePlan> = {}): RoutinePlan => ({
  purpose: "",
  intended: ["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press", "m-hip-abd", "m-ext"],
  dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"],
  building: true,
  madeByUid: "uid-sam",
  ...extra,
});

const routineA = (machineIds: string[], p: RoutinePlan | null = plan()): Routine =>
  ({ id: "ra", clientId: "c1", name: "Routine A", machineIds, ...(p ? { plan: p } : null) }) as Routine;

const snapAt = (
  routine: Routine | null,
  performed: string[],
  extra: { routineId?: string | null; free?: boolean; others?: Routine[]; held?: string[]; floor?: typeof FLOOR } = {},
) =>
  nextTimeAtFinish({
    free: extra.free ?? false,
    routineId: extra.routineId === undefined ? (routine?.id ?? null) : extra.routineId,
    routines: [...(routine ? [routine] : []), ...(extra.others ?? [])],
    performed,
    floor: extra.floor ?? FLOOR,
    nameOf,
    todayYmd: TODAY,
    ...(extra.held ? { heldDuringSession: extra.held } : null),
  });

describe("what the card reads, frozen at Finish", () => {
  it("is the routine the session ran, its machines and plan, today's performed machines and their names", () => {
    const snap = snapAt(routineA([]), ["m-leg-press", "m-compound-row", "m-lumbar", "m-ext"])!;
    expect(snap.routineId).toBe("ra");
    expect(snap.routineName).toBe("Routine A");
    expect(snap.machineIds).toEqual([]);
    expect(snap.plan?.dayOne).toEqual(["m-leg-press", "m-compound-row", "m-lumbar"]);
    expect(snap.performed).toEqual(["m-leg-press", "m-compound-row", "m-lumbar", "m-ext"]);
    // Every machine the Road may draw has its name, whole.
    for (const id of plan().intended) expect(snap.names[id]).toBe(NAMES[id]);
  });

  it("is nothing for a Free session (no Next time)", () => {
    expect(snapAt(routineA(["m-leg-press"]), ["m-leg-press"], { free: true, routineId: null })).toBeNull();
  });

  it("is nothing while the routines aren't known: a read not answered is unknown, never 'none'", () => {
    expect(
      nextTimeAtFinish({ free: false, routineId: null, routines: null, performed: ["m-leg-press"], floor: FLOOR, nameOf, todayYmd: TODAY }),
    ).toBeNull();
  });

  it("is nothing when the session's routine isn't among them (not read: can't tell)", () => {
    expect(snapAt(routineA([]), ["m-leg-press"], { routineId: "somebody-else" })).toBeNull();
  });

  it("is nothing for a session that ran no routine while the client has a Routine A: never a second one", () => {
    expect(snapAt(null, ["m-leg-press"], { routineId: null, others: [routineA(["m-lumbar"], null)] })).toBeNull();
    // Either spelling of its name.
    expect(snapAt(null, ["m-leg-press"], { routineId: null, others: [{ id: "old", clientId: "c1", name: "A", machineIds: [] } as Routine] })).toBeNull();
  });

  it("with no routine and none to find, starts Routine A from the ticks, with no plan", () => {
    const snap = snapAt(null, ["m-leg-press", "m-lumbar"], { routineId: null })!;
    expect(snap.routineId).toBeNull();
    expect(snap.routineName).toBe("Routine A");
    expect(snap.machineIds).toEqual([]);
    expect(snap.plan).toBeNull();
  });

  it("reads a plan with no road as no plan", () => {
    const odd = { ...routineA(["m-leg-press"], null), plan: { building: true } } as unknown as Routine;
    expect(snapAt(odd, ["m-leg-press", "m-ext"])!.plan).toBeNull();
  });

  it("says a routine named 'A' by an older seeder as Routine A", () => {
    expect(routineWords("A")).toBe("Routine A");
    expect(routineWords("b")).toBe("Routine B");
    expect(routineWords("Routine B")).toBe("Routine B");
    expect(routineWords("")).toBe("Routine A");
  });

  it("reads a studio's own unit as the machine the plan holds, so it is never offered twice", () => {
    const floor = [...FLOOR, { id: "unit-7", name: "Leg Press (Hoist)", canonicalId: "m-leg-press" }];
    expect(asRoutineIds(["unit-7", "m-ext"], { routine: [], plan: plan(), floor })).toEqual(["m-leg-press", "m-ext"]);
    // One the routine already holds is the routine's own, and so not offered.
    expect(asRoutineIds(["unit-7"], { routine: ["m-leg-press"], plan: null, floor })).toEqual(["m-leg-press"]);
    expect(asRoutineIds(["m-ext", "m-ext"], { routine: [], plan: null, floor })).toEqual(["m-ext"]);
  });
});

describe("the rows and the line that asks", () => {
  it("the consult: Routine A empty, every row unticked, day one said as such, 'Tick the ones that start Routine A'", () => {
    const snap = snapAt(routineA([]), ["m-leg-press", "m-compound-row", "m-lumbar", "m-ext", "m-curl"])!;
    const rows = nextTimeOffer(snap);
    expect(rows.map((r) => [r.machineId, r.defaultOn, r.why])).toEqual([
      ["m-leg-press", false, "day-one"],
      ["m-compound-row", false, "day-one"],
      ["m-lumbar", false, "day-one"],
      ["m-ext", false, "planned"],
      ["m-curl", false, "added-today"],
    ]);
    expect(nextTimeAsk(snap)).toBe("start");
    expect(nextTimeAskWords("start", snap.routineName)).toBe("Tick the ones that start Routine A.");
  });

  it("a routine with machines being built: today's join, ticked", () => {
    const snap = snapAt(routineA(["m-leg-press", "m-compound-row", "m-lumbar"]), ["m-leg-press", "m-lumbar", "m-chest-press", "m-curl"])!;
    const rows = nextTimeOffer(snap);
    expect(rows.map((r) => [r.machineId, r.defaultOn, r.why])).toEqual([
      ["m-chest-press", true, "planned"],
      ["m-curl", true, "added-today"],
    ]);
    expect(nextTimeAsk(snap)).toBe("building");
    expect(nextTimeAskWords("building", "Routine A")).toBe(
      "Routine A is being built, so today's machines join it. Untick one to leave it out.",
    );
  });

  it("an established routine changes on purpose: unticked, 'Tick a machine to keep it'", () => {
    const snap = snapAt(routineA(["m-leg-press"], plan({ building: false })), ["m-leg-press", "m-ext"])!;
    expect(nextTimeOffer(snap).map((r) => r.defaultOn)).toEqual([false]);
    expect(nextTimeAsk(snap)).toBe("keep");
    expect(nextTimeAskWords("keep", "Routine A")).toBe("Tick a machine to keep it in Routine A.");
  });

  it("a short day never shrinks the routine: only performed machines the routine lacks are offered", () => {
    const snap = snapAt(routineA(["m-leg-press", "m-lumbar"]), ["m-leg-press"])!;
    expect(nextTimeOffer(snap)).toEqual([]);
  });

  it("says why each row is here, and never 'not in the plan' when there is no plan", () => {
    expect(nextTimeWhyWords("day-one", true)).toBe("Day one");
    expect(nextTimeWhyWords("planned", true)).toBe("Next in the plan");
    expect(nextTimeWhyWords("added-today", true)).toBe("Added today · not in the plan");
    expect(nextTimeWhyWords("added-today", false)).toBe("Added today");
  });

  it("keeps the ticks in today's order, each once, and only the rows offered", () => {
    const snap = snapAt(routineA([]), ["m-leg-press", "m-compound-row", "m-lumbar"])!;
    expect(tickedInOrder(nextTimeOffer(snap), ["m-lumbar", "m-leg-press", "m-lumbar", "m-nope"])).toEqual(["m-leg-press", "m-lumbar"]);
  });
});

describe("Routine A for next time, live as the ticks change", () => {
  const snap = () => snapAt(routineA([]), ["m-leg-press", "m-compound-row", "m-lumbar", "m-curl"])!;

  it("nothing ticked on an empty Routine A: it stays empty and the next visit runs day one again", () => {
    const after = nextTimeAfter(snap(), []);
    expect(after.routine).toEqual([]);
    expect(after.runs).toEqual(["m-leg-press", "m-compound-row", "m-lumbar"]);
    expect(nextTimeProgressLine(after, nameOf)).toBe("0 of 6 · day one: Leg Press, Compound Row and Lumbar");
    const road = nextTimeRoad(after, [], { todayYmd: TODAY, firstName: "Dana" });
    expect(road[0].label).toBe("Next time · 3");
    expect(road[0].stations.every((s) => !s.mark)).toBe(true);
    expect(road[1].stations.find((s) => s.kind === "next")?.id).toBe("m-chest-press");
  });

  it("ticked: Routine A starts with them in the road's order, a machine new to the plan joins its road, and 'Joins' marks them", () => {
    const after = nextTimeAfter(snap(), ["m-lumbar", "m-leg-press", "m-curl"]);
    expect(after.routine).toEqual(["m-leg-press", "m-lumbar", "m-curl"]);
    expect(after.plan?.intended.at(-1)).toBe("m-curl");
    expect(after.runs).toEqual(after.routine);
    expect(nextTimeProgressLine(after, nameOf)).toBe("3 of 7 · next: Compound Row");
    const road = nextTimeRoad(after, ["m-lumbar", "m-leg-press", "m-curl"], { todayYmd: TODAY });
    expect(road[0].stations.map((s) => [s.id, s.mark])).toEqual([
      ["m-leg-press", "Joins"],
      ["m-lumbar", "Joins"],
      ["m-curl", "Joins"],
    ]);
  });

  it("with no plan: the routine's machines under the bracket, no progress line; nothing to draw with nothing at all", () => {
    const none = snapAt(null, ["m-leg-press", "m-lumbar"], { routineId: null })!;
    expect(nextTimeRoad(nextTimeAfter(none, []), [], { todayYmd: TODAY })).toEqual([]);
    const after = nextTimeAfter(none, ["m-lumbar"]);
    expect(after.routine).toEqual(["m-lumbar"]);
    expect(nextTimeProgressLine(after, nameOf)).toBeNull();
    expect(nextTimeRoad(after, ["m-lumbar"], { todayYmd: TODAY }).map((g) => g.stations.map((s) => s.id))).toEqual([["m-lumbar"]]);
  });
});

describe("the one write, on the way out", () => {
  it("nothing ticked writes nothing", () => {
    const snap = snapAt(routineA([]), ["m-leg-press"])!;
    expect(nextTimeWrite(snap, [], WHO)).toBeNull();
    expect(nextTimeWrite(snap, ["m-not-offered"], WHO)).toBeNull();
  });

  it("a plan: the routine for next time, the plan after it, and an 'add' into Routine A for the plan's own machines", () => {
    const snap = snapAt(routineA([]), ["m-leg-press", "m-compound-row", "m-lumbar"])!;
    const w = nextTimeWrite(snap, ["m-lumbar", "m-leg-press"], WHO)!;
    expect(w).toEqual({
      kind: "plan",
      routineId: "ra",
      plan: snap.plan,
      change: { kind: "add", machineIds: ["m-leg-press", "m-lumbar"], value: "routine", byUid: "uid-sam", byName: "Sam Lee" },
      machineIds: ["m-leg-press", "m-lumbar"],
    });
  });

  it("a machine the plan didn't name joins its road too, a plain 'add' beside it in the same batch", () => {
    const snap = snapAt(routineA(["m-leg-press"]), ["m-leg-press", "m-chest-press", "m-curl"])!;
    const w = nextTimeWrite(snap, ["m-chest-press", "m-curl"], { uid: "uid-sam" });
    expect(w?.kind).toBe("plan");
    if (w?.kind !== "plan") return;
    expect(w.change).toEqual({ kind: "add", machineIds: ["m-chest-press"], value: "routine", byUid: "uid-sam" });
    expect(w.also).toEqual([{ kind: "add", machineIds: ["m-curl"], byUid: "uid-sam" }]);
    expect(w.plan.intended).toContain("m-curl");
    expect(w.machineIds).toEqual(["m-leg-press", "m-chest-press", "m-curl"]);
  });

  it("only machines new to the plan: one plain 'add', no Routine-only change", () => {
    const snap = snapAt(routineA(["m-leg-press"]), ["m-leg-press", "m-curl"])!;
    const w = nextTimeWrite(snap, ["m-curl"], WHO);
    expect(w?.kind === "plan" && w.change).toEqual({ kind: "add", machineIds: ["m-curl"], byUid: "uid-sam", byName: "Sam Lee" });
    expect(w?.kind === "plan" && w.also).toBeUndefined();
  });

  it("a plan's change can't be signed without the Auth uid (the rules pin it): nothing written", () => {
    const snap = snapAt(routineA([]), ["m-leg-press"])!;
    expect(nextTimeWrite(snap, ["m-leg-press"], null)).toBeNull();
  });

  it("a routine with no plan: its machines and nothing else", () => {
    const snap = snapAt(routineA(["m-leg-press"], null), ["m-leg-press", "m-lumbar", "m-ext"])!;
    expect(nextTimeWrite(snap, ["m-ext", "m-lumbar"], null)).toEqual({
      kind: "routine",
      routineId: "ra",
      machineIds: ["m-leg-press", "m-lumbar", "m-ext"],
      previousMachineIds: ["m-leg-press"],
    });
  });

  it("no routine: Routine A made with the ticked machines in today's order, and no plan", () => {
    const snap = snapAt(null, ["m-lumbar", "m-leg-press"], { routineId: null })!;
    expect(nextTimeWrite(snap, ["m-leg-press", "m-lumbar"], WHO)).toEqual({
      kind: "create",
      name: "Routine A",
      machineIds: ["m-lumbar", "m-leg-press"],
    });
  });

  it("a Routine A made since Finish takes the ticks: never a second one", () => {
    const snap = snapAt(null, ["m-lumbar", "m-leg-press"], { routineId: null })!;
    const now = routineA(["m-leg-press"], null);
    const moved = withRoutineNow(snap, now);
    expect(moved.routineId).toBe("ra");
    expect(nextTimeWrite(moved, ["m-leg-press", "m-lumbar"], WHO, { rows: nextTimeOffer(snap) })).toEqual({
      kind: "routine",
      routineId: "ra",
      machineIds: ["m-leg-press", "m-lumbar"],
      previousMachineIds: ["m-leg-press"],
    });
    // Another routine, or none read, leaves the snapshot as it was.
    const named = snapAt(routineA([]), ["m-leg-press"])!;
    expect(withRoutineNow(named, { ...routineA(["m-ext"], null), id: "rb" } as Routine)).toBe(named);
    expect(withRoutineNow(snap, undefined)).toBe(snap);
  });

  it("starts from the routine as it stands NOW: a change made on another iPad since Finish is kept, never written over", () => {
    // Frozen at Finish: Routine A with Leg Press, being built; today brought Chest Press.
    const frozen = snapAt(routineA(["m-leg-press"]), ["m-leg-press", "m-chest-press"])!;
    // Since Finish, Programming took Leg Press out and put Lumbar in, and reordered the road.
    const since = routineA(["m-lumbar"], plan({ intended: ["m-lumbar", "m-leg-press", "m-compound-row", "m-chest-press", "m-hip-abd", "m-ext"] }));
    const now = withRoutineNow(frozen, since);
    expect(now.machineIds).toEqual(["m-lumbar"]);
    const w = nextTimeWrite(now, ["m-chest-press"], WHO, { rows: nextTimeOffer(frozen) });
    expect(w?.kind).toBe("plan");
    if (w?.kind !== "plan") return;
    // Lumbar kept, Leg Press not put back, and the road as Programming left it.
    expect(w.machineIds).toEqual(["m-lumbar", "m-chest-press"]);
    expect(w.plan.intended).toEqual(since.plan!.intended);
  });
});

/*
 * The review of the Next time phase (Oct 9 2026): the session's Plan sheet
 * changes Routine A at once (Can't do, Swap in the plan, Re-plan) and says
 * "Today's set stays. The plan changes from next session." A machine whose
 * set was logged before that is performed today but no longer in the
 * routine, so without these it came back as "Added today", ticked while
 * the plan is being built, and an untouched Back to Hub undid the change.
 */
describe("a machine let go today is never offered back", () => {
  const routineBuilt = ["m-leg-press", "m-compound-row", "m-lumbar"];
  const today = ["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press", "m-hip-abd"];

  it("Can't do, marked after its set was logged: not offered, so neither the default ticks nor Tick all put it back", () => {
    // The mark took Chest Press off the road and benched it.
    const marked = plan({
      intended: ["m-leg-press", "m-compound-row", "m-lumbar", "m-hip-abd", "m-ext"],
      cantDo: [{ machineId: "m-chest-press", until: "cleared", day: TODAY, byUid: "uid-sam", replacedBy: [], onRoad: true }],
    });
    const held = routineHolds(routineA(routineBuilt));
    const snap = snapAt(routineA(routineBuilt, marked), today, { held })!;
    expect(nextTimeOffer(snap).map((r) => r.machineId)).toEqual(["m-hip-abd"]);
    // Read by the catalog machine: a studio's own unit of it is benched too.
    const floor = [...FLOOR, { id: "unit-cp", name: "Chest Press (Nautilus)", canonicalId: "m-chest-press" }];
    const viaUnit = snapAt(routineA(routineBuilt, marked), ["m-leg-press", "unit-cp"], { floor })!;
    expect(nextTimeOffer(viaUnit)).toEqual([]);
  });

  it("a mark that has ended doesn't hold: the machine is offered again", () => {
    const ended = plan({
      cantDo: [{ machineId: "m-curl", until: "2026-10-01", day: "2026-09-20", byUid: "uid-sam", replacedBy: [], onRoad: false }],
    });
    const snap = snapAt(routineA(routineBuilt, ended), ["m-leg-press", "m-curl"])!;
    expect(nextTimeOffer(snap).map((r) => r.machineId)).toEqual(["m-curl"]);
  });

  it("Swap in the plan after the set was logged: the machine swapped out is not offered back; the one swapped in is", () => {
    // At Start the road had Chest Press; the trainer swapped it for Leg Extension.
    const held = routineHolds(routineA(routineBuilt));
    const swapped = plan({ intended: ["m-leg-press", "m-compound-row", "m-lumbar", "m-ext", "m-hip-abd"] });
    const snap = snapAt(routineA(routineBuilt, swapped), [...routineBuilt, "m-chest-press", "m-ext"], { held })!;
    expect(nextTimeOffer(snap).map((r) => [r.machineId, r.defaultOn])).toEqual([["m-ext", true]]);
    // And with nothing held, the old reading: an extra today.
    const unheld = snapAt(routineA(routineBuilt, swapped), [...routineBuilt, "m-chest-press"])!;
    expect(nextTimeOffer(unheld).map((r) => r.machineId)).toEqual(["m-chest-press"]);
  });

  it("a machine taken out of Routine A and off the road meanwhile (a Re-plan) is let go; one still on the road is not", () => {
    const held = routineHolds(routineA(routineBuilt));
    const replanned = plan({ intended: ["m-leg-press", "m-lumbar", "m-hip-abd"], dayOne: ["m-leg-press", "m-lumbar"] });
    const snap = snapAt(routineA(["m-leg-press", "m-lumbar"], replanned), [...routineBuilt, "m-hip-abd"], { held })!;
    expect(nextTimeOffer(snap).map((r) => r.machineId)).toEqual(["m-hip-abd"]);
  });

  it("in a B session, Routine A's can't-do and A's changes count too (B and every screen read A's)", () => {
    const marked = plan({
      intended: ["m-leg-press", "m-compound-row", "m-lumbar"],
      cantDo: [{ machineId: "m-chest-press", until: "always", day: TODAY, byUid: "uid-sam", replacedBy: [], onRoad: true }],
    });
    const a = routineA(routineBuilt, marked);
    const b = { id: "rb", clientId: "c1", name: "Routine B", machineIds: ["m-leg-press"] } as Routine;
    const snap = snapAt(b, ["m-leg-press", "m-chest-press", "m-curl"], { others: [a] })!;
    expect(snap.routineId).toBe("rb");
    expect(nextTimeOffer(snap).map((r) => r.machineId)).toEqual(["m-curl"]);
  });

  it("holds: a routine's machines, its road and its day one, each once", () => {
    expect(routineHolds(routineA(["m-curl", "m-leg-press"]))).toEqual([
      "m-curl",
      "m-leg-press",
      "m-compound-row",
      "m-lumbar",
      "m-chest-press",
      "m-hip-abd",
      "m-ext",
    ]);
    expect(routineHolds(routineA(["m-curl"], null))).toEqual(["m-curl"]);
    expect(routineHolds(null)).toEqual([]);
  });
});

describe("whether the session ran Free", () => {
  const floor = ["m-leg-press", "m-lumbar"];
  it("started here: as it was started, however much of the floor it ran", () => {
    expect(ranAsFree({ startedAs: "Free", routineId: null, floor, today: [] })).toBe(true);
    // A session built on the fly as Routine A for a client with no routine is never Free.
    expect(ranAsFree({ startedAs: "A", routineId: null, floor, today: floor })).toBe(false);
    expect(ranAsFree({ startedAs: "B", routineId: "rb", floor, today: floor })).toBe(false);
  });
  it("resumed (no record here): no routine over the whole floor reads as Free; anything less doesn't", () => {
    expect(ranAsFree({ startedAs: null, routineId: null, floor, today: ["m-lumbar", "m-leg-press"] })).toBe(true);
    expect(ranAsFree({ startedAs: null, routineId: null, floor, today: ["m-lumbar"] })).toBe(false);
    expect(ranAsFree({ startedAs: null, routineId: "ra", floor, today: floor })).toBe(false);
    expect(ranAsFree({ startedAs: null, routineId: null, floor: [], today: [] })).toBe(false);
  });
});

/*
 * The review of the Next time phase (Oct 9 2026): locking the iPad, or
 * opening Mindbody to book the next visit, wrote the ticks and then locked
 * them. Now the ticks stay open, and a later way out hands them over again
 * when they changed; the write carries only the difference.
 */
describe("handed over again: only the difference", () => {
  // Routine A with machines, being built; today brought Chest Press (on the road) and Leg Curl (not).
  const frozen = () => snapAt(routineA(["m-leg-press"]), ["m-leg-press", "m-chest-press", "m-curl"])!;
  /** The routine as the first write left it. */
  const afterFirst = (s: NextTimeSnapshot, ticked: string[]) => {
    const w = nextTimeWrite(s, ticked, WHO);
    if (w?.kind !== "plan") throw new Error("expected a plan write");
    return withRoutineNow(s, routineA(w.machineIds, w.plan));
  };

  it("the same ticks again write nothing", () => {
    const s = frozen();
    const now = afterFirst(s, ["m-chest-press", "m-curl"]);
    expect(nextTimeWrite(now, ["m-chest-press", "m-curl"], WHO, { rows: nextTimeOffer(s), earlier: ["m-chest-press", "m-curl"] })).toBeNull();
    expect(sameTicks(["m-chest-press", "m-curl"], ["m-chest-press", "m-curl"])).toBe(true);
    expect(sameTicks(["m-chest-press"], ["m-chest-press", "m-curl"])).toBe(false);
  });

  it("unticked since: out of Routine A, a planned machine stays on deck, one new to the plan comes off the road", () => {
    const s = frozen();
    const now = afterFirst(s, ["m-chest-press", "m-curl"]);
    expect(now.machineIds).toEqual(["m-leg-press", "m-chest-press", "m-curl"]);
    expect(now.plan!.intended).toContain("m-curl");
    const w = nextTimeWrite(now, [], WHO, { rows: nextTimeOffer(s), earlier: ["m-chest-press", "m-curl"] });
    expect(w?.kind).toBe("plan");
    if (w?.kind !== "plan") return;
    expect(w.machineIds).toEqual(["m-leg-press"]);
    expect(w.plan.intended).toEqual(plan().intended);
    expect([w.change, ...(w.also ?? [])]).toEqual([
      { kind: "remove", machineIds: ["m-chest-press"], value: "routine", byUid: "uid-sam", byName: "Sam Lee" },
      { kind: "remove", machineIds: ["m-curl"], byUid: "uid-sam", byName: "Sam Lee" },
    ]);
  });

  it("ticked since: joins as on the first write, and nothing written before is written again", () => {
    const s = frozen();
    const now = afterFirst(s, ["m-chest-press"]);
    const w = nextTimeWrite(now, ["m-chest-press", "m-curl"], WHO, { rows: nextTimeOffer(s), earlier: ["m-chest-press"] });
    expect(w?.kind === "plan" && w.machineIds).toEqual(["m-leg-press", "m-chest-press", "m-curl"]);
    expect(w?.kind === "plan" && [w.change, ...(w.also ?? [])]).toEqual([{ kind: "add", machineIds: ["m-curl"], byUid: "uid-sam", byName: "Sam Lee" }]);
  });

  it("a routine with no plan: the routine's machines less the unticked, with what it held before", () => {
    const s = snapAt(routineA(["m-leg-press"], null), ["m-leg-press", "m-lumbar", "m-ext"])!;
    const now = withRoutineNow(s, routineA(["m-leg-press", "m-lumbar", "m-ext"], null));
    expect(nextTimeWrite(now, ["m-ext"], null, { rows: nextTimeOffer(s), earlier: ["m-lumbar", "m-ext"] })).toEqual({
      kind: "routine",
      routineId: "ra",
      machineIds: ["m-leg-press", "m-ext"],
      previousMachineIds: ["m-leg-press", "m-lumbar", "m-ext"],
    });
  });

  it("no routine: Routine A is made by the first write only, never a second", () => {
    const s = snapAt(null, ["m-leg-press", "m-lumbar"], { routineId: null })!;
    expect(nextTimeWrite(s, ["m-leg-press", "m-lumbar"], WHO, { earlier: ["m-leg-press"] })).toBeNull();
    // Once the Routine A it made is in sight, the change goes into it.
    const made = withRoutineNow(s, routineA(["m-leg-press"], null));
    expect(nextTimeWrite(made, ["m-leg-press", "m-lumbar"], WHO, { rows: nextTimeOffer(s), earlier: ["m-leg-press"] })).toEqual({
      kind: "routine",
      routineId: "ra",
      machineIds: ["m-leg-press", "m-lumbar"],
      previousMachineIds: ["m-leg-press"],
    });
  });
});

describe("the snapshot is plain data", () => {
  it("holds nothing Firestore refuses", () => {
    const snap = snapAt(routineA([]), ["m-leg-press"]) as NextTimeSnapshot;
    expect(JSON.stringify(snap)).not.toContain("undefined");
    expect(Object.values(snap).some((v) => v === undefined)).toBe(false);
  });
});
