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
 */
import { canonicalMachineId } from "../catalog/machine-identity";
import {
  COMPLEMENTARY_PAIRS,
  MACHINE_CATEGORY,
  MODEL_AB_ROUTINE,
  SELECTION_TEMPLATES,
  preferenceFromGender,
} from "../routine-builder/academy";
import { floorIndex, type FloorMachine } from "./starting-plan";
import type { PlanSwap } from "./types";

/** How many of B's planned swaps the B routine has made today. */
export function swapsMade(swaps: readonly PlanSwap[], bRoutine: readonly string[]): number {
  let n = 0;
  for (const s of swaps) {
    if (bRoutine.includes(s.with)) n += 1;
    else break;
  }
  return n;
}

/**
 * B's routine: A with the first `made` swaps applied, in A's order. A machine
 * of A that B hasn't swapped yet follows A, so a change to A during the
 * build-out reaches B's unswapped part by itself; B's own swaps stay. A swap
 * whose A machine has left A is added where it was.
 */
export function bRoutineOf(aRoutine: readonly string[], swaps: readonly PlanSwap[], made: number): string[] {
  const out = [...aRoutine];
  for (const s of swaps.slice(0, Math.max(0, made))) {
    const at = out.indexOf(s.replaces);
    if (at >= 0) out[at] = s.with;
    else if (!out.includes(s.with)) out.push(s.with);
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
 * template's eventual B, then the Academy's model B, then the Academy's named
 * complementary pairs, and only machines on the floor. Same regions,
 * different machines, which is what the Academy says B is. A suggestion the
 * trainer edits; an A machine with nothing to pair stays in B as it is.
 */
export function suggestBSwaps(input: {
  aRoutine: readonly string[];
  floor: readonly FloorMachine[];
  templateId?: string | null;
  gender?: string | null;
}): PlanSwap[] {
  const index = floorIndex(input.floor);
  const canonicalOf = (id: string) => canonicalMachineId(id);
  const aCanonical = new Set(input.aRoutine.map(canonicalOf));
  const template = input.templateId ? SELECTION_TEMPLATES.find((t) => t.id === input.templateId) : undefined;
  const model = MODEL_AB_ROUTINE[preferenceFromGender(input.gender)];
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
      (c) => MACHINE_CATEGORY[c] === category && !aCanonical.has(c) && !used.has(c) && index.has(c),
    );
    if (!pick) continue;
    used.add(pick);
    swaps.push({ replaces: aId, with: index.get(pick)! });
  }
  return swaps;
}
