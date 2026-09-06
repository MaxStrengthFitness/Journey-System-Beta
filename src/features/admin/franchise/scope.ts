/**
 * WHICH STUDIOS AND PEOPLE A FRANCHISE OWNER IS LOOKING AT.
 *
 * Round: Admin Overhaul, Round 2 Phase 4 (Section 15).
 *
 * THE BUG THIS EXTRACTS AND FIXES
 * -------------------------------
 * The scope was computed inline in FranchiseDashboardView, and the network
 * selection was seeded once:
 *
 *   const [selectedNetworkId, setSelectedNetworkId] =
 *     useState(displayNetworks[0]?.id || null);
 *
 * `networks` arrives from a Firestore listener, so on the first render that
 * array is EMPTY and the initial value is null. useState ignores every later
 * argument, so it stayed null. A super admin could recover by using the
 * picker; an ordinary franchise owner had no picker - it was rendered behind
 * `isSuperAdmin` - so for an owner whose studios are reached through network
 * membership rather than `ownerId`, the whole screen stayed empty. Forever.
 *
 * Resolving the selection as a DERIVED value rather than seeded state removes
 * the class of bug rather than the instance: `resolveScope` is handed the
 * current networks and the current preference every render, and falls back to
 * the first available network whenever the preference names one that is not
 * there - which covers the empty first render, a network being deleted, and
 * an owner losing access to one.
 *
 * WHY OWNERSHIP IS A UNION OF THREE THINGS
 * ----------------------------------------
 * A studio can reach an owner by `studio.ownerId`, by
 * `trainer.ownedStudioIds`, or by sitting in a network they own. All three
 * are in use, none is authoritative, and dropping any one of them hides real
 * studios from the person responsible for them. So the union is the answer,
 * and it is written down here once instead of being re-derived per screen.
 */

import type { FranchiseNetwork, Studio, Trainer } from "../../../types";

const SUPER_ROLES = new Set(["Founder", "Admin", "Overseer"]);

export function isSuperAdminRole(role: string | undefined): boolean {
  return SUPER_ROLES.has(role ?? "");
}

/** Networks this person may look at. A super admin may look at all of them. */
export function visibleNetworks(
  networks: FranchiseNetwork[],
  viewer: Pick<Trainer, "id" | "role">,
): FranchiseNetwork[] {
  if (isSuperAdminRole(viewer.role)) return networks;
  return networks.filter(
    (n) => (n.ownerIds ?? []).includes(viewer.id) || n.ownerId === viewer.id,
  );
}

export interface OwnerScope {
  /** Networks the picker may offer. */
  networks: FranchiseNetwork[];
  /** The one in view. Null only when there are none at all. */
  activeNetworkId: string | null;
  activeNetwork: FranchiseNetwork | null;
  /** Every studio this person is responsible for, in name order. */
  studios: Studio[];
  studioIds: string[];
  /** Everyone standing in one of those studios, in name order. */
  staff: Trainer[];
}

export interface ScopeInput {
  viewer: Trainer;
  studios: Studio[];
  trainers: Trainer[];
  networks: FranchiseNetwork[];
  /** What the picker last selected. Ignored when it names nothing available. */
  preferredNetworkId?: string | null;
}

/** Whether this trainer stands in any of the given studios. */
export function trainerIsIn(trainer: Trainer, studioIds: string[]): boolean {
  if (studioIds.length === 0) return false;
  const set = new Set(studioIds);
  if (trainer.primaryHomeStudioId && set.has(trainer.primaryHomeStudioId)) {
    return true;
  }
  return (
    (trainer.accessibleStudioIds ?? []).some((id) => set.has(id)) ||
    (trainer.activeGuestStudioIds ?? []).some((id) => set.has(id))
  );
}

export function resolveScope(input: ScopeInput): OwnerScope {
  const { viewer, studios, trainers, networks, preferredNetworkId } = input;
  const mine = visibleNetworks(networks, viewer);

  /**
   * The preference wins only if it still names something available. This is
   * the fix for the seeded-state bug in the header: on the render where the
   * networks finally arrive, a stale null falls through to the first one.
   */
  const activeNetwork =
    mine.find((n) => n.id === preferredNetworkId) ?? mine[0] ?? null;
  const networkStudioIds = new Set(activeNetwork?.studioIds ?? []);

  const superAdmin = isSuperAdminRole(viewer.role);
  const owned = new Set(viewer.ownedStudioIds ?? []);

  /**
   * A super admin viewing a network sees exactly that network. Anyone else
   * sees the union of the three ways a studio can reach them - see the
   * header. Filtering a super admin down to the network is deliberate: they
   * came here to look at ONE franchise, and folding in every studio they
   * happen to own would make the picker do nothing.
   */
  const inScope = studios.filter((s) => {
    const id = s.id ?? "";
    if (!id) return false;
    if (superAdmin) return networkStudioIds.has(id);
    return s.ownerId === viewer.id || owned.has(id) || networkStudioIds.has(id);
  });

  const byName = <T extends { name?: string; fullName?: string }>(a: T, b: T) =>
    (a.name ?? a.fullName ?? "").localeCompare(b.name ?? b.fullName ?? "");

  const scoped = [...inScope].sort(byName);
  const studioIds = scoped.map((s) => s.id as string);

  return {
    networks: mine,
    activeNetworkId: activeNetwork?.id ?? null,
    activeNetwork,
    studios: scoped,
    studioIds,
    staff: trainers.filter((t) => trainerIsIn(t, studioIds)).sort(byName),
  };
}

/* ------------------------------------------------------------------ *
 * WHAT NEEDS THE OWNER TODAY
 * ------------------------------------------------------------------ */

export interface AttentionCounts {
  /** Signed in, no role assigned yet: waiting for someone to let them in. */
  awaitingApproval: number;
  /** Profiles an admin created that nobody has signed in to claim. */
  unclaimed: number;
  /** Temporary records with no Mindbody counterpart yet. */
  provisional: number;
  /** Staff with no Mindbody staff id, so the schedule cannot attribute them. */
  unlinkedStaff: number;
}

/**
 * Counted from the scoped staff, not the whole platform.
 *
 * "Awaiting approval" is the Round 1 model: signing in creates a trainer
 * document at the auth uid with no role, and a head trainer or above assigns
 * one. A document with no role is therefore a person standing in the doorway,
 * and it is the single most time-sensitive number on this screen.
 */
export function attentionCounts(staff: Trainer[]): AttentionCounts {
  return {
    awaitingApproval: staff.filter((t) => !t.role && !t.pendingClaim).length,
    unclaimed: staff.filter((t) => t.pendingClaim === true).length,
    provisional: staff.filter((t) => t.provisional === true).length,
    unlinkedStaff: staff.filter(
      (t) => Boolean(t.role) && !t.pendingClaim && !t.mindbodyStaffId,
    ).length,
  };
}

/** Trainers per studio, counted the same way `resolveScope` scopes them. */
export function staffCountByStudio(
  staff: Trainer[],
  studioIds: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of studioIds) {
    out[id] = staff.filter((t) => trainerIsIn(t, [id])).length;
  }
  return out;
}
