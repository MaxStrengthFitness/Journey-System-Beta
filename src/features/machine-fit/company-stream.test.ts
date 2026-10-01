/**
 * The company tier built a studio at a time (job memory, Oct 1 2026) against
 * the version that took every client in the company at once.
 * `referenceCompany` below is `buildCompany` exactly as it was before the
 * accumulator, kept verbatim. The weekly job now hands each studio's index
 * over with that studio's own clients only (those whose home it is), then lets
 * them go; this holds that the blocks, the administrators' reports and the
 * summary come out the same, byte for byte, including a client who moved
 * studios (her old studio's row is skipped), a client with no home, a row for
 * someone not on file, the Demo studio, and a machine no one is set up on.
 */
import { describe, expect, it } from "vitest";
import { buildCompany, createCompanyAccumulator, type CompanyBuild, type CompanyClientRecord, type KaizenSummary, type StudioFitDocs } from "./company";
import { buildCompanyBlock, samplesFromFitDoc, subjectsFromFitDoc, type FitAuditSubject, type FitClientRecord, type FitRowDoc } from "./fit-index";
import { buildKaizen, type KaizenSample } from "./kaizen";
import { isDemoStudioId } from "../demo-mode/is-demo";
import type { FitSample } from "./types";

/* ---------------- the version that took every client at once, verbatim ---------------- */

function referenceCompany(studios: readonly StudioFitDocs[], clients: Iterable<CompanyClientRecord & { id: string }>, now: Date): CompanyBuild {
  const builtAt = now.toISOString();

  const byStudio = new Map<string, Map<string, FitClientRecord>>();
  for (const c of clients) {
    if (!c.id || !c.homeStudioId) continue;
    let roster = byStudio.get(c.homeStudioId);
    if (!roster) byStudio.set(c.homeStudioId, (roster = new Map()));
    roster.set(c.id, c);
  }

  const samplesOf = new Map<string, Map<string, FitSample[]>>();
  const subjectsOf = new Map<string, FitAuditSubject[]>();
  let rowsSkipped = 0;
  const contributing = new Set<string>();

  for (const studio of studios) {
    if (isDemoStudioId(studio.studioId)) continue;
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
  let heldBack = 0;
  const reports: CompanyBuild["reports"] = {};
  const summary: KaizenSummary = { builtAt, studios: contributing.size, machines: {} };

  for (const machineId of [...subjectsOf.keys()].sort()) {
    const perStudio = samplesOf.get(machineId) ?? new Map<string, FitSample[]>();
    const block = buildCompanyBlock(perStudio, builtAt);
    heldBack += block.heldBack ?? 0;
    if (block.clients > 0) blocks[machineId] = block;

    const samples: KaizenSample[] = [];
    for (const [studioId, list] of perStudio) for (const s of list) samples.push({ ...s, studioId });
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

  return { blocks, reports, summary, rowsSkipped, heldBack };
}

/* ---------------- a seeded company ---------------- */

function seeded(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)];
  return { next, pick, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)) };
}

const NOW = new Date("2026-09-20T07:00:00.000Z");
const T = Date.UTC(2026, 8, 1, 16, 0, 0);
const STUDIOS = ["demo-studio", "solon", "strongsville", "westlake", "willoughby"];

function company(seed: number) {
  const r = seeded(seed);
  const clients: (CompanyClientRecord & { id: string })[] = [];
  for (let i = 0; i < 400; i += 1) {
    clients.push({
      id: `c${i}`,
      homeStudioId: r.next() < 0.05 ? null : r.pick(STUDIOS),
      height: r.pick(["5'4\"", "5'4\"", "5'10\"", "5'10\"", "6'1\"", "5' 6", "", null]),
      gender: r.pick(["Female", "Male", "female", null]),
      wingspan: r.pick([null, "70", "5'9\""]),
      weight: r.pick([null, 150, "180", "200 lb"]),
      dateOfBirth: r.pick([null, "1960-05-01", "1985-12-31"]),
      age: r.pick([null, 44, 71]),
      inbodySummary: null,
      machineStats: r.next() < 0.5 ? { "m-leg-press": { lastPerformedDate: r.pick(["2026-09-10", "2026-08-01", null]) } } : null,
    });
  }
  const studios: StudioFitDocs[] = STUDIOS.map((studioId) => ({
    studioId,
    docs: ["m-abs", "m-leg-press", "m-row", "m-empty"].map((machineId) => {
      const rows: Record<string, FitRowDoc> = {};
      if (machineId !== "m-empty") {
        for (let n = 0; n < 120; n += 1) {
          const id = r.next() < 0.05 ? `nobody${n}` : `c${r.int(0, 399)}`;
          rows[id] = {
            s: r.next() < 0.03 ? {} : { seat: String(r.int(3, 6)), gap: r.pick(["0", "1"]) },
            t: T + r.int(0, 10) * 86_400_000,
            ...(r.next() < 0.2 ? { src: { seat: "suggested" } } : {}),
            ...(r.next() < 0.1 ? { a: { seat: r.pick(["5", "6"]) } } : {}),
          } as FitRowDoc;
        }
      }
      return { machineId, rows };
    }),
  }));
  return { clients, studios };
}

const json = (b: CompanyBuild) => JSON.stringify(b);

describe("the company tier, a studio at a time, gives exactly what the all-at-once version gave", () => {
  for (const seed of [5, 17, 2026]) {
    it(`seed ${seed}`, () => {
      const { clients, studios } = company(seed);
      const reference = referenceCompany(studios, clients, NOW);
      expect(Object.keys(reference.blocks).length).toBeGreaterThan(0);
      expect(reference.rowsSkipped).toBeGreaterThan(0);

      expect(json(buildCompany(studios, clients, NOW))).toBe(json(reference));

      // The weekly job's way: each studio with only the clients whose home it is, in the studios' order.
      const acc = createCompanyAccumulator(NOW);
      for (const studio of studios) {
        const roster = new Map(clients.filter((c) => c.homeStudioId === studio.studioId).map((c) => [c.id, c as FitClientRecord] as const));
        acc.addStudio(studio, roster);
      }
      expect(json(acc.result())).toBe(json(reference));
    });
  }
});
