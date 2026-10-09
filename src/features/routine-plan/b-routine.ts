/**
 * B, molded in (AJ, Oct 7 2026).
 *
 * "As the B routine starts to go in, the client will still be performing the
 * A routine each session, but that A routine might go A routine, then A
 * routine with one machine edited, then back to the regular A routine, then A
 * routine with two machines edited ... So the B routine is now three of the A
 * routine session machines and three of the B routine machines. And then
 * slowly the B routine will phase out those last three machines as the client
 * progressively learns the remaining machines."
 *
 * So B is planned whole, as swaps against A (`plan.swaps`, in the order they
 * come in), and B's routine on any day is A with the swaps made so far: A and
 * B alternate from the day B starts, and B grows one swap (sometimes two or
 * three, the trainer's call) at a time. The Academy: "replacing one
 * complementary exercise of the A routine every week or so until the new
 * routine has been completed in its entirety ... at least 8 weeks (or 16
 * sessions)" (`B_ROUTINE_BUILD_OUT`), with A run "no less than 5 to 7 times
 * before beginning to add new exercises" (Programming and Progression 3) —
 * said on screen, never enforced. Why B: variety, and recovery ("to allow us
 * to still hit areas of the body while allowing a recovery on certain muscle
 * groups").
 *
 * Round 2 (the design round, Oct 8 2026, item 6; AJ's "1a": Round 2 on this
 * branch) molds B in on screen. What this file adds for it, all pure:
 * - B FOLLOWS A (`bFollowsA`, `bFollowOf`): when Routine A's machines move,
 *   B's unswapped places follow A and B's own swaps stay, written in the
 *   SAME batch as A's change by every writer that moves A (the critic's
 *   #25: until this round nothing did).
 * - Starting B (`startBPlan`): "B starts out as the A routine with just one
 *   machine different" (§2b question 5), its plan holding B as it will be
 *   when built.
 * - The A | B lineup (`bColumnOf`): each place in A's order, B's cell beside
 *   it, either following A or B's own.
 * - B's changes (`bSwappedIn`, `bSlotPlanned`, `bSlotKept`,
 *   `bPurposeChanged`) and a slot's choices (`bSwapChoices`), never a
 *   machine the client can't do (Routine A's plan's `cantDo`, read by A and
 *   B: AJ's "2a").
 * - The words: "B · 2 of 5 swaps · next: Leg Extension for Leg Press", how
 *   often A has run in Journey (`aRunsSince`, `aRunsLine`), the Academy's
 *   line with its source, and the briefing's glance (`bRoadGroups`).
 *
 * Nothing here suggests or moves a weight, and nothing reads a gender.
 */
import {
  B_ROUTINE_BUILD_OUT,
  CATEGORY_LABEL,
  COMPLEMENTARY_PAIRS,
  EXERCISE_SUBSTITUTES,
  MACHINE_CATEGORY,
  MODEL_AB_ROUTINE,
} from "../routine-builder/academy";
import type { Routine, WorkoutSession } from "../../types";
import { routineRunsLine } from "../../lib/history-claims";
import type { HistoryCoverage } from "../../lib/prior-history";
import { matchesRoutineLetter } from "../../lib/routine-utils";
import { studioDayKeyOf } from "../../lib/studio-time";
import { activeCantDo } from "./cant-do";
import type { RoadGroup } from "./lineup";
import type { PlanProgress } from "./plan";
import { floorCanonical, floorIndex, type FloorMachine } from "./starting-plan";
import { academyTemplateOf } from "./starting-routines";
import type { CantDo, PlanChange, PlanPurposeKind, PlanSwap, RoutinePlan } from "./types";

const once = (ids: readonly string[]) => ids.filter((id, i) => !!id && ids.indexOf(id) === i);
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameSwaps = (a: readonly PlanSwap[], b: readonly PlanSwap[]) =>
  a.length === b.length && a.every((s, i) => s.replaces === b[i]!.replaces && s.with === b[i]!.with);

/**
 * A swap is in B when B holds its machine and NOT the A machine it
 * replaces. Holding the machine alone is not enough: Routine A can gain a
 * machine B planned to swap in (from A's own road), and B, following A,
 * then holds it beside the A machine the swap was for, with nothing
 * swapped (the review of Round 2: counted as made, B read "2 of 3" and
 * the next change to A dropped the A machine from B).
 */
function swapInB(s: PlanSwap, bRoutine: readonly string[]): boolean {
  return bRoutine.includes(s.with) && !bRoutine.includes(s.replaces);
}

/** How many of B's planned swaps the B routine has made today: the swaps in B, from the first, in order. */
export function swapsMade(swaps: readonly PlanSwap[], bRoutine: readonly string[]): number {
  let n = 0;
  for (const s of swaps) {
    if (swapInB(s, bRoutine)) n += 1;
    else break;
  }
  return n;
}

/**
 * B's routine: A with the first `made` swaps applied, in A's order. A machine
 * of A that B hasn't swapped yet follows A, so a change to A during the
 * build-out reaches B's unswapped part (`bFollowsA` is what writes it); B's
 * own swaps stay. A swap whose A machine has left A is added at the end. A
 * swap whose machine is already in the list (A gained it since) leaves the
 * A machine out rather than naming one machine twice.
 */
export function bRoutineOf(aRoutine: readonly string[], swaps: readonly PlanSwap[], made: number): string[] {
  let out = [...aRoutine];
  for (const s of swaps.slice(0, Math.max(0, made))) {
    const at = out.indexOf(s.replaces);
    if (out.includes(s.with)) {
      if (at >= 0) out = out.filter((_, i) => i !== at);
      continue;
    }
    if (at >= 0) out[at] = s.with;
    else out.push(s.with);
  }
  return out;
}

export interface BStatus {
  made: number;
  of: number;
  /** The next swap, or null when B is built. */
  next: PlanSwap | null;
  built: boolean;
}

export function bStatus(swaps: readonly PlanSwap[], bRoutine: readonly string[]): BStatus {
  const made = swapsMade(swaps, bRoutine);
  return { made, of: swaps.length, next: swaps[made] ?? null, built: made >= swaps.length };
}

/** The B routine after `count` more swaps (1 by default; AJ: "sometimes two or three"). */
export function bWithNextSwaps(
  aRoutine: readonly string[],
  swaps: readonly PlanSwap[],
  bRoutine: readonly string[],
  count = 1,
): string[] {
  return bRoutineOf(aRoutine, swaps, Math.min(swaps.length, swapsMade(swaps, bRoutine) + count));
}

/**
 * Suggested swaps for B, from A: for each A machine in A's order, a machine
 * of the same Academy category that A doesn't have, preferring the
 * template's eventual B, then the model B, then the Academy's named
 * complementary pairs, and only machines on the floor. Same regions,
 * different machines, which is what the Academy says B is. A suggestion the
 * trainer edits; an A machine with nothing to pair stays in B as it is.
 *
 * Never a machine the client can't do (AJ, Oct 8 2026, "2a": "Can't-do
 * lives on the client's plan, read by A and B"): pass Routine A's plan's
 * `cantDo` and the studio's day, and a mark that still holds keeps its
 * machine out of every suggestion. Never a machine still to come on A's own
 * road either (`aIntended`, Routine A's plan's `intended`): once A takes it
 * in, B would only hold A's machine twice over.
 *
 * The template is the plan's `templateId` read through `academyTemplateOf`,
 * which knows a starting routine's id (`academy-knee`) and a template's own
 * (`knee`), so a plan made from a starting routine keeps its eventual B.
 *
 * The model B is the app's blend of the Academy's model A/B without its sex
 * split (`MODEL_AB_ROUTINE.neutral`): the A/B document has only a female and
 * a male row, and Mindbody's gender picked between them until Oct 8 2026,
 * when AJ's "3a" ("Gender is used nowhere in choosing a start") took it out
 * of every suggestion.
 */
export function suggestBSwaps(input: {
  aRoutine: readonly string[];
  floor: readonly FloorMachine[];
  templateId?: string | null;
  /** Routine A's plan's can't-do marks; one that still holds keeps its machine out. */
  cantDo?: readonly CantDo[] | null;
  todayYmd?: string;
  /** Routine A's plan's road (`intended`): A's machines to come are never B's. */
  aIntended?: readonly string[] | null;
}): PlanSwap[] {
  const index = floorIndex(input.floor);
  const canonicalOf = floorCanonical(input.floor);
  const aCanonical = new Set([...input.aRoutine, ...(input.aIntended ?? [])].map(canonicalOf));
  const held = new Set(
    (input.todayYmd ? activeCantDo({ cantDo: input.cantDo ? [...input.cantDo] : undefined }, input.todayYmd) : []).map((c) =>
      canonicalOf(c.machineId),
    ),
  );
  const template = academyTemplateOf(input.templateId);
  const model = MODEL_AB_ROUTINE.neutral;
  const pairPartners = (id: string) =>
    COMPLEMENTARY_PAIRS.flatMap((p) => (p.machineIds.includes(id) ? p.machineIds.filter((x) => x !== id) : []));

  const used = new Set<string>();
  const swaps: PlanSwap[] = [];
  for (const aId of input.aRoutine) {
    const a = canonicalOf(aId);
    const category = MACHINE_CATEGORY[a];
    if (!category) continue;
    const pool = [...(template?.eventualB ?? []), ...model.b, ...pairPartners(a)];
    const pick = pool.find(
      (c) => MACHINE_CATEGORY[c] === category && !aCanonical.has(c) && !used.has(c) && !held.has(c) && index.has(c),
    );
    if (!pick) continue;
    used.add(pick);
    swaps.push({ replaces: aId, with: index.get(pick)! });
  }
  return swaps;
}

/* ── Which plan is B's ─────────────────────────────────────────────────── */

/** A plan planned as swaps against A: B's (`plan.swaps` is "B only", types.ts). */
export function isBPlan(plan: unknown): plan is RoutinePlan & { swaps: PlanSwap[] } {
  return (
    !!plan &&
    typeof plan === "object" &&
    Array.isArray((plan as RoutinePlan).intended) &&
    Array.isArray((plan as RoutinePlan).swaps)
  );
}

/** The plan's swaps, read safely: a stored entry without both machines is skipped, never bent. */
export function swapsOf(plan: Pick<RoutinePlan, "swaps"> | null | undefined): PlanSwap[] {
  return (plan?.swaps ?? []).filter(
    (s): s is PlanSwap => !!s && typeof s.replaces === "string" && !!s.replaces && typeof s.with === "string" && !!s.with,
  );
}

/* ── B follows A ───────────────────────────────────────────────────────── */

/**
 * B's own extras: machines B holds that are neither A's (before or after a
 * change) nor any swap's, kept at the end so a machine a trainer put into B
 * on purpose (the Edit routine drawer, a B session's Wrap-up) is never
 * dropped when A moves.
 */
function extrasOf(list: readonly string[], aMachines: readonly string[], swaps: readonly PlanSwap[]): string[] {
  return list.filter((id) => !aMachines.includes(id) && !swaps.some((s) => s.with === id || s.replaces === id));
}

/**
 * The places of A a trainer took out of B by hand: A machines B doesn't
 * hold that no swap in B accounts for (the column draws them "Not in B").
 * B keeps them out when A moves and when a swap goes in; rebuilding B from
 * A would otherwise put them back without anyone choosing it.
 */
export function droppedFromB(aRoutine: readonly string[], swaps: readonly PlanSwap[], bRoutine: readonly string[]): string[] {
  const made = swaps.slice(0, swapsMade(swaps, bRoutine));
  return aRoutine.filter((id) => !bRoutine.includes(id) && !made.some((s) => s.replaces === id));
}

/**
 * Which of A's machines a change to A replaced at the same place: a machine
 * gone from A and one new to A, between the same two machines A kept
 * (paired in order when several sit in one gap). A Lineup swap, the
 * session's swap, a can't-do's stand-in and a re-plan all do this.
 */
function replacedAtPlace(aOld: readonly string[], aNew: readonly string[]): Map<string, string> {
  const kept = (id: string) => aOld.includes(id) && aNew.includes(id);
  const gaps = (list: readonly string[]) => {
    const out = new Map<string, string[]>();
    let anchor = "";
    for (const id of list) {
      if (kept(id)) {
        anchor = id;
        continue;
      }
      out.set(anchor, [...(out.get(anchor) ?? []), id]);
    }
    return out;
  };
  const gone = gaps(aOld);
  const came = gaps(aNew);
  const pairs = new Map<string, string>();
  for (const [anchor, olds] of gone) {
    const news = came.get(anchor) ?? [];
    olds.forEach((o, i) => {
      if (news[i]) pairs.set(o, news[i]!);
    });
  }
  return pairs;
}

/**
 * B's swaps after Routine A changes: a swap is tied to its PLACE in A, so
 * when A replaces the machine a swap was for with another at the same place,
 * the swap is for the new machine (the review of Round 2: tied to the old
 * machine, B kept Leg Extension AND took A's new Leg Curl, four machines for
 * A's three). Left as it was when the new machine is the swap's own (A took
 * B's machine at that very place) or another swap is already for it.
 */
export function bSwapsAfterA(aOld: readonly string[], aNew: readonly string[], swaps: readonly PlanSwap[]): PlanSwap[] {
  const pairs = replacedAtPlace(aOld, aNew);
  if (pairs.size === 0) return [...swaps];
  return swaps.map((s) => {
    const to = pairs.get(s.replaces);
    if (!to || to === s.with || swaps.some((o) => o !== s && o.replaces === to)) return s;
    return { replaces: to, with: s.with };
  });
}

/**
 * B's machines after Routine A changes (the critic's #25; the research,
 * §5.3: "When A changes during B's build-out, the machines B hasn't swapped
 * yet follow A (they are A's), and B's own swaps stay"). The swaps made so
 * far are counted on B as it stands, so the same swaps are made on the new
 * A. Given A as it stood (`aOld`), a swap follows its place when A replaces
 * its machine there (`bSwapsAfterA`), a place a trainer took out of B stays
 * out, and B's own extras stay; without it, every machine B holds that the
 * new A lacks and no swap names would read as an extra, so nothing is kept.
 * A swap still to come is never made by A gaining its machine.
 */
export function bFollowsA(
  aNew: readonly string[],
  bPlan: Pick<RoutinePlan, "swaps">,
  bRoutine: readonly string[],
  aOld?: readonly string[],
): string[] {
  const swaps = swapsOf(bPlan);
  const made = swapsMade(swaps, bRoutine);
  if (!aOld) return bRoutineOf(aNew, swaps, made);
  const next = bSwapsAfterA(aOld, aNew, swaps);
  const dropped = droppedFromB(aOld, swaps, bRoutine);
  const base = bRoutineOf(aNew, next, made).filter((id) => !dropped.includes(id));
  const extras = extrasOf(bRoutine, [...aOld, ...aNew], [...swaps, ...next]).filter((id) => !base.includes(id));
  return [...base, ...extras];
}

/**
 * B as it will be when built (`plan.intended` on B's plan): A with every
 * planned swap made, and B's plan's own extras after it.
 */
export function bIntendedOf(
  aRoutine: readonly string[],
  swaps: readonly PlanSwap[],
  intendedNow: readonly string[] = [],
  aOld: readonly string[] = aRoutine,
): string[] {
  const base = bRoutineOf(aRoutine, swaps, swaps.length);
  const extras = extrasOf(intendedNow, [...aOld, ...aRoutine], swaps).filter((id) => !base.includes(id));
  return [...base, ...extras];
}

/** What B's routine takes when A moves: its machines and its plan's road, written beside A's change. */
export interface BFollow {
  /** Routine B's id. */
  routineId: string;
  /** B's machines after A's change (`bFollowsA`). */
  machineIds: string[];
  /** B's plan's road after A's change (`bIntendedOf`). */
  intended: string[];
  /** B's plan's swaps, only when a swap followed its place in A (`bSwapsAfterA`). */
  swaps?: PlanSwap[];
}

type RoutineLike = Pick<Routine, "id" | "name" | "machineIds" | "plan">;

/**
 * What a write that moves Routine A's machines must also write to Routine
 * B, in the SAME batch, or null when there is nothing to write: the routine
 * written is not Routine A, there is no saved Routine B, B has no plan of
 * swaps (a Routine B made before Round 2 is the trainer's own list, left
 * alone), or B and its plan already stand where A's change puts them.
 * Every writer that moves A asks this: Programming's Lineup, the Edit
 * routine drawer, the session's plan sheet and the Wrap-up's Next time.
 */
export function bFollowOf(
  routines: readonly RoutineLike[],
  aRoutineId: string | null | undefined,
  aNew: readonly string[],
): BFollow | null {
  if (!aRoutineId) return null;
  const a = routines.find((r) => r.id === aRoutineId);
  if (!a || !matchesRoutineLetter(a, "A")) return null;
  const b = routines.find((r) => matchesRoutineLetter(r, "B") && !!r.id && !r.id.startsWith("temp-"));
  if (!b?.id || !isBPlan(b.plan)) return null;
  const aOld = a.machineIds ?? [];
  const bNow = b.machineIds ?? [];
  const swaps = swapsOf(b.plan);
  const next = bSwapsAfterA(aOld, aNew, swaps);
  const machineIds = bFollowsA(aNew, b.plan, bNow, aOld);
  const intended = bIntendedOf(aNew, next, b.plan.intended, aOld);
  const swapsMoved = !sameSwaps(next, swaps);
  if (sameList(machineIds, bNow) && sameList(intended, b.plan.intended) && !swapsMoved) return null;
  return { routineId: b.id, machineIds, intended, ...(swapsMoved ? { swaps: next } : null) };
}

/* ── B's purpose ───────────────────────────────────────────────────────── */

/**
 * What B is for (AJ, Oct 7 2026: "B routines is definitely for variety.
 * Sometimes, but it sometimes it also can be to allow us to still hit areas
 * of the body while allowing a recovery on certain muscle groups").
 */
export type BPurpose = "variety" | "recovery" | "both";
export const B_PURPOSES: readonly BPurpose[] = ["variety", "recovery", "both"];
export const B_PURPOSE_LABEL: Record<BPurpose, string> = { variety: "Variety", recovery: "Recovery", both: "Both" };
/** The purpose's words on B's plan (the Academy's reasons, AB Routines and the Exercise Selection Template). */
export const B_PURPOSE_WORDS: Record<BPurpose, string> = {
  variety: "Variety: the same regions, different machines",
  recovery: "Recovery: a region twice a week, its heaviest work split",
  both: "Variety and recovery: the same regions on different machines, a region's heaviest work split",
};

export function bPurposeKinds(purpose: BPurpose): PlanPurposeKind[] {
  return purpose === "both" ? ["variety", "recovery"] : [purpose];
}

/** What B's plan says it is for, or null when it says neither. */
export function bPurposeOf(plan: Pick<RoutinePlan, "purposeKinds"> | null | undefined): BPurpose | null {
  const kinds = plan?.purposeKinds ?? [];
  const variety = kinds.includes("variety");
  const recovery = kinds.includes("recovery");
  return variety && recovery ? "both" : variety ? "variety" : recovery ? "recovery" : null;
}

/* ── The change's words on B's plan ────────────────────────────────────── */

/**
 * The `value` a change on B's plan carries, so the Changes list says what
 * happened (`changes-list.ts`):
 * - "start" with `B_START`: B started, `machineIds` the first swap,
 *   `[replaces, with]`;
 * - "swap" with `B_SWAP_MADE`: a planned swap went into B, `[replaces, with]`;
 * - "swap" with `B_SWAP_PLANNED`: B's planned swap for an A machine changed,
 *   `[replaces, with]`;
 * - "swap" with `B_SWAP_KEPT`: B keeps the A machine, its swap out of the
 *   plan, `[replaces]`.
 */
export const B_START = "B";
export const B_SWAP_MADE = "made";
export const B_SWAP_PLANNED = "planned";
export const B_SWAP_KEPT = "kept";

type BChange = Pick<PlanChange, "kind" | "machineIds"> & { value?: string };

/* ── Starting B ────────────────────────────────────────────────────────── */

/**
 * The swaps a trainer can keep: each replaces a machine A has, brings in one
 * A doesn't and won't (not on A's own road, `aIntended`), names each machine
 * once, and never one the client can't do; on this floor when the floor is
 * known.
 */
export function usableSwaps(input: {
  swaps: readonly PlanSwap[];
  aRoutine: readonly string[];
  /** Routine A's plan's road: a machine A will take in is never B's swap. */
  aIntended?: readonly string[] | null;
  floor: readonly FloorMachine[];
  cantDo?: readonly CantDo[] | null;
  todayYmd: string;
}): PlanSwap[] {
  const held = new Set(activeCantDo({ cantDo: input.cantDo ? [...input.cantDo] : undefined }, input.todayYmd).map((c) => c.machineId));
  const onFloor = new Set(input.floor.map((m) => m.id));
  const aComing = input.aIntended ?? [];
  const out: PlanSwap[] = [];
  for (const s of input.swaps) {
    if (!s?.replaces || !s?.with || s.replaces === s.with) continue;
    if (!input.aRoutine.includes(s.replaces) || input.aRoutine.includes(s.with) || aComing.includes(s.with)) continue;
    if (held.has(s.with) || (onFloor.size > 0 && !onFloor.has(s.with))) continue;
    if (out.some((o) => o.with === s.with || o.replaces === s.replaces)) continue;
    out.push({ replaces: s.replaces, with: s.with });
  }
  return out;
}

export interface StartedB {
  /** B's plan: B as it will be when built, the swaps in the order they come in. */
  plan: RoutinePlan;
  /** Routine B today: A with the first swap made. */
  machineIds: string[];
  /** The plan's first change, unsigned: "start", the first swap, `B_START`. */
  change: BChange;
}

/**
 * Plan B, kept (AJ, Oct 7 2026: "B routine starts out as the A routine with
 * just one machine different"): B's plan holds B whole (`intended`, A with
 * every planned swap made), its swaps in order, what B is for, nobody's
 * "being built" switch (B grows by its swaps), who and when; Routine B
 * starts as A with the FIRST swap made. Null when no swap can be kept (A
 * has no machines, or nothing on this floor to swap in).
 */
export function startBPlan(input: {
  aRoutine: readonly string[];
  /** Routine A's plan: its can't-do marks are B's too, its road is A's own, and the starting routine it came from. */
  aPlan?: Pick<RoutinePlan, "cantDo" | "templateId"> & Partial<Pick<RoutinePlan, "intended">> | null;
  floor: readonly FloorMachine[];
  purpose: BPurpose;
  swaps: readonly PlanSwap[];
  who: { uid: string; name?: string };
  todayYmd: string;
}): StartedB | null {
  const aRoutine = once(input.aRoutine);
  const swaps = usableSwaps({
    swaps: input.swaps,
    aRoutine,
    aIntended: input.aPlan?.intended,
    floor: input.floor,
    cantDo: input.aPlan?.cantDo,
    todayYmd: input.todayYmd,
  });
  const first = swaps[0];
  if (!first || aRoutine.length === 0) return null;
  const name = input.who.name?.trim();
  const plan: RoutinePlan = {
    purpose: B_PURPOSE_WORDS[input.purpose],
    purposeKinds: bPurposeKinds(input.purpose),
    intended: bIntendedOf(aRoutine, swaps),
    swaps,
    building: false,
    madeByUid: input.who.uid,
    ...(name ? { madeByName: name } : null),
    madeAt: input.todayYmd,
    ...(input.aPlan?.templateId ? { templateId: input.aPlan.templateId } : null),
  };
  return {
    plan,
    machineIds: bRoutineOf(aRoutine, swaps, 1),
    change: { kind: "start", machineIds: [first.replaces, first.with], value: B_START },
  };
}

/** Turning B on with nothing in B opens Plan B instead of making an empty Routine B (the critic's #22). */
export function bToggleOpensPlanB(on: boolean, b: Pick<Routine, "machineIds"> | null | undefined): boolean {
  return on && (b?.machineIds?.length ?? 0) === 0;
}

/**
 * What the B switch does (the profile's switch, Routine B's segment and the
 * Edit routine drawer's B tab all ask this):
 * - "plan-b": turning B on with nothing in Routine B opens Plan B;
 * - "switch": the switch as it always was (B has machines, or B goes off),
 *   its reason asked, never required;
 * - "cant-tell": turning B on before the client's routines have answered
 *   (or after the read failed). An unread list is never "no Routine B": it
 *   would open Plan B over a Routine B that may hold machines, or turn B on
 *   over one that holds none.
 */
export type BSwitchStep = "plan-b" | "switch" | "cant-tell";

export function bSwitchStep(on: boolean, b: Pick<Routine, "machineIds"> | null | undefined, routinesKnown: boolean): BSwitchStep {
  if (!on) return "switch";
  if (!routinesKnown) return "cant-tell";
  return bToggleOpensPlanB(on, b) ? "plan-b" : "switch";
}

/** Said when the B switch can't tell yet what Routine B holds. */
export const B_SWITCH_CANT_TELL = "Can't tell yet what Routine B holds. Try again once the routines have loaded.";

/* ── The A | B lineup ──────────────────────────────────────────────────── */

/**
 * One place in A's order, and B's cell beside it:
 * - "own": B has its own machine here (a swap made), `bId` it, `swap` which;
 * - "next": B still follows A here, and this place's swap is the next one;
 * - "follows": B follows A here; `later` when a swap is planned for it after
 *   the next one, else B keeps A's machine;
 * - "missing": B doesn't hold A's machine here and no swap made names it
 *   (B edited by hand): said as it is, never drawn as following.
 */
export interface BColumnRow {
  aId: string;
  kind: "own" | "next" | "follows" | "missing";
  /** What B runs at this place, or null when B doesn't hold one. */
  bId: string | null;
  /** This place's planned swap, made or not. */
  swap: PlanSwap | null;
}

export interface BColumn {
  rows: BColumnRow[];
  /**
   * Swaps still to come whose A machine has left A (a change to A since B
   * was planned): no place of A shows them, so they are drawn under the
   * rows, to be left out (`bSlotKept`) or swapped in at the end.
   */
  gone: PlanSwap[];
  /** What B holds beyond A's places: a swap whose A machine has left A (`for` it), or a machine of B's own. */
  extras: Array<{ id: string; for: string | null }>;
  status: BStatus;
}

export function bColumnOf(aRoutine: readonly string[], bPlan: Pick<RoutinePlan, "swaps">, bRoutine: readonly string[]): BColumn {
  const swaps = swapsOf(bPlan);
  const status = bStatus(swaps, bRoutine);
  const rows: BColumnRow[] = once(aRoutine).map((aId) => {
    const si = swaps.findIndex((s) => s.replaces === aId);
    const swap = si >= 0 ? swaps[si]! : null;
    // B's own machine here, unless A holds it now too (then it is drawn at A's own place, once).
    if (swap && si < status.made && bRoutine.includes(swap.with) && !aRoutine.includes(swap.with)) {
      return { aId, kind: "own", bId: swap.with, swap };
    }
    if (!bRoutine.includes(aId)) return { aId, kind: "missing", bId: null, swap };
    if (swap && si === status.made) return { aId, kind: "next", bId: aId, swap };
    return { aId, kind: "follows", bId: aId, swap };
  });
  const shown = new Set(rows.map((r) => r.bId).filter((id): id is string => !!id));
  const extras = once(bRoutine)
    .filter((id) => !shown.has(id))
    .map((id) => ({ id, for: swaps.find((s) => s.with === id)?.replaces ?? null }));
  const gone = swaps.slice(status.made).filter((s) => !aRoutine.includes(s.replaces) && !bRoutine.includes(s.with));
  return { rows, extras, gone, status };
}

/**
 * B's own on deck: machines on B's plan's road that Routine B doesn't hold
 * yet and that are neither A's nor a swap's (a weak area's addition for B,
 * focus.ts `focusAddToB`). Drawn under B's column; Routine B takes one only
 * on purpose (the Wrap-up after a B session, or the Edit routine drawer).
 */
export function bOnDeck(aRoutine: readonly string[], bPlan: Pick<RoutinePlan, "intended" | "swaps">, bRoutine: readonly string[]): string[] {
  const intended = Array.isArray(bPlan.intended) ? bPlan.intended : [];
  return once(extrasOf(intended, aRoutine, swapsOf(bPlan))).filter((id) => !bRoutine.includes(id));
}

/**
 * A machine taken off B's own on deck (a tap on "On deck in B"): a "remove"
 * on B's plan, Routine B as it was. Null when it isn't on B's own deck, so
 * a swap's machine or one of A's is never taken off from here.
 */
export function bOnDeckRemoved(aRoutine: readonly string[], bPlan: RoutinePlan, bRoutine: readonly string[], machineId: string): BEdit | null {
  if (!bOnDeck(aRoutine, bPlan, bRoutine).includes(machineId)) return null;
  return {
    plan: { ...bPlan, intended: bPlan.intended.filter((id) => id !== machineId) },
    machineIds: [...bRoutine],
    changes: [{ kind: "remove", machineIds: [machineId] }],
  };
}

/* ── B's changes ───────────────────────────────────────────────────────── */

/** One tap's edit to B: its plan, Routine B's machines, and the change(s), unsigned. */
export interface BEdit {
  plan: RoutinePlan;
  machineIds: string[];
  changes: BChange[];
}

/** B's machines with `made` swaps: a place a trainer took out of B stays out, B's own extras kept at the end. */
function bWith(aRoutine: readonly string[], swaps: readonly PlanSwap[], made: number, bRoutine: readonly string[]): string[] {
  const dropped = droppedFromB(aRoutine, swaps, bRoutine);
  const base = bRoutineOf(aRoutine, swaps, made).filter((id) => !dropped.includes(id));
  return [...base, ...extrasOf(bRoutine, aRoutine, swaps).filter((id) => !base.includes(id))];
}

/**
 * Why a swap still to come can't go in now, or null when it can:
 * - "cantdo": its machine is on the client's can't-do list (Routine A's
 *   plan's, read by A and B: AJ's "2a");
 * - "gone": the A machine it replaces has left A, so swapping it in would
 *   only add a machine to B (the review of Round 2);
 * - "in-a": Routine A holds its machine now, so swapping it in would only
 *   take a machine out of B.
 * It waits, never swapped in, until its place's swap is changed (or, for a
 * can't-do, the mark ends).
 */
export type BSwapWait = "cantdo" | "gone" | "in-a";

export function bSwapWait(s: PlanSwap, aRoutine: readonly string[], held: readonly string[] = []): BSwapWait | null {
  if (held.includes(s.with)) return "cantdo";
  if (!aRoutine.includes(s.replaces)) return "gone";
  if (aRoutine.includes(s.with)) return "in-a";
  return null;
}

/** How many of B's next swaps can go in now: from the next one, up to the first that waits (`bSwapWait`). */
export function swapsReady(
  aRoutine: readonly string[],
  swaps: readonly PlanSwap[],
  bRoutine: readonly string[],
  held: readonly string[] = [],
): number {
  let n = 0;
  for (const s of swaps.slice(swapsMade(swaps, bRoutine))) {
    if (bSwapWait(s, aRoutine, held)) break;
    n += 1;
  }
  return n;
}

/**
 * "Swap in the next one", or two, or three (AJ: "there are times where a
 * trainer might do two machines different or three machines different in a
 * single session"): Routine B with the next swaps made, the plan as it was,
 * and one "swap" change for each, in one batch. Never a machine the client
 * can't do (`held`), and never a swap that would only add a machine to B or
 * take one out (`bSwapWait`): the swaps stop before it. Null when B is
 * built, or the next swap waits.
 */
export function bSwappedIn(
  aRoutine: readonly string[],
  bPlan: RoutinePlan,
  bRoutine: readonly string[],
  count = 1,
  held: readonly string[] = [],
): BEdit | null {
  const swaps = swapsOf(bPlan);
  const made = swapsMade(swaps, bRoutine);
  const coming = swaps.slice(made, made + Math.min(Math.max(1, count), swapsReady(aRoutine, swaps, bRoutine, held)));
  if (coming.length === 0) return null;
  return {
    plan: bPlan,
    machineIds: bWith(aRoutine, swaps, made + coming.length, bRoutine),
    changes: coming.map((s) => ({ kind: "swap", machineIds: [s.replaces, s.with], value: B_SWAP_MADE })),
  };
}

/**
 * B's road without the machines its swaps bring in, so a swap changed or
 * left out takes its old machine off the road (the review of Round 2: kept
 * as an "extra", the old machine stayed on B's road for good). The swaps
 * still planned put their machines back (`bIntendedOf`).
 */
function ownExtrasOf(bPlan: Pick<RoutinePlan, "intended">, swaps: readonly PlanSwap[]): string[] {
  return bPlan.intended.filter((id) => !swaps.some((s) => s.with === id));
}

/**
 * B's planned swap for one of A's places changed to `to` (a tap on B's
 * cell). A place with no swap yet gets one, last in the order. When the
 * place's swap is already in B, B's machine changes with it. Null when
 * nothing changes.
 */
export function bSlotPlanned(input: {
  aRoutine: readonly string[];
  bPlan: RoutinePlan;
  bRoutine: readonly string[];
  aId: string;
  to: string;
}): BEdit | null {
  const swaps = swapsOf(input.bPlan);
  const si = swaps.findIndex((s) => s.replaces === input.aId);
  if (!input.to || input.to === input.aId || (si >= 0 && swaps[si]!.with === input.to)) return null;
  const made = swapsMade(swaps, input.bRoutine);
  const nextSwaps = si >= 0 ? swaps.map((s, k) => (k === si ? { ...s, with: input.to } : s)) : [...swaps, { replaces: input.aId, with: input.to }];
  const inB = si >= 0 && si < made ? swaps[si]!.with : null;
  const machineIds = inB ? input.bRoutine.map((id) => (id === inB ? input.to : id)) : [...input.bRoutine];
  return {
    plan: { ...input.bPlan, swaps: nextSwaps, intended: bIntendedOf(input.aRoutine, nextSwaps, ownExtrasOf(input.bPlan, swaps)) },
    machineIds,
    changes: [{ kind: "swap", machineIds: [input.aId, input.to], value: B_SWAP_PLANNED }],
  };
}

/**
 * B keeps A's machine at this place: its swap leaves the plan. A swap
 * already in B gives the place back to A's machine (or, when A no longer
 * has it, B simply loses the swap's machine). Null when the place has no
 * swap.
 */
export function bSlotKept(input: { aRoutine: readonly string[]; bPlan: RoutinePlan; bRoutine: readonly string[]; aId: string }): BEdit | null {
  const swaps = swapsOf(input.bPlan);
  const si = swaps.findIndex((s) => s.replaces === input.aId);
  if (si < 0) return null;
  const swap = swaps[si]!;
  const made = swapsMade(swaps, input.bRoutine);
  const inB = si < made && input.bRoutine.includes(swap.with);
  const nextSwaps = swaps.filter((_, k) => k !== si);
  const machineIds = !inB
    ? [...input.bRoutine]
    : input.aRoutine.includes(input.aId) && !input.bRoutine.includes(input.aId)
      ? input.bRoutine.map((id) => (id === swap.with ? input.aId : id))
      : input.bRoutine.filter((id) => id !== swap.with);
  return {
    plan: { ...input.bPlan, swaps: nextSwaps, intended: bIntendedOf(input.aRoutine, nextSwaps, ownExtrasOf(input.bPlan, swaps)) },
    machineIds,
    changes: [{ kind: "swap", machineIds: [input.aId], value: B_SWAP_KEPT }],
  };
}

/** "B is for": Variety · Recovery · Both, as a "purpose" change. Routine B's machines are as they were. */
export function bPurposeChanged(bPlan: RoutinePlan, bRoutine: readonly string[], purpose: BPurpose): BEdit {
  const words = B_PURPOSE_WORDS[purpose];
  return {
    plan: { ...bPlan, purpose: words, purposeKinds: bPurposeKinds(purpose) },
    machineIds: [...bRoutine],
    changes: [{ kind: "purpose", machineIds: [], value: words }],
  };
}

/* ── A slot's choices ──────────────────────────────────────────────────── */

export interface BSwapChoices {
  /** The A machine's Academy family, by name, or null when the Academy doesn't sort it. */
  family: string | null;
  /** B's planned swap for this place now, or null. */
  current: string | null;
  /** The same family on this floor, in the floor's order: never A's (now or still to come), another swap's, or one the client can't do. */
  same: string[];
  /** The Academy's one-machine substitutes for the A machine on this floor, not already in `same`. */
  substitutes: string[];
}

/**
 * What one of A's places can have in B (a tap on B's cell): the same
 * Academy family on THIS floor, then the Academy's documented substitutes,
 * each said with its source on screen. A swap is one machine for one, so
 * only the Academy's one-machine substitutes are offered.
 */
export function bSwapChoices(input: {
  aId: string;
  aRoutine: readonly string[];
  /** Routine A's plan's road: A's machines still to come are never offered for B. */
  aIntended?: readonly string[] | null;
  bPlan: Pick<RoutinePlan, "swaps"> | null;
  floor: readonly FloorMachine[];
  cantDo?: readonly CantDo[] | null;
  todayYmd: string;
}): BSwapChoices {
  const canonicalOf = floorCanonical(input.floor);
  const index = floorIndex(input.floor);
  const swaps = swapsOf(input.bPlan);
  const current = swaps.find((s) => s.replaces === input.aId)?.with ?? null;
  const taken = new Set(
    [
      ...input.aRoutine,
      ...(input.aIntended ?? []),
      ...swaps.filter((s) => s.with !== current).map((s) => s.with),
      ...activeCantDo({ cantDo: input.cantDo ? [...input.cantDo] : undefined }, input.todayYmd).map((c) => c.machineId),
    ].map(canonicalOf),
  );
  const free = (id: string | undefined): id is string => !!id && !taken.has(canonicalOf(id));
  const target = canonicalOf(input.aId);
  const category = MACHINE_CATEGORY[target];
  const same = category ? once(input.floor.map((m) => m.id)).filter((id) => MACHINE_CATEGORY[canonicalOf(id)] === category && free(id)) : [];
  const substitutes: string[] = [];
  for (const set of EXERCISE_SUBSTITUTES[target] ?? []) {
    if (set.machineIds.length !== 1) continue;
    const id = index.get(set.machineIds[0]!);
    if (free(id) && !same.includes(id) && !substitutes.includes(id)) substitutes.push(id);
  }
  return { family: category ? CATEGORY_LABEL[category] : null, current, same, substitutes };
}

/* ── The words ─────────────────────────────────────────────────────────── */

/** "B · 2 of 5 swaps · next: Leg Extension for Leg Press", "B · all 5 swaps in". Names never shortened. */
export function bStatusLine(status: BStatus, nameOf: (id: string) => string): string {
  if (status.of === 0) return "B · no swaps planned";
  if (status.built || !status.next) return `B · all ${status.of} swaps in`;
  return `B · ${status.made} of ${status.of} swaps · next: ${nameOf(status.next.with)} for ${nameOf(status.next.replaces)}`;
}

/** B's swaps as the segmented meter reads a plan's progress: one segment a swap. */
export function bProgressOf(status: BStatus): PlanProgress {
  return { have: status.made, of: status.of, next: status.next?.with ?? null, extras: [], complete: status.built };
}

/** "A and B alternate · next session is B", from the alternation the session runs (`next-routine.ts`); null when it isn't known. */
export function alternateLine(nextIsB: boolean | null | undefined): string | null {
  if (nextIsB === null || nextIsB === undefined) return null;
  return `A and B alternate · next session is ${nextIsB ? "B" : "A"}`;
}

/**
 * How many times Routine A has run in Journey: its completed sessions, on
 * or after `sinceYmd` when given. Journey's count only: a client mid-
 * migration ran A before Journey too (docs/business/migration-and-prior-
 * history.md), which is why the line always says "in Journey".
 */
export function aRunsSince(
  sessions: readonly Pick<WorkoutSession, "routineId" | "status" | "date">[],
  aRoutineId: string | null | undefined,
  sinceYmd?: string | null,
): number {
  if (!aRoutineId) return 0;
  return sessions.filter((s) => {
    if (s.status !== "Completed" || s.routineId !== aRoutineId) return false;
    if (!sinceYmd) return true;
    const day = studioDayKeyOf(typeof s.date === "string" ? s.date : null);
    return !!day && day >= sinceYmd;
  }).length;
}

/**
 * "Routine A has run 7 times in Journey." With only part of the history
 * read (`atLeast`), "at least"; with nothing read yet, nothing is said
 * rather than a zero that isn't known. The words are history-claims.ts's
 * (`routineRunsLine`), judged by how much of the client's story Journey
 * holds: for a client who trained before Journey, a zero says nothing and a
 * count says sessions before Journey aren't counted (the review of Round 2;
 * docs/business/migration-and-prior-history.md).
 */
export function aRunsLine(runs: number, atLeast: boolean, coverage: HistoryCoverage = "unknown"): string | null {
  return routineRunsLine(runs, atLeast, coverage);
}

/** The Academy on when B starts and how it grows: said beside Plan B and B's head, never enforced. */
export const B_ACADEMY_LINE = "The Academy starts B after 5 to 7 runs of A, then swaps about one a week.";
/** The Academy's build-out, for the (i). */
export const B_BUILD_OUT_LINE = `B is built out in full over at least ${B_ROUTINE_BUILD_OUT.weeks} weeks (${B_ROUTINE_BUILD_OUT.sessions} sessions).`;
/** Where both lines come from (`startingSourceWords` says it in words). */
export const B_ACADEMY_SOURCE = B_ROUTINE_BUILD_OUT.source;
/** Where B's suggested swaps come from. */
export const B_SWAPS_SOURCE = "From the Academy's AB Routines and Exercise Selection Template";

/* ── The briefing's glance ─────────────────────────────────────────────── */

/**
 * The Road for a session on Routine B (the briefing's glance; AJ's "1d":
 * "the Road's one-line route wherever a glance is all there is"): today's
 * machines under the bracket, then the swaps still to come, each its
 * incoming machine with the A machine it replaces under it, the first the
 * next stop; then B's own on deck (a weak area's addition for B, given
 * Routine A's machines, `bOnDeck`), so the next trainer sees it; then any
 * machine B's plan names that the client can't do, crossed.
 */
export function bRoadGroups(input: {
  bPlan: Pick<RoutinePlan, "swaps" | "intended">;
  /** Routine A's machines: with them, B's own on deck is drawn. */
  aRoutine?: readonly string[];
  /** Today's machines, in today's order. */
  today: readonly string[];
  /** B as it stands: which swaps are made. */
  bRoutine: readonly string[];
  /** Routine A's plan's can't-do marks (read by A and B). */
  cantDo?: readonly CantDo[] | null;
  todayYmd: string;
  nameOf: (id: string) => string;
  firstName?: string | null;
}): RoadGroup[] {
  const swaps = swapsOf(input.bPlan);
  const made = swapsMade(swaps, input.bRoutine);
  const today = once(input.today);
  const held = activeCantDo({ cantDo: input.cantDo ? [...input.cantDo] : undefined }, input.todayYmd).map((c) => c.machineId);
  const coming = swaps.slice(made).filter((s) => !today.includes(s.with) && !held.includes(s.with));
  const named = new Set([...input.bPlan.intended, ...swaps.map((s) => s.with)]);
  const deck = input.aRoutine
    ? bOnDeck(input.aRoutine, input.bPlan, input.bRoutine).filter((id) => !today.includes(id) && !held.includes(id))
    : [];
  const first = input.firstName?.trim();
  const groups: RoadGroup[] = [
    { key: "today", label: `Today · ${today.length}`, bracket: true, stations: today.map((id) => ({ id, kind: "in" as const })) },
    {
      key: "then",
      label: "Swaps to come",
      stations: coming.map((s, i) =>
        i === 0
          ? { id: s.with, kind: "next" as const, mark: `Next stop · for ${input.nameOf(s.replaces)}` }
          : { id: s.with, kind: "planned" as const, mark: `for ${input.nameOf(s.replaces)}` },
      ),
    },
    { key: "deck", label: "On deck in B", stations: deck.map((id) => ({ id, kind: "planned" as const })) },
    {
      key: "cantdo",
      label: first ? `Not for ${first}` : "Can't do",
      stations: held.filter((id) => named.has(id) && !today.includes(id)).map((id) => ({ id, kind: "cantdo" as const })),
    },
  ];
  return groups.filter((g) => g.stations.length > 0);
}
