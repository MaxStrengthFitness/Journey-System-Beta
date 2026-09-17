/**
 * MACHINE FIT — rebuilding the studio index from the record.
 *
 * The index (studios/{s}/machineFit) is a COPY of what clientMachineSettings
 * already says, kept current as settings are saved. A copy can drift: the
 * legacy chart importer and the old full-screen grid write settings without
 * touching it, a trainer covering at another studio may be refused the index
 * write, and everything saved before this round predates it. This is the
 * pure half of scripts/rebuild-machine-fit.ts, which rebuilds every studio's
 * index whole. Run it once after deploying, and again whenever in doubt.
 */

import { toFitRow, type FitRowDoc } from "./fit-index.ts";
import type { SettingSource } from "./types.ts";

export interface SettingsDocInput {
  clientId?: string | null;
  machineId?: string | null;
  settings?: Record<string, unknown> | null;
  sources?: Record<string, SettingSource | undefined> | null;
  /** The "right for this client" reviews on the document; the ones that still apply ride along on the row. */
  fitAcks?: Record<string, { value?: unknown } | undefined> | null;
  /** ms since epoch; 0 when the document never recorded it. */
  updatedAtMs: number;
}

export interface RebuildPlan {
  /** studioId → machineId → rows. */
  studios: Map<string, Map<string, Record<string, FitRowDoc>>>;
  rows: number;
  /** Settings documents whose client has no home studio, or is not a client any more. */
  noStudio: number;
  /** Documents with no client id, no machine id, or nothing usable set. */
  empty: number;
}

export function planRebuild(
  docs: Iterable<SettingsDocInput>,
  homeStudioOf: ReadonlyMap<string, string | null | undefined>,
): RebuildPlan {
  const studios: RebuildPlan["studios"] = new Map();
  let rows = 0;
  let noStudio = 0;
  let empty = 0;

  for (const d of docs) {
    if (!d.clientId || !d.machineId) {
      empty += 1;
      continue;
    }
    const row = toFitRow(d.settings ?? null, d.sources ?? null, d.updatedAtMs, d.fitAcks ?? null);
    if (!row) {
      empty += 1;
      continue;
    }
    const studioId = homeStudioOf.get(d.clientId);
    if (!studioId) {
      noStudio += 1;
      continue;
    }
    let machines = studios.get(studioId);
    if (!machines) studios.set(studioId, (machines = new Map()));
    let machineRows = machines.get(d.machineId);
    if (!machineRows) machines.set(d.machineId, (machineRows = {}));
    // Two documents for one client and machine exist in production (a
    // composite id and an older random one): the newer save wins.
    const existing = machineRows[d.clientId];
    if (!existing) rows += 1;
    if (!existing || row.t >= existing.t) machineRows[d.clientId] = row;
  }

  return { studios, rows, noStudio, empty };
}
