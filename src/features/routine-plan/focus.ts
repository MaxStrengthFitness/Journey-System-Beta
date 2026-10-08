/**
 * A weak area (AJ, Oct 7 2026: "we discovered that the client has very weak
 * delts. What can we do about to adjust the routines currently?"; his yes to
 * the proposal in docs/rounds/2026-10-07-first-session-and-routines.md §5.4b).
 *
 * The Academy has no weak-point rule of its own. What it does say answers it:
 * - a region you want to grow is hit in BOTH workouts of the week ("key
 *   exercises should be repeated in the A and B", the Exercise Selection
 *   Template; `TWICE_WEEKLY_RULE`);
 * - a machine for it goes in "if time permits or used to replace a lower
 *   priority muscle group" (A/B Routines), so a swap within the same family
 *   comes before an addition (AJ's own example: Seated Dip → Overhead Press);
 * - extra slots beyond the Big 5 go to single-joint machines ("add in the
 *   lateral raise and some direct, single joint arm exercises", Programming
 *   and Progression 1);
 * - pre-exhausting the weak muscle is not a default ("based on the faulty
 *   premise that fatigue is a stimulus").
 * So this never reorders a routine to put the weak area first, and never
 * moves a weight. Every answer is a suggestion a trainer taps.
 */
import { canonicalMachineId } from "../catalog/machine-identity";
import { MACHINE_ANATOMY, type MuscleId } from "../../data/machine-anatomy-map";
import { EXERCISE_COUNT, MACHINE_CATEGORY } from "../routine-builder/academy";
import { floorIndex, type FloorMachine } from "./starting-plan";

/**
 * Areas a trainer picks, each the muscle ids it covers. "Delts" is the front
 * and rear delt the anatomy map knows; the middle delt (Lateral Raise's, per
 * the Academy) has no id yet, which waits on the body figure's side view.
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

/** Areas the Academy answers with settings rather than machines. */
const SETTINGS_NOT_MACHINES: Record<string, string> = {
  grip: "Grip usually adapts with the pulling machines already in the routine (Exercise Selection Template). Hand pads help while it does.",
  triceps: "Weak triceps on the Triceps Extension can be helped with a gap setting first (Comprehensive Equipment Overview, Triceps Extension).",
};

export interface FocusMachine {
  /** Floor id. */
  machineId: string;
  /** Works the area as a primary mover, or as a helper. */
  role: "primary" | "helper";
}

export interface FocusSwap {
  routine: "A" | "B";
  /** Floor ids: the machine that goes, and the one that takes its place. */
  from: string;
  to: string;
}

export interface FocusAdd {
  routine: "A" | "B";
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
  missingFrom: Array<"A" | "B">;
  /** 2 · Swaps within the same Academy category, so the routine keeps its length and balance. */
  swaps: FocusSwap[];
  /** 3 · Additions, single-joint machines first, with what they do to the count. */
  adds: FocusAdd[];
  /** When the Academy answers the area with a setting instead. */
  settingsNote: string | null;
}

function worksArea(canonical: string, muscles: readonly MuscleId[]): "primary" | "helper" | null {
  const entry = MACHINE_ANATOMY[canonical];
  if (!entry) return null;
  if (entry.primary.some((m) => muscles.includes(m))) return "primary";
  if ((entry.secondary ?? []).some((m) => muscles.includes(m))) return "helper";
  return null;
}

export function focusAdvice(input: {
  area: string;
  a: readonly string[];
  b: readonly string[] | null;
  floor: readonly FloorMachine[];
}): FocusAdvice | null {
  const def = FOCUS_AREAS[input.area];
  if (!def) return null;
  const index = floorIndex(input.floor);

  const machines: FocusMachine[] = [];
  for (const [canonical, floorId] of index) {
    const role = worksArea(canonical, def.muscles);
    if (role) machines.push({ machineId: floorId, role });
  }
  machines.sort((x, y) => (x.role === y.role ? 0 : x.role === "primary" ? -1 : 1));

  const working = (routine: readonly string[]) =>
    routine.filter((id) => worksArea(canonicalMachineId(id), def.muscles) !== null);
  const inA = working(input.a);
  const inB = input.b ? working(input.b) : null;
  const primaryIn = (routine: readonly string[]) =>
    routine.some((id) => worksArea(canonicalMachineId(id), def.muscles) === "primary");

  const missingFrom: Array<"A" | "B"> = [];
  if (!primaryIn(input.a)) missingFrom.push("A");
  if (input.b && !primaryIn(input.b)) missingFrom.push("B");

  const primaries = machines.filter((m) => m.role === "primary").map((m) => m.machineId);
  const swaps: FocusSwap[] = [];
  const adds: FocusAdd[] = [];
  for (const which of missingFrom) {
    const routine = which === "A" ? input.a : input.b!;
    const candidates = primaries.filter((id) => !routine.includes(id));
    // A swap: a machine in the routine of the same Academy category that
    // doesn't work the area as a primary mover (one that doesn't work it at
    // all first, then a helper: Seated Dip helps the front delt, and AJ's own
    // example swaps it for Overhead Press).
    for (const to of candidates) {
      const category = MACHINE_CATEGORY[canonicalMachineId(to)];
      const sameCategory = routine.filter((id) => MACHINE_CATEGORY[canonicalMachineId(id)] === category);
      const from =
        sameCategory.find((id) => worksArea(canonicalMachineId(id), def.muscles) === null) ??
        sameCategory.find((id) => worksArea(canonicalMachineId(id), def.muscles) === "helper");
      if (from && !swaps.some((s) => s.routine === which && s.from === from)) swaps.push({ routine: which, from, to });
    }
    // An addition: single-joint machines first.
    const singleJointFirst = [...candidates].sort((x, y) => {
      const iso = (id: string) => MACHINE_ANATOMY[canonicalMachineId(id)]?.movementPattern === "Upper Body: Isolation";
      return Number(iso(y)) - Number(iso(x));
    });
    for (const machineId of singleJointFirst) {
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
