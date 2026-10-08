/**
 * Order effects, as quiet sentences (AJ, Oct 8 2026: "progressing in one
 * machine may help increase the performance on another but performing one
 * machine could hurt the clients performance if that session has that machine
 * in it").
 *
 * The Academy's sequencing rules (`SEQUENCING_RULES`, read by the routine
 * builder's `findViolations`) already say which orders hurt and why. This
 * puts them in the plan's words: a row between the two machines that trip
 * one, "Lumbar directly into Leg Press · the Academy says avoid", with the
 * Academy's why and its source one tap away. A sentence, never a block:
 * nothing refuses an order (AJ: "you shouldn't really be blocked").
 *
 * Pure. Ids are the floor's, as a plan or routine holds them; the rules are
 * read on the floor's catalog ids when the floor is given (a studio's own
 * unit `unit-7` that is a Leg Press trips the Leg Press rules).
 */
import { canonicalMachineId } from "../catalog/machine-identity";
import { findViolations } from "../routine-builder/engine";
import { floorCanonical, type FloorMachine } from "./starting-plan";

export interface OrderEffect {
  ruleId: string;
  /** The Academy's title: "Lumbar directly into Leg Press". */
  title: string;
  /** The Academy's why, for the row's (i). */
  why: string;
  /** The document it comes from. */
  source: string;
  severity: "avoid" | "caution";
  /** "adjacent": the two stand side by side (the row goes between them); "session": both are in the session. */
  scope: "adjacent" | "session";
  /** The two machines, as the caller's ids, in the order they stand. */
  machineIds: string[];
  /** Their names, from the caller. */
  names: string[];
  /** Their positions in the list, ascending. */
  indices: number[];
  /** "Lumbar directly into Leg Press · the Academy says avoid", or "… · the Academy's caution". */
  sentence: string;
}

/** The row's words: the Academy's title and how strongly it says it. */
export function orderEffectSentence(effect: Pick<OrderEffect, "title" | "severity">): string {
  return `${effect.title} · ${effect.severity === "avoid" ? "the Academy says avoid" : "the Academy's caution"}`;
}

/**
 * Every order effect in a list of machines, the Academy's "avoid" first, then
 * by where they stand. An id the rules don't know (a studio's own machine)
 * trips nothing.
 */
export function orderEffects(
  ids: readonly string[],
  nameOf: (id: string) => string,
  floor?: readonly FloorMachine[],
): OrderEffect[] {
  const list = ids.filter((id) => typeof id === "string" && id !== "");
  const canonicalOf = floor ? floorCanonical(floor) : (id: string) => canonicalMachineId(id);
  const canonical = list.map((id) => canonicalOf(id) || id);
  const names: Record<string, string> = {};
  canonical.forEach((c, i) => {
    names[c] = nameOf(list[i]);
  });
  return findViolations(canonical, names).map((v) => {
    const machineIds = v.indices.map((i) => list[i]);
    return {
      ruleId: v.ruleId,
      title: v.title,
      why: v.why,
      source: v.source,
      severity: v.severity,
      scope: v.scope,
      machineIds,
      names: machineIds.map(nameOf),
      indices: [...v.indices],
      sentence: orderEffectSentence(v),
    };
  });
}
