/**
 * The weekly job's machine-fit step: the reading half. The thinking is
 * src/features/machine-fit/company.ts (pure, tested); the writing stays in
 * server/machine-trends-job.ts, which owns the machineTrends documents.
 *
 * ONE STUDIO AT A TIME (job memory, Oct 1 2026). For each studio, by name:
 * its machineFit collection (one document per machine, a few dozen), then the
 * client records its rows name, by id, with only the fields machine fit reads
 * - and only those whose home is this studio count, because a row counts
 * once, at her home studio. They go to the company accumulator and are let go
 * before the next studio. Until Oct 1 the job read every client in the company
 * first, machine stats and InBody summary included, and held them all.
 *
 * Studio by studio, by name — never a collection-group sweep: the studio a
 * row belongs to is part of what the row means, and it comes from the path.
 * No query on clients: they are read by id (`getAll`), so no index is asked
 * for and a client who isn't on any studio's index is never read.
 */

import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { createCompanyAccumulator, type CompanyBuild, type CompanyClientRecord } from "../src/features/machine-fit/company.ts";
import type { FitClientRecord, FitRowDoc } from "../src/features/machine-fit/fit-index.ts";
import { isDemoStudioId } from "../src/features/demo-mode/is-demo.ts";
import { withMachineTotalsRead } from "./machine-totals-read.ts";

/** The client fields machine fit reads (factorsOf, verifiedSettings) and the home it counts at. */
export const FIT_CLIENT_FIELDS = ["homeStudioId", "height", "gender", "wingspan", "weight", "dateOfBirth", "age", "inbodySummary", "machineStats"] as const;

/** A client document as machine fit reads it. */
export function fitClientRecord(id: string, c: DocumentData): CompanyClientRecord & { id: string } {
  return {
    id,
    height: typeof c.height === "string" ? c.height : null,
    homeStudioId: typeof c.homeStudioId === "string" ? c.homeStudioId : null,
    gender: typeof c.gender === "string" ? c.gender : null,
    wingspan: typeof c.wingspan === "string" ? c.wingspan : null,
    weight: typeof c.weight === "string" || typeof c.weight === "number" ? c.weight : null,
    dateOfBirth: typeof c.dateOfBirth === "string" ? c.dateOfBirth : null,
    age: typeof c.age === "number" ? c.age : null,
    inbodySummary: (c.inbodySummary as CompanyClientRecord["inbodySummary"]) ?? null,
    machineStats: (c.machineStats as CompanyClientRecord["machineStats"]) ?? null,
  };
}

/** A map key that can't be a document id can't be a client on file, so it is never looked up. */
const canBeDocId = (id: string): boolean => id.length > 0 && !id.includes("/") && id !== "." && id !== ".." && !/^__.*__$/.test(id);

const GET_ALL_CHUNK = 100;

/**
 * The company tier, built one studio at a time. Throws when any read fails:
 * the job then keeps last week's blocks and leaves the reports alone.
 * `afterStudio` is told when each studio is done (the job logs its memory).
 */
export async function buildCompanyFit(
  db: Firestore,
  now: Date,
  log: (line: string) => void,
  afterStudio?: (studioId: string) => void,
): Promise<CompanyBuild> {
  const studiosSnap = await db.collection("studios").select().get();
  const acc = createCompanyAccumulator(now);
  let documents = 0;
  let withIndex = 0;
  let clientsRead = 0;
  for (const studio of studiosSnap.docs) {
    const snap = await db.collection("studios").doc(studio.id).collection("machineFit").get();
    if (snap.empty) continue;
    documents += snap.size;
    withIndex += 1;
    const docs = snap.docs.map((d) => ({
      machineId: d.id,
      rows: ((d.data() as { rows?: Record<string, FitRowDoc> }).rows ?? {}) as Record<string, FitRowDoc>,
    }));

    // The Demo studio is skipped whole by the build; its clients aren't read.
    const roster = new Map<string, FitClientRecord>();
    if (!isDemoStudioId(studio.id)) {
      const ids = new Set<string>();
      for (const d of docs) for (const id of Object.keys(d.rows)) if (canBeDocId(id)) ids.add(id);
      const all = [...ids];
      for (let at = 0; at < all.length; at += GET_ALL_CHUNK) {
        const refs = all.slice(at, at + GET_ALL_CHUNK).map((id) => db.collection("clients").doc(id));
        const got = await db.getAll(...refs, { fieldMask: [...FIT_CLIENT_FIELDS] });
        const found = got.filter((d) => d.exists).map((d) => ({ ...(d.data() ?? {}), id: d.id }));
        clientsRead += found.length;
        // machineStats lives beside the client since the iPad round
        // (server/machine-totals-read.ts): folded in, only that field.
        for (const c of await withMachineTotalsRead(db, found, { fieldMask: ["machineStats"] })) {
          const record = fitClientRecord(c.id, c);
          if (record.homeStudioId === studio.id) roster.set(c.id, record);
        }
      }
    }
    acc.addStudio({ studioId: studio.id, docs }, roster);
    afterStudio?.(studio.id);
  }
  log(
    `Machine fit: ${documents} index documents across ${withIndex} of ${studiosSnap.size} studios, ` +
      `and the ${clientsRead} client records they name, read a studio at a time.`,
  );
  return acc.result();
}
