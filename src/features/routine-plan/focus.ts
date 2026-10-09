/**
 * A weak area (AJ, Oct 7 2026: "we discovered that the client has very weak
 * delts. What can we do about to adjust the routines currently?"; his yes to
 * the proposal in docs/rounds/2026-10-07-first-session-and-routines.md §5.4b,
 * "yes lets apply this all"). Built on Programming's Lineup in Round 2 of the
 * design round (item 7; docs/rounds/2026-10-08-first-session-screens.md §4c).
 *
 * The Academy has no weak-point rule of its own. What it does say answers it:
 * - a region you want to grow is hit in BOTH workouts of the week ("key
 *   exercises should be repeated in the A and B", the Exercise Selection
 *   Template; `TWICE_WEEKLY_RULE`), so each routine is judged as it RUNS
 *   (Routine A and Routine B today); what is only on the plan is said as
 *   such, "not in Routine A yet";
 * - a machine for it goes in "if time permits or used to replace a lower
 *   priority muscle group" (A/B Routines), so a swap within the same family
 *   comes before an addition (AJ's own example: Seated Dip → Overhead Press);
 * - extra slots beyond the Big 5 go to single-joint machines ("add in the
 *   lateral raise and some direct, single joint arm exercises", Programming
 *   and Progression 1);
 * - pre-exhausting the weak muscle is not a default ("based on the faulty
 *   premise that fatigue is a stimulus").
 * So this never reorders a routine to put the weak area first, and never
 * moves a weight. Every answer is a suggestion a trainer taps, and none
 * offers a machine the client can't do, nor counts one as working the area.
 *
 * The middle delt waits: the Academy names Lateral Raise's target as the
 * middle delt, but the anatomy map has no `delts-side` id yet, because the
 * body figure draws front and back only and the middle delt has nowhere to be
 * shown (AJ, §2b: "we need to somehow figure out a side view for our
 * viewer"). Until the side view and its id arrive, Delts works through the
 * front and rear delt ids, and Lateral Raise is read as the map has it.
 */
import { MACHINE_ANATOMY, type MuscleId } from "../../data/machine-anatomy-map";
import { CATEGORY_LABEL, EXERCISE_COUNT, FOUNDATIONAL_CATEGORIES, MACHINE_CATEGORY } from "../routine-builder/academy";
import { bIntendedOf, bSlotKept, bSlotPlanned, droppedFromB, swapsMade, swapsOf, type BEdit } from "./b-routine";
import type { PlanEdit } from "./lineup";
import { applyPlanChange, listWords } from "./plan";
import { floorCanonical, floorIndex, type FloorMachine } from "./starting-plan";
import type { RoutinePlan } from "./types";

/**
 * Areas a trainer picks, each the muscle ids it covers. "Delts" is the front
 * and rear delt the anatomy map knows; the middle delt (Lateral Raise's, per
 * the Academy) has no id yet, which waits on the body figure's side view.
 * The order is the order the chips are drawn in.
 */
export const FOCUS_AREAS: Record<string, { label: string; muscles: MuscleId[] }> = {
  delts: { label: "Delts", muscles: ["delts-front", "delts-rear"] },
  chest: { label: "Chest", muscles: ["pecs"] },
  "upper-back": { label: "Upper back", muscles: ["lats", "rhomboids", "traps"] },
  biceps: { label: "Biceps", muscles: ["biceps"] },
  triceps: { label: "Triceps", muscles: ["triceps"] },
  grip: { label: "Grip", muscles: ["forearms"] },
  "low-back": { label: "Low back", muscles: ["lower-back"] },
  core: { label: "Core", muscles: ["abs", "obliques"] },
  glutes: { label: "Glutes", muscles: ["glutes", "abductors"] },
  quads: { label: "Quads", muscles: ["quads"] },
  hamstrings: { label: "Hamstrings", muscles: ["hamstrings"] },
  adductors: { label: "Inner thigh", muscles: ["adductors"] },
  neck: { label: "Neck", muscles: ["neck"] },
};

/** Where every answer comes from, said on the panel (the Academy, never the app's own idea). */
export const FOCUS_SOURCE = "Academy · Exercise Selection Template / A/B Routines";

/** The words that close the answers: what a focus never does. */
export const FOCUS_NEVER = "Nothing here moves the order or a weight.";

/** A Routine B of its own (from before Round 2): read on the first answer, never changed from here. */
export const FOCUS_B_OWN = "Routine B is its own list, so B changes on Routine B, not here.";

/** Areas the Academy answers with settings rather than machines. */
const SETTINGS_NOT_MACHINES: Record<string, string> = {
  grip: "Grip usually adapts with the pulling machines already in the routine (Exercise Selection Template). Hand pads help while it does.",
  triceps: "Weak triceps on the Triceps Extension can be helped with a gap setting first (Comprehensive Equipment Overview, Triceps Extension).",
};

/**
 * The simple (single-joint) machines: the Academy's "Simple exercises
 * produce a rotary movement pattern and usually involve only one joint. They
 * are also known as single joint or rotary form exercises" (Basic Equipment
 * and Exercise Information), as the catalog classes them
 * (`kinematicClass: "rotary-single-joint"` in data/machine-definitions.ts;
 * focus.test.ts holds the two together, so the big catalog file stays off
 * the screens that read this).
 */
export const SINGLE_JOINT: ReadonlySet<string> = new Set([
  "m-ext",
  "m-pullover",
  "m-chest-fly",
  "m-bicep",
  "m-tricep-ext",
  "m-leg-curl",
  "m-simple-row",
  "m-abs",
  "m-torso-rotation",
  "m-lumbar",
  "m-neck",
  "m-hip-abd",
  "m-hip-add",
  "m-lateral-raise",
]);

/**
 * The extra slots the Academy names first: "the instructor may add in the
 * lateral raise and some direct, single joint arm exercises" (Programming
 * and Progression 1). An addition offers these before any other single-joint
 * machine, and a single-joint machine before a compound one.
 */
const ADD_FIRST = ["m-lateral-raise", "m-bicep", "m-tricep-ext"];

const once = (ids: readonly string[]) => ids.filter((id, i) => !!id && ids.indexOf(id) === i);

export type FocusRole = "primary" | "helper";
export type FocusWhich = "A" | "B";

export interface FocusMachine {
  /** Floor id. */
  machineId: string;
  /** Works the area as a primary mover, or as a helper. */
  role: FocusRole;
}

export interface FocusSwap {
  routine: FocusWhich;
  /** Floor ids: the machine that goes, and the one that takes its place. */
  from: string;
  to: string;
}

export interface FocusAdd {
  routine: FocusWhich;
  machineId: string;
  /** True when adding it takes the routine past the Academy's comfortable count (8). */
  overCount: boolean;
}

export interface FocusAdvice {
  area: string;
  /** This floor's machines that work the area. */
  machines: FocusMachine[];
  /** The machines in each routine that already work it. */
  inA: string[];
  inB: string[] | null;
  /** 1 · Each routine without it, and what would bring it in. */
  missingFrom: FocusWhich[];
  /** 2 · Swaps within the same Academy category, so the routine keeps its length and balance. */
  swaps: FocusSwap[];
  /** 3 · Additions: the Academy's named extras, then single-joint machines, then the rest. */
  adds: FocusAdd[];
  /** When the Academy answers the area with a setting instead. */
  settingsNote: string | null;
}

/** How a catalog machine works an area: a primary mover, a helper, or not at all. */
export function focusRoleOf(area: string, canonicalId: string): FocusRole | null {
  const def = FOCUS_AREAS[area];
  return def ? worksArea(canonicalId, def.muscles) : null;
}

function worksArea(canonical: string, muscles: readonly MuscleId[]): FocusRole | null {
  const entry = MACHINE_ANATOMY[canonical];
  if (!entry) return null;
  if (entry.primary.some((m) => muscles.includes(m))) return "primary";
  if ((entry.secondary ?? []).some((m) => muscles.includes(m))) return "helper";
  return null;
}

/** Whether a catalog machine is a simple (single-joint) one (`SINGLE_JOINT`). */
export function isSingleJoint(canonical: string): boolean {
  return SINGLE_JOINT.has(canonical);
}

/** An addition's rank: the Academy's named extras, then single-joint, then compound. */
function addRank(canonical: string): number {
  if (ADD_FIRST.includes(canonical)) return 0;
  return isSingleJoint(canonical) ? 1 : 2;
}

/**
 * The three answers for an area, over two lists of floor ids (each routine
 * as the caller reads it). Every machine is compared as the catalog machine
 * it is (`floorCanonical`), so a studio's own unit counts as that machine,
 * and a second unit of a machine the client can't do is never offered.
 *
 * `never` is never offered (what the client can't do); `notFor` is never
 * offered for one routine (for A, what is on A's road already and what B
 * swaps in; for B, A's machines and what is on B's plan already).
 */
export function focusAdvice(input: {
  area: string;
  a: readonly string[];
  b: readonly string[] | null;
  floor: readonly FloorMachine[];
  never?: readonly string[];
  notFor?: Partial<Record<FocusWhich, readonly string[]>>;
}): FocusAdvice | null {
  const def = FOCUS_AREAS[input.area];
  if (!def) return null;
  const index = floorIndex(input.floor);
  const canonicalOf = floorCanonical(input.floor);
  const never = new Set((input.never ?? []).map(canonicalOf));
  const roleOf = (id: string) => worksArea(canonicalOf(id), def.muscles);

  const machines: FocusMachine[] = [];
  for (const [canonical, floorId] of index) {
    const role = worksArea(canonical, def.muscles);
    if (role) machines.push({ machineId: floorId, role });
  }
  machines.sort((x, y) => (x.role === y.role ? 0 : x.role === "primary" ? -1 : 1));

  const working = (routine: readonly string[]) => routine.filter((id) => roleOf(id) !== null);
  const inA = working(input.a);
  const inB = input.b ? working(input.b) : null;
  const primaryIn = (routine: readonly string[]) => routine.some((id) => roleOf(id) === "primary");

  const missingFrom: FocusWhich[] = [];
  if (!primaryIn(input.a)) missingFrom.push("A");
  if (input.b && !primaryIn(input.b)) missingFrom.push("B");

  const primaries = machines.filter((m) => m.role === "primary").map((m) => m.machineId);
  const swaps: FocusSwap[] = [];
  const adds: FocusAdd[] = [];
  for (const which of missingFrom) {
    const routine = which === "A" ? input.a : input.b!;
    const has = new Set(routine.map(canonicalOf));
    const notHere = new Set((input.notFor?.[which] ?? []).map(canonicalOf));
    const candidates = primaries.filter((id) => {
      const c = canonicalOf(id);
      return !has.has(c) && !never.has(c) && !notHere.has(c);
    });
    // A swap: a machine in the routine of the same Academy category that
    // doesn't work the area as a primary mover (one that doesn't work it at
    // all first, then a helper: Seated Dip helps the front delt, and AJ's own
    // example swaps it for Overhead Press).
    for (const to of candidates) {
      const category = MACHINE_CATEGORY[canonicalOf(to)];
      if (!category) continue;
      const sameCategory = routine.filter((id) => MACHINE_CATEGORY[canonicalOf(id)] === category);
      const from = sameCategory.find((id) => roleOf(id) === null) ?? sameCategory.find((id) => roleOf(id) === "helper");
      if (from && !swaps.some((s) => s.routine === which && s.from === from)) swaps.push({ routine: which, from, to });
    }
    // An addition: the Academy's named extras first, then single-joint machines.
    const ranked = [...candidates].sort((x, y) => addRank(canonicalOf(x)) - addRank(canonicalOf(y)));
    for (const machineId of ranked) {
      adds.push({ routine: which, machineId, overCount: routine.length + 1 > EXERCISE_COUNT.soft.max });
    }
  }

  return {
    area: input.area,
    machines,
    inA,
    inB,
    missingFrom,
    swaps,
    adds,
    settingsNote: SETTINGS_NOT_MACHINES[input.area] ?? null,
  };
}

/* ── The focus on the plan ─────────────────────────────────────────────── */

/**
 * The plan's focus, read safely: the areas it names that this list knows,
 * once each, in the order stored. A focus is stored as area keys (`delts`),
 * the words the Changes list reads back.
 */
export function focusAreasOf(plan: Pick<RoutinePlan, "focus"> | null | undefined): string[] {
  const stored = Array.isArray(plan?.focus) ? plan!.focus : [];
  return once(stored.filter((k): k is string => typeof k === "string" && Object.prototype.hasOwnProperty.call(FOCUS_AREAS, k)));
}

/** "Focus: Delts" for the plan's head and the briefing's glance, or null with none. */
export function focusLine(plan: Pick<RoutinePlan, "focus"> | null | undefined): string | null {
  const areas = focusAreasOf(plan).map((k) => FOCUS_AREAS[k]!.label);
  return areas.length > 0 ? `Focus: ${listWords(areas)}` : null;
}

/** "the delts", "the upper back": an area in a sentence. */
export function focusAreaWords(area: string): string {
  const label = FOCUS_AREAS[area]?.label ?? area;
  return `the ${label.toLowerCase()}`;
}

/**
 * Picking an area (one at a time) or taking it off (`null`): a "focus"
 * change on Routine A's plan, the routine's machines as they were. The
 * reason is asked by the screen, never required.
 */
export function focusChanged(plan: RoutinePlan, routine: readonly string[], area: string | null): PlanEdit {
  const value = area && FOCUS_AREAS[area] ? area : "";
  const change = { kind: "focus" as const, machineIds: [], value };
  return { plan: applyPlanChange(plan, change), routine: [...routine], change };
}

/* ── The panel: the A | B lineup's three answers ───────────────────────── */

/** Routine B as the focus reads it. */
export type FocusBSide =
  /** No Routine B with machines: B starts as a copy of A, so A's answer reaches it. */
  | { kind: "none" }
  /** A Routine B of its own from before Round 2 (no plan of swaps): read, never changed from here. */
  | { kind: "own"; routine: readonly string[] }
  /** B molded in: A with its swaps, following A where it hasn't swapped. */
  | { kind: "plan"; plan: RoutinePlan; routine: readonly string[] };

export interface FocusPanelInput {
  area: string;
  /** Routine A's machines: B's places. */
  aRoutine: readonly string[];
  /** Routine A's plan as the Lineup draws it: its first group (Routine A, or day one while it runs), then On deck. */
  aFirst: readonly string[];
  aDeck: readonly string[];
  b: FocusBSide;
  floor: readonly FloorMachine[];
  /** Floor ids the client can't do now: never offered anywhere, never counted as working the area. */
  held: readonly string[];
}

/** A machine named on a routine's line: in the routine now, on A's deck, or on B's plan still to come. */
export interface FocusMention {
  id: string;
  role: FocusRole;
  where: "now" | "deck" | "planned";
}

export interface FocusRoutineLine {
  routine: FocusWhich;
  /**
   * "works": a main mover in the routine now; "planned": a main mover only
   * on the plan, not in the routine yet; "helpers": helpers only;
   * "nothing"; "not-started": B hasn't started.
   */
  state: "works" | "planned" | "helpers" | "nothing" | "not-started";
  machines: FocusMention[];
}

/**
 * What a swap writes:
 * - on Routine A (a "swap" on A's plan, Routine A's machine replaced, so B,
 *   where it follows A at that place, follows in the same batch);
 * - on Routine B's plan, at the place of A's machine `aId`: its planned swap
 *   changed (B's machine with it when the swap is already in B), or one
 *   added, last in B's order, where B follows A (`bSlotPlanned`); or, with
 *   `keep`, A's own machine kept in B there, the swap left out
 *   (`bSlotKept`, as B's cells offer "Keep {A} in B"). A new machine for B
 *   is never one of A's (B is for variety); A's machine comes back to B only
 *   as a Keep.
 */
export type FocusSwapTarget = { routine: "A" } | { routine: "B"; aId: string; keep?: true };

export interface FocusSwapRow {
  key: string;
  from: string;
  to: string;
  /** The routines it changes today: "A and B" when B follows A at that place. */
  routines: FocusWhich[];
  /** The Academy family of the machine coming in, by name. */
  family: string | null;
  target: FocusSwapTarget;
  /** On B's plan only, after B's other swaps: Routine B as it runs today is unchanged. */
  planned: boolean;
}

export interface FocusAddRow {
  key: string;
  machineId: string;
  /** The routines it reaches: an addition on A's plan reaches B too, once it is in Routine A. */
  routines: FocusWhich[];
  /** How many machines each routine's plan holds with it. */
  counts: Partial<Record<FocusWhich, number>>;
  singleJoint: boolean;
  /** Whose plan the "add" is written on: A's (B follows A), or B's own. */
  writeOn: FocusWhich;
  /**
   * Past the Academy's 8 (`EXERCISE_COUNT`): the lowest-priority machine on
   * that plan, the one the addition is better in place of (`lowerPriorityOf`),
   * named, never moved (§5.4b, answer 3: "what it pushes out to stay in 5-8
   * machines"). Absent inside the count, or with no such machine.
   */
  inPlaceOf?: string;
}

export interface FocusPanel {
  area: string;
  label: string;
  /** Every machine on either lineup that works the area, by floor id: the tints. */
  roles: Map<string, FocusRole>;
  lines: FocusRoutineLine[];
  /** The routines that don't work the area as a main mover today. */
  missingFrom: FocusWhich[];
  /** Of those, the ones whose plan holds a main mover still to come. */
  onPlan: FocusWhich[];
  swaps: FocusSwapRow[];
  adds: FocusAddRow[];
  settingsNote: string | null;
  /** Routine B is a list of its own: its line is said, nothing is offered for it. */
  bOwn: boolean;
}

/** At most this many swaps per routine (merged rows count for both). */
const SWAPS_EACH = 2;

/**
 * The three answers as the A | B lineup draws them: each routine's line
 * ("In A and B?"), the swaps within a family, and one addition for a routine
 * still missing the area that its plan doesn't answer yet.
 *
 * Each routine is judged as it RUNS: Routine A (or day one while it runs)
 * and Routine B today, since the Academy asks for the area in both workouts
 * of the week. What is only on the plan (A's On deck; B's swaps still to
 * come, B's own on deck, and A's On deck, which B follows once it is in A)
 * is named on the line and said as "not in Routine A yet". A machine the
 * client can't do is never counted and never offered, and a place a trainer
 * took out of B stays out.
 *
 * A swap on A changes Routine A, so it says "A and B" when B follows A at
 * that place today (B holds A's machine there): one write reaches both.
 * Rows for B alone come after, never the machine or the place of an "A and
 * B" row: Keep {A} in B first where B's swap took A's main mover out, then a
 * change to a swap already in B, then a swap added to B's plan (only while
 * B's plan doesn't answer the area already).
 */
export function focusPanelOf(input: FocusPanelInput): FocusPanel | null {
  const def = FOCUS_AREAS[input.area];
  if (!def) return null;
  const canonicalOf = floorCanonical(input.floor);
  const roleOf = (id: string) => worksArea(canonicalOf(id), def.muscles);
  // What the client can't do never works the area for them (AJ's "2a").
  const heldC = new Set(input.held.map(canonicalOf));
  const usable = (id: string) => !heldC.has(canonicalOf(id));
  const b = input.b;
  const swaps = b.kind === "plan" ? swapsOf(b.plan) : [];
  const made = b.kind === "plan" ? swaps.slice(0, swapsMade(swaps, b.routine)) : [];

  /* Each routine as it runs, and its plan beyond it. */
  const aNow = once([...input.aFirst]).filter(usable);
  const aDeck = once([...input.aDeck]).filter((id) => usable(id) && !aNow.includes(id));
  const aPlan = [...aNow, ...aDeck];
  const bNow = b.kind === "none" ? null : once([...b.routine]).filter(usable);
  // B as planned: A's road with every planned swap made and B's own on deck,
  // less the places a trainer took out of B.
  const bAsPlanned =
    b.kind === "plan"
      ? (() => {
          const dropped = droppedFromB(input.aRoutine, swaps, b.routine);
          return bIntendedOf(once([...input.aRoutine, ...aDeck]), swaps, b.plan.intended).filter((id) => usable(id) && !dropped.includes(id));
        })()
      : [];
  const bPlanned = bNow ? bAsPlanned.filter((id) => !bNow.includes(id)) : [];

  const advice = focusAdvice({
    area: input.area,
    a: aNow,
    b: bNow,
    floor: input.floor,
    never: input.held,
    notFor: {
      // A never takes a machine on its road already, nor one B swaps in.
      A: [...aDeck, ...swaps.map((s) => s.with)],
      // B is for variety: never one of A's (A's own comes back as a Keep), nor one on B's plan already.
      B: [...aPlan, ...input.aRoutine, ...bPlanned],
    },
  })!;

  /* The tints: every machine either lineup draws that the client can do. */
  const roles = new Map<string, FocusRole>();
  const drawn = [...input.aFirst, ...input.aDeck, ...(b.kind === "none" ? [] : b.routine), ...swaps.flatMap((s) => [s.replaces, s.with]), ...bPlanned];
  for (const id of once(drawn)) {
    const role = usable(id) ? roleOf(id) : null;
    if (role) roles.set(id, role);
  }

  /* 1 · In A and B? */
  const lineOf = (routine: FocusWhich, now: readonly string[], planned: readonly string[], where: FocusMention["where"]): FocusRoutineLine => {
    const mention = (id: string, w: FocusMention["where"]): FocusMention[] => {
      const role = roleOf(id);
      return role ? [{ id, role, where: w }] : [];
    };
    const machines = [...now.flatMap((id) => mention(id, "now")), ...planned.flatMap((id) => mention(id, where))];
    const state = machines.some((m) => m.role === "primary" && m.where === "now")
      ? "works"
      : machines.some((m) => m.role === "primary")
        ? "planned"
        : machines.length > 0
          ? "helpers"
          : "nothing";
    return { routine, state, machines };
  };
  const lines: FocusRoutineLine[] = [lineOf("A", aNow, aDeck, "deck")];
  if (!bNow) lines.push({ routine: "B", state: "not-started", machines: [] });
  else lines.push(lineOf("B", bNow, bPlanned, "planned"));
  const missingFrom = advice.missingFrom;
  const onPlan = missingFrom.filter((w) => lines.find((l) => l.routine === w)?.state === "planned");

  /* 2 · A swap in the same family. */
  const familyOf = (id: string) => {
    const c = MACHINE_CATEGORY[canonicalOf(id)];
    return c ? CATEGORY_LABEL[c] : null;
  };
  // B follows A at this machine's place today: B holds A's machine there.
  const bFollowsAt = (aId: string) => b.kind === "plan" && input.aRoutine.includes(aId) && b.routine.includes(aId);
  const aRows: FocusSwapRow[] = advice.swaps
    .filter((s) => s.routine === "A")
    .map((s) => ({
      key: `A:${s.from}>${s.to}`,
      from: s.from,
      to: s.to,
      routines: bFollowsAt(s.from) ? ["A", "B"] : ["A"],
      family: familyOf(s.to),
      target: { routine: "A" },
      planned: false,
    }));
  const both = aRows.filter((r) => r.routines.includes("B"));
  const bRows: FocusSwapRow[] = [];
  if (b.kind === "plan" && missingFrom.includes("B")) {
    // Keep A's main mover in B where B's swap took it out ("key exercises should be repeated in the A and B").
    for (const s of made) {
      if (!input.aRoutine.includes(s.replaces) || !usable(s.replaces) || roleOf(s.replaces) !== "primary") continue;
      if (!b.routine.includes(s.with) || b.routine.includes(s.replaces)) continue;
      bRows.push({
        key: `keep:${s.replaces}`,
        from: s.with,
        to: s.replaces,
        routines: ["B"],
        family: familyOf(s.replaces),
        target: { routine: "B", aId: s.replaces, keep: true },
        planned: false,
      });
    }
    const changed: FocusSwapRow[] = [];
    const added: FocusSwapRow[] = [];
    for (const s of advice.swaps) {
      if (s.routine !== "B") continue;
      // An "A and B" row reaches B already: never its machine or its place twice.
      if (both.some((r) => r.to === s.to || r.from === s.from)) continue;
      // B's place: a swap in B stands at its A machine's place; an A machine B follows is its own place.
      const own = made.find((x) => x.with === s.from);
      const follows = input.aRoutine.includes(s.from) && !swaps.some((x) => x.replaces === s.from);
      const aId = own ? own.replaces : follows ? s.from : null;
      if (!aId) continue;
      const row: FocusSwapRow = { key: `B:${s.from}>${s.to}`, from: s.from, to: s.to, routines: ["B"], family: familyOf(s.to), target: { routine: "B", aId }, planned: !own };
      if (own) changed.push(row);
      // Added to B's plan, after its other swaps: only while B's plan doesn't answer the area already.
      else if (!onPlan.includes("B")) added.push(row);
    }
    bRows.push(...changed, ...added);
  }
  const capped: FocusSwapRow[] = [];
  for (const r of [...aRows, ...bRows]) {
    const full = r.routines.some((w) => capped.filter((c) => c.routines.includes(w)).length >= SWAPS_EACH);
    if (!full) capped.push(r);
  }

  /* 3 · Or add: one for a routine missing the area that its plan doesn't answer yet. */
  const aPlanLen = aPlan.length;
  /* Past the Academy's 8, the plan's lowest-priority machine, named: from its
     end, one that doesn't work the area and isn't one of the Big 5's
     families (the Academy's foundation: horizontal and vertical push and
     pull, a leg press). */
  const lowerPriorityOf = (road: readonly string[]): string | undefined =>
    [...road].reverse().find((id) => {
      const family = MACHINE_CATEGORY[canonicalOf(id)];
      return roleOf(id) === null && !(family && FOUNDATIONAL_CATEGORIES.includes(family));
    });
  // B's plan, counted: B as planned, and what B runs today that no planned swap replaces.
  const bPlanLen = bNow && b.kind === "plan" ? once([...bAsPlanned, ...bNow.filter((id) => !swaps.some((s) => s.replaces === id))]).length : 0;
  const adds: FocusAddRow[] = [];
  const firstAdd = (w: FocusWhich) => advice.adds.find((x) => x.routine === w);
  if (missingFrom.includes("A") && !onPlan.includes("A")) {
    const x = firstAdd("A");
    if (x) {
      // On A's road, B takes it too once it is in Routine A (B follows A).
      const reachesB = b.kind === "plan";
      const over = aPlanLen + 1 > EXERCISE_COUNT.soft.max ? lowerPriorityOf(aPlan) : undefined;
      adds.push({
        key: `add:A:${x.machineId}`,
        machineId: x.machineId,
        routines: reachesB ? ["A", "B"] : ["A"],
        counts: { A: aPlanLen + 1, ...(reachesB ? { B: bPlanLen + 1 } : null) },
        singleJoint: isSingleJoint(canonicalOf(x.machineId)),
        writeOn: "A",
        ...(over ? { inPlaceOf: over } : null),
      });
    }
  }
  if (b.kind === "plan" && missingFrom.includes("B") && !onPlan.includes("B") && !adds.some((r) => r.routines.includes("B"))) {
    const x = firstAdd("B");
    if (x) {
      const over = bPlanLen + 1 > EXERCISE_COUNT.soft.max ? lowerPriorityOf(bAsPlanned) : undefined;
      adds.push({
        key: `add:B:${x.machineId}`,
        machineId: x.machineId,
        routines: ["B"],
        counts: { B: bPlanLen + 1 },
        singleJoint: isSingleJoint(canonicalOf(x.machineId)),
        writeOn: "B",
        ...(over ? { inPlaceOf: over } : null),
      });
    }
  }

  return {
    area: input.area,
    label: def.label,
    roles,
    lines,
    missingFrom,
    onPlan,
    swaps: capped,
    adds,
    settingsNote: advice.settingsNote,
    bOwn: b.kind === "own",
  };
}

/* ── The edits a tap makes ─────────────────────────────────────────────── */

/** An addition on Routine A's plan: on deck, at the end of the road, never into Routine A today. */
export function focusAddToA(plan: RoutinePlan, routine: readonly string[], machineId: string): PlanEdit {
  const change = { kind: "add" as const, machineIds: [machineId] };
  return { plan: applyPlanChange(plan, change), routine: [...routine], change };
}

/** An addition on Routine B's plan: on B's deck, never into Routine B today. */
export function focusAddToB(bPlan: RoutinePlan, bRoutine: readonly string[], machineId: string): BEdit {
  const change = { kind: "add" as const, machineIds: [machineId] };
  return { plan: applyPlanChange(bPlan, change), machineIds: [...bRoutine], changes: [change] };
}

/**
 * A swap on Routine B's plan at a place of A: the place's planned swap
 * changed (B's machine with it when the swap is already in B), or one added,
 * last in B's order, where B follows A; with `keep`, A's machine kept in B
 * there and the swap left out. Null when nothing changes.
 */
export function focusSwapInB(input: {
  aRoutine: readonly string[];
  bPlan: RoutinePlan;
  bRoutine: readonly string[];
  target: Extract<FocusSwapTarget, { routine: "B" }>;
  to: string;
}): BEdit | null {
  const { aRoutine, bPlan, bRoutine, target } = input;
  if (target.keep) return bSlotKept({ aRoutine, bPlan, bRoutine, aId: target.aId });
  return bSlotPlanned({ aRoutine, bPlan, bRoutine, aId: target.aId, to: input.to });
}

/* ── The words ─────────────────────────────────────────────────────────── */

/**
 * What a tinted cell says beside its tint, so the colour is never the only
 * way to read it: "works the delts" (a main mover, the blue fill) or
 * "helps" (a helper, the blue outline).
 */
export function focusCellWords(role: FocusRole, area: string): string {
  return role === "primary" ? `works ${focusAreaWords(area)}` : "helps";
}

/** "A", "B", "A and B". */
export function focusWhichWords(routines: readonly FocusWhich[]): string {
  return routines.length > 1 ? "A and B" : (routines[0] ?? "");
}

const mentionWords = (ms: readonly FocusMention[], nameOf: (id: string) => string) =>
  listWords(ms.map((m) => `${nameOf(m.id)}${m.where === "deck" ? " (on deck)" : m.where === "planned" ? " (planned)" : ""}`));

/**
 * A routine's line: "Overhead Press", "Lateral Raise (on deck)", "Helpers
 * only: Compound Row, Seated Dip and Pulldown", "Nothing works the delts",
 * "Not started · B starts as a copy of A". Names are never shortened.
 */
export function focusLineWords(line: FocusRoutineLine, area: string, nameOf: (id: string) => string): string {
  switch (line.state) {
    case "not-started":
      return "Not started · B starts as a copy of A";
    case "nothing":
      return `Nothing works ${focusAreaWords(area)}`;
    case "helpers":
      return `Helpers only: ${mentionWords(line.machines, nameOf)}`;
    case "works":
    case "planned":
      return mentionWords(
        line.machines.filter((m) => m.role === "primary"),
        nameOf,
      );
  }
}

/**
 * Under the lines: what is missing where, what is only on the plan ("On A's
 * plan, not in Routine A yet."), or that nothing needs to change.
 */
export function focusMissingWords(panel: Pick<FocusPanel, "area" | "missingFrom" | "onPlan" | "lines">): string {
  const area = focusAreaWords(panel.area);
  if (panel.missingFrom.length === 0) {
    const bStarted = panel.lines.some((l) => l.routine === "B" && l.state !== "not-started");
    return bStarted ? "Worked in A and B. Nothing to change." : "Worked in A. B starts as a copy of A.";
  }
  const out: string[] = [];
  const missing = panel.missingFrom.filter((w) => !panel.onPlan.includes(w));
  if (missing.length > 0) out.push(`Nothing in ${missing.join(" or ")} works ${area} as a main mover.`);
  if (panel.onPlan.length === 1) out.push(`On ${panel.onPlan[0]}'s plan, not in Routine ${panel.onPlan[0]} yet.`);
  else if (panel.onPlan.length > 1) out.push("On both plans, not in Routine A or B yet.");
  return out.join(" ");
}

/** The routines missing the area that the answers can change: B of its own changes on Routine B. */
const answerable = (panel: Pick<FocusPanel, "missingFrom" | "bOwn">) => panel.missingFrom.filter((w) => w === "A" || !panel.bOwn);

/** Answer 2 with no swap to offer: why. */
export function focusNoSwapWords(panel: Pick<FocusPanel, "missingFrom" | "onPlan" | "bOwn">): string {
  const open = answerable(panel);
  if (open.length === 0) return "B changes on Routine B.";
  if (open.every((w) => panel.onPlan.includes(w))) return open.length > 1 ? "On both plans already." : `On ${open[0]}'s plan already.`;
  return "No swap inside a family on this floor.";
}

/**
 * Answer 3's notes for a routine whose plan answers the area already, so
 * nothing more is added for it: "Already on A's plan: Lateral Raise (on
 * deck)."
 */
export function focusAddNotes(panel: Pick<FocusPanel, "onPlan" | "lines">, nameOf: (id: string) => string): string[] {
  return panel.onPlan.flatMap((w) => {
    const line = panel.lines.find((l) => l.routine === w);
    const planned = (line?.machines ?? []).filter((m) => m.role === "primary" && m.where !== "now");
    return planned.length > 0 ? [`Already on ${w}'s plan: ${mentionWords(planned, nameOf)}.`] : [];
  });
}

/** Answer 3 with nothing to add and no note: why. */
export function focusNoAddWords(panel: Pick<FocusPanel, "missingFrom" | "bOwn">): string {
  return answerable(panel).length === 0 ? "B changes on Routine B." : "Nothing to add on this floor.";
}

/** Answer 3's question, worded by what it offers: "Or add a single-joint machine?" unless a compound one is offered. */
export function focusAddQuestion(panel: Pick<FocusPanel, "adds">): string {
  return panel.adds.every((r) => r.singleJoint) ? "Or add a single-joint machine?" : "Or add a machine?";
}

/**
 * What an addition does to each plan's count, against the Academy's 6 to 8
 * (`EXERCISE_COUNT`): "A's and B's plans go to 7 · inside the Academy's 6 to
 * 8", "A's plan goes to 9 · past the Academy's 8: better in place of a
 * lower-priority machine" (A/B Routines: "if time permits or used to replace
 * a lower priority muscle group"), "B's plan goes to 5 · under the Academy's
 * 6". A plan's count is its routine and what is on deck, not the routine
 * alone. Past the 8, the machine it is better in place of is named when
 * there is one (`inPlaceOf`): "… past the Academy's 8: in place of
 * Pullover?", a question, never a move.
 */
export function focusCountWords(row: Pick<FocusAddRow, "routines" | "counts" | "inPlaceOf">, nameOf?: (id: string) => string): string {
  const { min, max } = EXERCISE_COUNT.soft;
  const ns = row.routines.map((w) => row.counts[w] ?? 0);
  const who =
    row.routines.length === 2 && ns[0] === ns[1]
      ? `A's and B's plans go to ${ns[0]}`
      : row.routines.map((w, i) => `${w}'s plan goes to ${ns[i]}`).join(" · ");
  if (ns.some((n) => n > max)) {
    return row.inPlaceOf && nameOf
      ? `${who} · past the Academy's ${max}: in place of ${nameOf(row.inPlaceOf)}?`
      : `${who} · past the Academy's ${max}: better in place of a lower-priority machine`;
  }
  if (ns.some((n) => n < min)) return `${who} · under the Academy's ${min}`;
  return `${who} · inside the Academy's ${min} to ${max}`;
}
