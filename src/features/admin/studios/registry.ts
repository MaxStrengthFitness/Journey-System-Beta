/**
 * Studios and franchise networks — the rules, as pure functions.
 *
 * AdminStudioManager is 1,723 lines and holds all of this inline, mixed into
 * JSX, which is how three separate defects got to live in it at once:
 *
 *   1. Every studio save wrote ownerId and headTrainerId as null. The handler
 *      read them out of `FormData`, but both fields had been removed from the
 *      JSX in an earlier round, and `formData.get("ownerId")` returns null for
 *      a field that is not there. `null === "none"` is false, so the null went
 *      straight into the document. Nobody saw an error.
 *   2. Deleting a studio left its id in its network's `studioIds` array.
 *      Deleting a NETWORK correctly unlinked its studios first — the two
 *      paths disagreed — so the registry accumulated references to documents
 *      that no longer exist.
 *   3. Saving a studio silently rewrote a trainer's role to StudioOwner or
 *      HeadTrainer. Four screens can set a role; this was the only one that
 *      did it as a side effect of saving something else.
 *
 * Pulling the rules out here makes each of them a test rather than a comment.
 */

import type { FranchiseNetwork, Studio } from "../../../types";
import type { StudioMindbodyMode } from "../provisional/types";
import { canonicalMachineId } from "../../catalog/machine-identity";

/* ==================================================================== *
 * Mindbody identity
 * ==================================================================== */

const str = (v: unknown): string =>
  v === undefined || v === null ? "" : String(v).trim();

/**
 * The studio already using this site + location pair, if any.
 *
 * One Mindbody site can hold several locations, and each location is a
 * separate studio here. Two studios claiming the same location silently mix
 * their schedules together, which looks like a sync bug for weeks.
 */
export function findLocationConflict(
  siteId: string,
  locationId: string,
  studios: Studio[],
  excludeStudioId?: string | null,
): Studio | null {
  const site = str(siteId);
  const location = str(locationId);
  if (!site || !location) return null;
  return (
    studios.find(
      (s) =>
        s.id !== excludeStudioId &&
        str(s.mindbodySiteId) === site &&
        str(s.mindbodyLocationId) === location,
    ) ?? null
  );
}

export type IdentityProblem =
  | { code: "no-site"; message: string }
  | { code: "location-taken"; message: string; conflict: Studio }
  | { code: "shared-site-needs-location"; message: string; siblings: Studio[] };

/**
 * Can this site/location pair be saved?
 *
 * Returns null when it can. Used by both create and edit so the two cannot
 * drift apart — they had separate copies of these rules, with different
 * wording and one different condition.
 */
export function validateStudioIdentity(input: {
  siteId: string;
  locationId: string;
  studios: Studio[];
  excludeStudioId?: string | null;
  /**
   * "offline" is a DELIBERATE choice — a pre-launch floor, a demo area, or a
   * Mindbody account that is not provisioned yet — and such a studio needs no
   * Site ID. Requiring one unconditionally is what made an offline studio
   * impossible to create, which is the whole point of the fallback protocol.
   * A site id supplied anyway is still validated: someone who has typed one
   * has an intention worth checking.
   */
  mode?: StudioMindbodyMode;
}): IdentityProblem | null {
  const site = str(input.siteId);
  const location = str(input.locationId);
  const offline = input.mode === "offline";

  if (!site) {
    if (offline) return null;
    return {
      code: "no-site",
      message: "A Mindbody Site ID is required before this studio can sync.",
    };
  }

  const conflict = findLocationConflict(
    site,
    location,
    input.studios,
    input.excludeStudioId,
  );
  if (conflict) {
    return {
      code: "location-taken",
      message: `${conflict.name} already uses location ${location} on site ${site}. Two studios on one location mix their schedules together.`,
      conflict,
    };
  }

  const siblings = input.studios.filter(
    (s) => s.id !== input.excludeStudioId && str(s.mindbodySiteId) === site,
  );
  if (siblings.length > 0 && !location) {
    return {
      code: "shared-site-needs-location",
      message: `Site ${site} is already used by ${siblings.length} other ${
        siblings.length === 1 ? "studio" : "studios"
      }. Pick a location, or their bookings arrive as one schedule.`,
      siblings,
    };
  }

  return null;
}

export type MindbodyLinkState =
  | "linked"
  | "linked-shared"
  | "needs-location"
  | "offline"
  | "unlinked";

/**
 * What to show beside a studio in the list.
 *
 * "offline" and "unlinked" are different states and must read differently.
 * Offline is a studio someone chose to run without Mindbody; unlinked is one
 * that expects Mindbody and has not been configured. Showing both as "Not
 * linked" is how a deliberately offline demo floor ends up looking broken on
 * every screen that lists it.
 */
export function mindbodyLinkState(
  studio: Studio,
  studios: Studio[],
): MindbodyLinkState {
  if (studio.mindbodyMode === "offline") return "offline";
  const site = str(studio.mindbodySiteId);
  if (!site) return "unlinked";
  const shared = studios.some(
    (s) => s.id !== studio.id && str(s.mindbodySiteId) === site,
  );
  if (!shared) return "linked";
  return str(studio.mindbodyLocationId) ? "linked-shared" : "needs-location";
}

/* ==================================================================== *
 * Network membership
 * ==================================================================== */

export interface RegistryWrite {
  /** "networks" or "studios". */
  collection: "networks" | "studios";
  id: string;
  /** A value of null means "remove this field". */
  data: Record<string, string[] | string | null>;
}

/**
 * Linking is TWO writes that must agree: the network lists the studio, and
 * the studio names its network. Returning them as a plan rather than firing
 * them inline is what lets the delete path below reuse the same reasoning.
 */
export function linkPlan(
  network: FranchiseNetwork,
  studioId: string,
): RegistryWrite[] {
  const ids = (network.studioIds || []).filter(Boolean);
  if (ids.includes(studioId)) return [];
  return [
    { collection: "networks", id: network.id, data: { studioIds: [...ids, studioId] } },
    { collection: "studios", id: studioId, data: { networkId: network.id } },
  ];
}

export function unlinkPlan(
  network: FranchiseNetwork,
  studioId: string,
): RegistryWrite[] {
  const ids = (network.studioIds || []).filter(Boolean);
  if (!ids.includes(studioId)) return [];
  return [
    {
      collection: "networks",
      id: network.id,
      data: { studioIds: ids.filter((id) => id !== studioId) },
    },
    { collection: "studios", id: studioId, data: { networkId: null } },
  ];
}

/**
 * Everything that must change when a studio is deleted.
 *
 * THE ORPHAN FIX. The old delete removed the studio document and stopped
 * there, so its id stayed in every network that listed it — while deleting a
 * network correctly unlinked its studios first. Same registry, two paths, one
 * of them wrong.
 *
 * Returns network writes only; the caller deletes the studio document itself.
 */
export function deleteStudioPlan(
  networks: FranchiseNetwork[],
  studioId: string,
): RegistryWrite[] {
  return networks
    .filter((n) => (n.studioIds || []).includes(studioId))
    .map((n) => ({
      collection: "networks" as const,
      id: n.id,
      data: {
        studioIds: (n.studioIds || []).filter(
          (id) => !!id && id !== studioId,
        ),
      },
    }));
}

/* ==================================================================== *
 * Orphans
 * ==================================================================== */

export interface RegistryOrphans {
  /** network id -> studio ids it lists that no longer exist. */
  danglingStudioIds: { networkId: string; networkName: string; studioIds: string[] }[];
  /** Studios naming a network that no longer exists. */
  strandedStudios: { studioId: string; studioName: string; networkId: string }[];
  /** Both sides exist but only one names the other. */
  oneSidedLinks: {
    studioId: string;
    studioName: string;
    networkId: string;
    networkName: string;
    side: "network-only" | "studio-only";
  }[];
}

export function findOrphans(
  networks: FranchiseNetwork[],
  studios: Studio[],
): RegistryOrphans {
  const studioById = new Map(studios.filter((s) => s.id).map((s) => [s.id!, s]));
  const networkById = new Map(networks.map((n) => [n.id, n]));

  const danglingStudioIds: RegistryOrphans["danglingStudioIds"] = [];
  const oneSidedLinks: RegistryOrphans["oneSidedLinks"] = [];

  for (const network of networks) {
    const missing: string[] = [];
    for (const sid of network.studioIds || []) {
      if (!sid) continue;
      const studio = studioById.get(sid);
      if (!studio) {
        missing.push(sid);
        continue;
      }
      if (studio.networkId !== network.id) {
        oneSidedLinks.push({
          studioId: sid,
          studioName: studio.name,
          networkId: network.id,
          networkName: network.name,
          side: "network-only",
        });
      }
    }
    if (missing.length) {
      danglingStudioIds.push({
        networkId: network.id,
        networkName: network.name,
        studioIds: missing,
      });
    }
  }

  const strandedStudios: RegistryOrphans["strandedStudios"] = [];
  for (const studio of studios) {
    if (!studio.id || !studio.networkId) continue;
    const network = networkById.get(studio.networkId);
    if (!network) {
      strandedStudios.push({
        studioId: studio.id,
        studioName: studio.name,
        networkId: studio.networkId,
      });
      continue;
    }
    if (!(network.studioIds || []).includes(studio.id)) {
      oneSidedLinks.push({
        studioId: studio.id,
        studioName: studio.name,
        networkId: network.id,
        networkName: network.name,
        side: "studio-only",
      });
    }
  }

  return { danglingStudioIds, strandedStudios, oneSidedLinks };
}

export function hasOrphans(o: RegistryOrphans): boolean {
  return (
    o.danglingStudioIds.length > 0 ||
    o.strandedStudios.length > 0 ||
    o.oneSidedLinks.length > 0
  );
}

/**
 * How to fix what findOrphans found.
 *
 * The repair is deliberately conservative and asymmetric:
 *
 *   · A dangling id is dropped — the studio is gone, there is nothing to
 *     point at, and keeping it helps nobody.
 *   · A stranded studio has its networkId cleared for the same reason.
 *   · A one-sided link is REPAIRED TOWARD THE STUDIO, not dropped. The studio
 *     document is what every screen reads to decide which network it belongs
 *     to, so a studio saying "I am in Corporate" is the surviving intent; the
 *     network's array is a denormalised index of it.
 */
export function repairPlan(
  networks: FranchiseNetwork[],
  studios: Studio[],
): RegistryWrite[] {
  const orphans = findOrphans(networks, studios);
  const networkIds = new Map<string, string[]>();
  const studioById = new Map(studios.filter((s) => s.id).map((s) => [s.id!, s]));

  const idsFor = (networkId: string): string[] => {
    if (!networkIds.has(networkId)) {
      const n = networks.find((x) => x.id === networkId);
      networkIds.set(networkId, [...(n?.studioIds || []).filter(Boolean)]);
    }
    return networkIds.get(networkId)!;
  };

  for (const d of orphans.danglingStudioIds) {
    networkIds.set(
      d.networkId,
      idsFor(d.networkId).filter((id) => !d.studioIds.includes(id)),
    );
  }

  const writes: RegistryWrite[] = [];

  for (const s of orphans.strandedStudios) {
    writes.push({ collection: "studios", id: s.studioId, data: { networkId: null } });
  }

  for (const link of orphans.oneSidedLinks) {
    if (link.side === "network-only") {
      // The network lists a studio that says it belongs elsewhere (or
      // nowhere). The studio wins: drop it from this network's array.
      networkIds.set(
        link.networkId,
        idsFor(link.networkId).filter((id) => id !== link.studioId),
      );
    } else {
      // The studio says it belongs here and the network has not caught up.
      const ids = idsFor(link.networkId);
      if (!ids.includes(link.studioId)) ids.push(link.studioId);
    }
  }

  for (const [networkId, ids] of networkIds) {
    const original = networks.find((n) => n.id === networkId);
    const before = (original?.studioIds || []).filter(Boolean);
    if (before.length !== ids.length || before.some((id, i) => id !== ids[i])) {
      writes.push({ collection: "networks", id: networkId, data: { studioIds: ids } });
    }
  }

  // Deterministic order so a dry-run diff is stable and the same repair
  // applied twice produces the same list.
  void studioById;
  return writes.sort((a, b) =>
    `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`),
  );
}

/* ==================================================================== *
 * The standard machine set
 * ==================================================================== */

export interface SeedCandidate {
  id: string;
  name?: string;
}

export interface StandardSetSeed<T extends SeedCandidate> {
  seed: T[];
  /** canonical id -> the duplicate entries that collapsed onto it. */
  duplicates: Record<string, string[]>;
  alreadyPresent: number;
}

/**
 * Which catalog machines a new studio should start with.
 *
 * Most locations run the same twenty, so a new studio adopting them is the
 * default rather than twenty manual taps. Two rules make this safe to run
 * more than once:
 *
 *   · Anything already on the roster is skipped, so re-running adds nothing.
 *   · Entries collapsing to the same CANONICAL machine seed only once. This
 *     is the duplicate Leg Extension: "LEG EXTENSION" (m-ext, from the app's
 *     defaults) and "Seated Leg Extension" (leg_extension, from a Firestore
 *     document filed under the other id convention) are one machine. The
 *     stray document is still wrong and still wants deleting at the source —
 *     `duplicates` names it so that can happen — but no studio gets two leg
 *     extensions on its floor in the meantime.
 */
/**
 * Is this catalog machine part of the set a new studio starts with?
 *
 * ONE PREDICATE, because there were two and they disagreed. This module read
 * `inStandardSet === false` (absent means INCLUDED), while
 * StudioInventoryManager's shortcut read `c.inStandardSet && ...` (absent
 * means EXCLUDED). Catalog documents seeded before that flag existed do not
 * carry it — so the same catalog produced "every active machine" from one
 * button and "nothing at all" from the other, which is exactly the "the
 * default 20 machines fail to load" report.
 *
 * ABSENT MEANS INCLUDED is the right default: the flag was added to let a
 * studio-specific oddity be kept OUT of the baseline, so opting out should be
 * the thing you have to say.
 *
 * `status` is compared case-insensitively. Mindbody, the seed scripts and the
 * machine editor have each written a different casing over this project's
 * life, and an exact "active" match silently drops every record that says
 * "Active" — which fails CLOSED, seeding nothing and reporting success.
 */
export function isStandardSetMachine(entry: {
  inStandardSet?: boolean;
  status?: string;
}): boolean {
  if (entry.inStandardSet === false) return false;
  if (entry.status && String(entry.status).toLowerCase() !== "active") {
    return false;
  }
  return true;
}

export function standardSetSeed<T extends SeedCandidate & { inStandardSet?: boolean; status?: string }>(
  catalog: T[],
  rosteredIds: Iterable<string>,
): StandardSetSeed<T> {
  const rostered = new Set<string>();
  for (const id of rosteredIds) rostered.add(canonicalMachineId(id));

  const seed: T[] = [];
  const seen = new Map<string, string>();
  const duplicates: Record<string, string[]> = {};
  let alreadyPresent = 0;

  for (const entry of catalog) {
    if (!isStandardSetMachine(entry)) continue;

    const canonical = canonicalMachineId(entry.id, entry.name);
    if (rostered.has(canonical)) {
      alreadyPresent += 1;
      continue;
    }
    const winner = seen.get(canonical);
    if (winner) {
      (duplicates[winner] ??= []).push(entry.id);
      continue;
    }
    seen.set(canonical, entry.id);
    seed.push(entry);
  }

  return { seed, duplicates, alreadyPresent };
}
