/**
 * The Programming tab's "total transparency" numbers (client-profile audit,
 * Sep 2026): how much of the studio's floor this client has actually used,
 * and how many prescribed machines carry a clinical watch-out.
 *
 * Read from the lifetime rollup (client.machineStats) the profile already
 * holds — no history read. A client whose rollup has not been backfilled yet
 * has no stats at all, and then the count is UNKNOWN (null), not zero.
 */

import type { Client, Machine } from "../../types";

export interface RosterCoverage {
  total: number;
  /** Roster machines performed at least once, or null when the rollup is missing. */
  performed: number | null;
  /** Roster machines never performed, or null when unknown. */
  neverTried: number | null;
}

export function rosterCoverage(
  machines: ReadonlyArray<Pick<Machine, "id">>,
  client: Pick<Client, "machineStats" | "machineStatsBackfilledAt"> | null | undefined,
): RosterCoverage {
  const ids = machines.map((m) => m.id).filter((id): id is string => !!id);
  const total = ids.length;
  const stats = client?.machineStats;
  const known = !!stats && (Object.keys(stats).length > 0 || !!client?.machineStatsBackfilledAt);
  if (!known) return { total, performed: null, neverTried: null };
  const performed = ids.filter((id) => (Number(stats?.[id]?.timesPerformed) || 0) > 0).length;
  return { total, performed, neverTried: total - performed };
}
