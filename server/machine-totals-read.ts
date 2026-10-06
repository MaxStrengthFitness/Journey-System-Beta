/**
 * The jobs' read of clients' machine totals (the iPad round, Oct 6 2026;
 * src/features/machine-totals). currentMachineMetrics, machineStats and the
 * backfill's marker moved off clients/{id} into clients/{id}/machineTotals/
 * current, so a job that reads clients and needs them (the nightly renewal
 * snapshot's strength proof, the weekly machine-fit step's "performed since")
 * reads the totals documents beside the clients it already has, by id
 * (`getAll`: no query, no index), and folds them in with the app's one rule.
 * A client with no totals document keeps what its own document holds, which
 * before the migration is all of it.
 *
 * A failed read throws, as a failed client read does: the job's own handling
 * then applies (the renewals job keeps last night's snapshots for that
 * studio; the weekly job keeps last week's blocks). Never "no totals".
 */
import type { Firestore } from "firebase-admin/firestore";
import { machineTotalsPath, mergeMachineTotals } from "../src/features/machine-totals/totals.ts";

const GET_ALL_CHUNK = 100;

/** Each client with its machine totals folded in, in the order given. */
export async function withMachineTotalsRead<C extends { id?: string | null }>(
  db: Firestore,
  clients: readonly C[],
  options: { fieldMask?: string[] } = {},
): Promise<C[]> {
  const ids = clients.map((c) => c.id).filter((id): id is string => typeof id === "string" && id.length > 0);
  const totals = new Map<string, Record<string, unknown>>();
  for (let at = 0; at < ids.length; at += GET_ALL_CHUNK) {
    const part = ids.slice(at, at + GET_ALL_CHUNK);
    const refs = part.map((id) => db.doc(machineTotalsPath(id).join("/")));
    const got = options.fieldMask ? await db.getAll(...refs, { fieldMask: options.fieldMask }) : await db.getAll(...refs);
    // getAll answers in the order it was asked.
    got.forEach((d, i) => {
      if (d.exists) totals.set(part[i], d.data() ?? {});
    });
  }
  return clients.map((c) => {
    const t = c.id ? totals.get(c.id) : undefined;
    return t ? ({ ...c, ...mergeMachineTotals(c as Record<string, unknown>, t) } as C) : c;
  });
}
