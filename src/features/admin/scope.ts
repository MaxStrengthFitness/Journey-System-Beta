/**
 * OPERATIONS SCOPE — which studios a reader may LOOK AT from Operations.
 *
 * Round: Operations (Round B of the Operations audit), Sep 2026. The audit's
 * finding was "every studio to everyone": the Studios tab listed the whole
 * company to every leader, Insights offered studios the reader could not
 * read, and the Franchise dashboard existed because nothing else knew what
 * "my studios" meant. This is the one answer, for every tab:
 *
 *   company tier (administrators, founders)   every studio
 *   owner tier (franchise owners)              the studios that reach them —
 *                                              studio.ownerId, their
 *                                              ownedStudioIds, a network they
 *                                              own — plus any they lead
 *   the studio tier                            the studios they run: a leader
 *                                              role at the home or an owned
 *                                              studio, or the grant
 *                                              (leadsStudio, which mirrors
 *                                              the rules)
 *
 * The rules are the real fence (`sessions` and `clients` are studio-scoped
 * by rule, so an unreadable studio's query is refused whole); this decides
 * what is OFFERED so nothing is offered that the rules refuse. The owner
 * tier's list is the same union franchise/scope.ts used for the Franchise
 * dashboard, so an owner sees the same studios here that they saw there.
 *
 * "This studio" on Operations is the studio the APP is in — the same
 * streams (the roster, the schedule, today's sessions) every tab already
 * reads — so choosing a single studio here switches the app to it, exactly
 * as the studio picker in the header does. "All my studios" is the other
 * scope: tabs that can add studios up do; tabs that read one studio at a
 * time say so and offer the list. See scope-context.tsx.
 */
import type { FranchiseNetwork, Studio, Trainer } from "../../types";
import { isEveryStudioRole, leadsStudio } from "../renewals/permissions";

const SUPER = new Set(["Admin", "Founder", "Overseer"]);

/** Studios the reader may open in Operations, by name. */
export function operationsStudios(
  trainer: Trainer | null | undefined,
  studios: Studio[],
  networks: FranchiseNetwork[] = [],
  isAdmin = false,
): Studio[] {
  if (!trainer) return [];
  const all = isAdmin || SUPER.has(trainer.role);
  const owner = !all && isEveryStudioRole(trainer);
  const owned = new Set(trainer.ownedStudioIds ?? []);
  for (const n of networks) {
    if (n.ownerId === trainer.id || (n.ownerIds ?? []).includes(trainer.id)) {
      for (const id of n.studioIds ?? []) owned.add(id);
    }
  }
  return studios
    .filter((s) => {
      if (!s.id) return false;
      if (all) return true;
      if (owner && (s.ownerId === trainer.id || owned.has(s.id))) return true;
      return leadsStudio(trainer, s.id);
    })
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/**
 * What the Operations scope bar offers: the studio the app is in, or every
 * studio the reader may look at. "all" only exists when there is more than
 * one to look at.
 */
export type OperationsScope = { kind: "studio"; studioId: string } | { kind: "all" };

/** The scope's studios, in reading order. */
export function studiosInScope(scope: OperationsScope, readable: Studio[], active: Studio | null): Studio[] {
  if (scope.kind === "all") return readable;
  if (active && active.id === scope.studioId) return [active];
  return readable.filter((s) => s.id === scope.studioId);
}
