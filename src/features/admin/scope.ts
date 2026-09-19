/**
 * OPERATIONS SCOPE — which studios a reader may LOOK AT from Operations.
 *
 * Round: Operations (Round B of the Operations audit), Sep 2026. The audit's
 * finding was "every studio to everyone": the Studios tab listed the whole
 * company to every leader, Insights offered studios the reader could not
 * read, and the Franchise dashboard existed because nothing else knew what
 * "my studios" meant. This is the one answer, for every tab:
 *
 *   company tier (administrators, founders) and the owner tier (franchise
 *   owners)                       every studio
 *   the studio tier               the studios they run — a leader role at
 *                                 the home or an owned studio, or the grant
 *                                 (leadsStudio, which mirrors the rules)
 *
 * The rules are the real fence (`sessions` and `clients` are studio-scoped
 * by rule, so an unreadable studio's query is refused whole); this decides
 * what is OFFERED so nothing is offered that the rules refuse. The
 * franchise-owner partition (ARCHITECTURE §3.4) narrows the owner tier to
 * its network when it is built; it changes this function and nothing else.
 */
import type { Studio, Trainer } from "../../types";
import { isEveryStudioRole, leadsStudio } from "../renewals/permissions";

/** Studios the reader may open in Operations, by name. */
export function operationsStudios(
  trainer: Trainer | null | undefined,
  studios: Studio[],
  isAdmin = false,
): Studio[] {
  const all = isAdmin || isEveryStudioRole(trainer);
  return studios
    .filter((s) => all || leadsStudio(trainer, s.id))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/**
 * What the Operations masthead offers: one studio, or every studio the
 * reader may look at. "all" only exists when there is more than one.
 */
export type OperationsScope = { kind: "studio"; studioId: string } | { kind: "all" };

/** The scope's studios, in reading order. */
export function studiosInScope(scope: OperationsScope, readable: Studio[]): Studio[] {
  if (scope.kind === "all") return readable;
  return readable.filter((s) => s.id === scope.studioId);
}

/**
 * The scope a tab starts on: the active studio when the reader may look at
 * it, else the first readable one; never "all" by default — a leader of one
 * studio should open on that studio, and an owner of three should choose.
 */
export function initialScope(readable: Studio[], activeStudioId: string | null | undefined): OperationsScope | null {
  if (activeStudioId && readable.some((s) => s.id === activeStudioId)) return { kind: "studio", studioId: activeStudioId };
  return readable[0] ? { kind: "studio", studioId: readable[0].id } : null;
}
