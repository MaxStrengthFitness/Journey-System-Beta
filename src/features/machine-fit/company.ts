/**
 * MACHINE FIT — the company tier, built. The pure half of the weekly job's
 * machine-fit step (server/machine-fit-company.ts does the reading and the
 * writing; server/machine-trends-job.ts calls it).
 *
 * From every studio's index and the client records it makes, per machine:
 *
 *   block    → machineTrends/{machineId}.fit      ANY SIGNED-IN TRAINER
 *              Anonymous cells, height × gender → set-up → count. What the
 *              Setup screen falls back on when a studio is too new to speak
 *              for itself. Never a client, never a studio.
 *
 *   report   → kaizenReports/{machineId}          ADMINISTRATORS ONLY
 *              The Kaizen report (kaizen.ts) over every studio: by height, by
 *              setting, what follows what, whole set-ups, and per studio how
 *              many clients sit somewhere unusual. Counts and averages over a
 *              named minimum; it names studios, never people.
 *
 * A ROW COUNTS ONCE, AT HER HOME STUDIO. A client who moved studios leaves a
 * stale row behind until the index is next rebuilt; each studio's rows are
 * therefore joined to THAT studio's clients only, exactly as the app does it
 * (the roster in memory is the home studio's), so nobody is counted twice.
 */

import {
  buildCompanyBlock,
  samplesFromFitDoc,
  subjectsFromFitDoc,
  type CompanyFitBlock,
  type FitAuditSubject,
  type FitClientRecord,
  type MachineFitDoc,
} from "./fit-index.ts";
import { buildKaizen, type KaizenReport, type KaizenSample } from "./kaizen.ts";
import type { FitSample } from "./types.ts";

export interface CompanyClientRecord extends FitClientRecord {
  homeStudioId?: string | null;
}

export interface StudioFitDocs {
  studioId: string;
  docs: readonly Pick<MachineFitDoc, "machineId" | "rows">[];
}

/** kaizenReports/_summary: every machine on one read, so the screen lists them without opening each. */
export interface KaizenSummary {
  builtAt: string;
  studios: number;
  machines: Record<string, { onFile: number; clients: number; studios: number; checked: number; unusual: number }>;
}

export interface CompanyBuild {
  blocks: Record<string, CompanyFitBlock>;
  reports: Record<string, KaizenReport & { builtAt: string }>;
  summary: KaizenSummary;
  /** Rows left out because the client is not (or is no longer) at that studio. */
  rowsSkipped: number;
}

export function buildCompany(
  studios: readonly StudioFitDocs[],
  clients: Iterable<CompanyClientRecord & { id: string }>,
  now: Date,
): CompanyBuild {
  const builtAt = now.toISOString();

  const byStudio = new Map<string, Map<string, FitClientRecord>>();
  for (const c of clients) {
    if (!c.id || !c.homeStudioId) continue;
    let roster = byStudio.get(c.homeStudioId);
    if (!roster) byStudio.set(c.homeStudioId, (roster = new Map()));
    roster.set(c.id, c);
  }

  const samplesOf = new Map<string, Map<string, FitSample[]>>(); // machineId → studioId → samples
  const subjectsOf = new Map<string, FitAuditSubject[]>();
  let rowsSkipped = 0;
  const contributing = new Set<string>();

  for (const studio of studios) {
    const roster = byStudio.get(studio.studioId) ?? new Map<string, FitClientRecord>();
    for (const doc of studio.docs) {
      if (!doc?.machineId || !doc.rows) continue;
      const withStudio = { ...doc, studioId: studio.studioId };
      const subjects = subjectsFromFitDoc(withStudio, roster, now);
      const samples = samplesFromFitDoc(withStudio, roster, now);
      rowsSkipped += Object.keys(doc.rows).length - subjects.length;
      if (subjects.length === 0) continue;
      contributing.add(studio.studioId);
      let perStudio = samplesOf.get(doc.machineId);
      if (!perStudio) samplesOf.set(doc.machineId, (perStudio = new Map()));
      perStudio.set(studio.studioId, [...(perStudio.get(studio.studioId) ?? []), ...samples]);
      subjectsOf.set(doc.machineId, [...(subjectsOf.get(doc.machineId) ?? []), ...subjects]);
    }
  }

  const blocks: CompanyBuild["blocks"] = {};
  const reports: CompanyBuild["reports"] = {};
  const summary: KaizenSummary = { builtAt, studios: contributing.size, machines: {} };

  for (const machineId of [...subjectsOf.keys()].sort()) {
    const perStudio = samplesOf.get(machineId) ?? new Map<string, FitSample[]>();
    const block = buildCompanyBlock(perStudio, builtAt);
    if (block.clients > 0) blocks[machineId] = block;

    const samples: KaizenSample[] = [];
    for (const [studioId, list] of perStudio) for (const s of list) samples.push({ ...s, studioId });
    // `findings` names clients and is dropped here, on purpose: nothing with a
    // client id in it is ever written by this job.
    const { report } = buildKaizen({ machineId, samples, subjects: subjectsOf.get(machineId) ?? [] });
    reports[machineId] = { ...report, builtAt };
    summary.machines[machineId] = {
      onFile: report.onFile,
      clients: report.clients,
      studios: report.studios,
      checked: report.checked,
      unusual: report.unusual,
    };
  }

  return { blocks, reports, summary, rowsSkipped };
}
