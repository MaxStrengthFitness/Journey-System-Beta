/**
 * The Programming tab's "total transparency" numbers (client-profile audit,
 * Sep 2026): how much of the studio's floor this client has actually used,
 * and how many prescribed machines carry a clinical watch-out.
 *
 * Read from the lifetime rollup (client.machineStats) the profile already
 * holds — no history read.
 *
 * WHAT CHANGED (fluidity round, Sep 2026). The gate used to be
 * `machineStatsBackfilledAt`, a marker written only when somebody opened the
 * Equipment tab — so a client with eighty sessions read "40 on roster" and
 * every routine row showed 0x, with the real numbers sitting on the document
 * the whole time. The gate is now the client's HISTORY COVERAGE
 * (`lib/prior-history.ts`), which is the question that was always being asked:
 *
 *   complete  — Journey holds their whole story. Quote the number, and a
 *               machine they have not used is "never attempted".
 *   partial   — they trained before their studio moved onto Journey. The count
 *               here is not their lifetime, so it is not quoted, and a machine
 *               with no rows is "nothing recorded", never "never attempted":
 *               machine-level history is not coming across from FileMaker.
 *   unknown   — nobody has said. Identical to partial on screen, because
 *               during the migration it usually IS partial.
 */

import { canQuoteLifetime, type HistoryCoverage } from "../../lib/prior-history";
import type { Client, Machine } from "../../types";

export interface RosterCoverage {
  total: number;
  /** Roster machines performed at least once — null when it must not be quoted. */
  performed: number | null;
  /** Roster machines with nothing recorded, or null when unknown. */
  neverTried: number | null;
  /** How much of this client's story Journey holds — picks the wording. */
  coverage: HistoryCoverage;
}

export function rosterCoverage(
  machines: ReadonlyArray<Pick<Machine, "id">>,
  client: Pick<Client, "machineStats"> | null | undefined,
  coverage: HistoryCoverage = "unknown",
): RosterCoverage {
  const ids = machines.map((m) => m.id).filter((id): id is string => !!id);
  const total = ids.length;
  if (!canQuoteLifetime(coverage)) {
    return { total, performed: null, neverTried: null, coverage };
  }
  const stats = client?.machineStats;
  const performed = ids.filter((id) => (Number(stats?.[id]?.timesPerformed) || 0) > 0).length;
  return { total, performed, neverTried: total - performed, coverage };
}
