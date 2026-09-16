/**
 * The Programming tab's "total transparency" numbers (client-profile audit,
 * Sep 2026): how much of the studio's floor this client has actually used,
 * and how many prescribed machines carry a clinical watch-out.
 *
 * Read from the lifetime rollup (client.machineStats) the profile already
 * holds — no history read. The rollup is only the whole story once the
 * one-time backfill has run (`machineStatsBackfilledAt`, the same test
 * useMachineStats uses): before that it holds only the sessions saved since
 * the running total existed, so "3 of 40 performed" for a two-year client
 * would be a confident wrong number. Until then the count is UNKNOWN (null).
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
  const known = !!client?.machineStatsBackfilledAt;
  if (!known) return { total, performed: null, neverTried: null };
  const performed = ids.filter((id) => (Number(stats?.[id]?.timesPerformed) || 0) > 0).length;
  return { total, performed, neverTried: total - performed };
}
