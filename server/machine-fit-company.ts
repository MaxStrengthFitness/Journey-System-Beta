/**
 * The weekly job's machine-fit step: the reading half. The thinking is
 * src/features/machine-fit/company.ts (pure, tested); the writing stays in
 * server/machine-trends-job.ts, which owns the machineTrends documents.
 *
 * READS PER RUN: the studio list (ids only) and every studio's machineFit
 * collection — one document per machine per studio, so a few dozen per
 * studio. The client records are the ones the trends job has already read;
 * nothing is read twice.
 *
 * Studio by studio, by name — never a collection-group sweep: the studio a
 * row belongs to is part of what the row means, and it comes from the path.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { StudioFitDocs } from "../src/features/machine-fit/company.ts";
import type { FitRowDoc } from "../src/features/machine-fit/fit-index.ts";

export async function readStudioFitDocs(
  db: Firestore,
  log: (line: string) => void,
): Promise<StudioFitDocs[]> {
  const studiosSnap = await db.collection("studios").select().get();
  const out: StudioFitDocs[] = [];
  let documents = 0;
  for (const studio of studiosSnap.docs) {
    const snap = await db.collection("studios").doc(studio.id).collection("machineFit").get();
    if (snap.empty) continue;
    documents += snap.size;
    out.push({
      studioId: studio.id,
      docs: snap.docs.map((d) => ({
        machineId: d.id,
        rows: ((d.data() as { rows?: Record<string, FitRowDoc> }).rows ?? {}) as Record<string, FitRowDoc>,
      })),
    });
  }
  log(`Machine fit: ${documents} index documents across ${out.length} of ${studiosSnap.size} studios.`);
  return out;
}
