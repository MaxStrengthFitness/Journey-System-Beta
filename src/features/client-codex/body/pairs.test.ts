import { describe, expect, it } from "vitest";
import type { Client } from "../../../types";
import { DEFAULT_INBODY_VARIATION, normalizeInBodyVariation } from "../../inbody/variation";
import { scanFromDoc } from "../../inbody/scans";
import type { InBodyScan } from "../../inbody/types";
import { historyFromDocs } from "../../subjective-report/assessment-history";
import { emptyAssessment } from "../../subjective-report/scoring";
import type { PainPoint, SubjectiveAssessment } from "../../subjective-report/types";
import type { RenewalSnapshot } from "../../renewals/types";
import { pronounsOf } from "../kit/pronouns";
import { latestPain, latestPulseReadings, type PulseSource } from "./pulse-read";
import type { ProgressReportsStatus } from "../../client-profile/client-answer";
import { NOT_ASKED_YET, PULSE_UNKNOWN, measuredToldPairs, strengthMeasured, toldMissingLine } from "./pairs";

const NOW = new Date(2027, 2, 24, 12);
const her = pronounsOf({ gender: "Female" });

const scan = (id: string, testedAt: string, muscle: number): InBodyScan =>
  scanFromDoc(id, { testedAt, weightLb: 142, skeletalMuscleMassLb: muscle, bodyFatMassLb: 48, percentBodyFat: 34 })!;

const inbody = (scans: InBodyScan[]) => ({ scans, loading: false, error: null });

const assessment = (over: Partial<SubjectiveAssessment>): SubjectiveAssessment => ({
  ...emptyAssessment({ bodyWeightLbs: null }),
  scaleVersion: 2,
  ...over,
});

const round = (id: string, date: string, a: Partial<SubjectiveAssessment>) => ({
  id,
  date,
  status: "Finalized",
  subjective: assessment(a),
  createdAt: `${date}T15:00:00Z`,
});

const knee = (severity: number): PainPoint => ({
  id: "k",
  region: "knee",
  side: "right",
  type: "joint",
  severity,
  frequency: "occasional",
  aggravatingMachineIds: [],
  linkedJournalEntryIds: [],
  status: "active",
});

const pulse = (...docs: ReturnType<typeof round>[]): PulseSource => ({
  draft: null,
  history: historyFromDocs(docs, 50),
});

describe("Strength, measured", () => {
  const base = {
    client: {} as Client,
    variation: DEFAULT_INBODY_VARIATION,
    variationOwner: null,
    pronouns: her,
    now: NOW,
  };

  it("says a 1.2 lb change is inside the scanner's normal variation", () => {
    const side = strengthMeasured({
      ...base,
      inbody: inbody([scan("a", "2026-09-02", 47.1), scan("b", "2027-03-03", 48.3)]),
    });
    expect(side.text).toBe("Skeletal muscle 48.3 lb; 47.1 lb in Sep 2026.");
    expect(side.source).toBe(
      "InBody, Mar 3. A 1.2 lb change is inside the scanner's normal variation (±3.5 lb, Max Strength's default), so it isn't called a change.",
    );
  });

  it("calls a 4.0 lb change, beyond the variation, and names the studio that set it", () => {
    const side = strengthMeasured({
      ...base,
      variation: normalizeInBodyVariation({ skeletalMuscleMassLb: 3 }),
      variationOwner: "Solon",
      inbody: inbody([scan("a", "2026-09-02", 47.1), scan("b", "2027-03-03", 51.1)]),
    });
    expect(side.source).toBe("InBody, Mar 3. Up 4.0 lb, beyond the scanner's normal variation (±3 lb, set by Solon).");
  });

  it("with no scan, uses the machines Journey measured itself", () => {
    const client = { renewal: { proof: { machinesImproved: 6, machinesTracked: 9 } } } as unknown as Client;
    expect(strengthMeasured({ ...base, client, inbody: inbody([]) })).toEqual({
      text: "Stronger on 6 of 9 machines she has done 3+ times.",
      source: "First logged weight against the latest, in Journey",
    });
    expect(strengthMeasured({ ...base, inbody: inbody([]) }).text).toBe("No InBody scan yet.");
  });

  it("never reads a failed or loading scan read as no scan", () => {
    expect(strengthMeasured({ ...base, inbody: { scans: [], loading: false, error: "Couldn't load." } }).text).toBe(
      "The InBody scans couldn't be loaded just now.",
    );
    expect(strengthMeasured({ ...base, inbody: { scans: [], loading: true, error: null } }).text).toBe(
      "Loading the InBody scans…",
    );
  });
});

describe("the pairs", () => {
  const pairs = (
    flagIds: string[],
    src: PulseSource,
    client = {} as Client,
    pulseStatus: ProgressReportsStatus = "ready",
  ) =>
    measuredToldPairs({
      client,
      inbody: inbody([]),
      variation: DEFAULT_INBODY_VARIATION,
      variationOwner: null,
      flagIds,
      pain: latestPain(src),
      source: src,
      readings: latestPulseReadings(src),
      pulseStatus,
      pronouns: her,
      now: NOW,
    });

  it("quotes the statement verbatim with its word, and the last different answer", () => {
    const src = pulse(
      round("r2", "2027-03-10", { answers: { strengthConfidence_1: { value: 8 } } }),
      round("r1", "2026-09-16", { answers: { strengthConfidence_1: { value: 3 } } }),
    );
    const [strength] = pairs([], src);
    expect(strength.told).toEqual({
      text: "“I feel stronger than I did 3 months ago.”",
      word: "Often",
      source: "Pulse, Mar 10 · Rarely on Sep 16, 2026",
    });
  });

  it("pairs a knee flag with a knee she told us about, and a flag with nothing told makes no row", () => {
    const src = pulse(round("r1", "2027-03-10", { painMap: [knee(3)] }));
    const rows = pairs(["joint-tka", "gen-neck"], src);
    expect(rows.map((r) => r.key)).toEqual(["strength", "region:knee", "consistency"]);
    const row = rows[1];
    expect(row.measured).toEqual({ text: "Total Knee Replacement, on file.", source: "Clinical flag" });
    expect(row.told).toEqual({ text: "Right knee:", word: "Mild", source: "Pulse pain map, Mar 10" });
  });

  it("says pace is not on record without the renewal check, and Not asked yet when nothing was asked", () => {
    const rows = pairs([], pulse());
    const consistency = rows.find((r) => r.key === "consistency")!;
    expect(consistency.measured.text).toBe("Pace: not on record yet.");
    expect(consistency.told).toBeNull();
    expect(consistency.toldMissing).toBe(NOT_ASKED_YET);
    expect(NOT_ASKED_YET).toBe("Not asked yet");
  });

  it("never says Not asked yet while the Pulse history is unknown", () => {
    const unknown: PulseSource = { draft: null, history: null };
    const failed = pairs([], unknown, {} as Client, "failed");
    expect(failed.map((r) => r.told)).toEqual([null, null]);
    expect(failed.map((r) => r.toldMissing)).toEqual([PULSE_UNKNOWN, PULSE_UNKNOWN]);
    expect(PULSE_UNKNOWN).toBe("Not known: the saved Pulse couldn't be read");
    const loading = pairs([], unknown, {} as Client, "loading");
    expect(loading.map((r) => r.toldMissing)).toEqual(["Loading what she told us…", "Loading what she told us…"]);
    for (const r of [...failed, ...loading]) expect(r.toldMissing).not.toBe(NOT_ASKED_YET);
  });

  it("still shows what the open round holds when the saved rounds failed", () => {
    const src: PulseSource = {
      draft: {
        assessment: assessment({ answers: { strengthConfidence_1: { value: 8 } } }),
        savedAt: new Date(2027, 2, 20, 12).getTime(),
        reviewed: [],
        doneIds: [],
      },
      history: null,
    };
    const [strength, consistency] = pairs([], src, {} as Client, "failed");
    expect(strength.told?.word).toBe("Often");
    expect(consistency.told).toBeNull();
    expect(consistency.toldMissing).toBe(PULSE_UNKNOWN);
  });

  it("words the missing told side by the reader's pronoun", () => {
    expect(toldMissingLine("loading", pronounsOf({ gender: "Male" }))).toBe("Loading what he told us…");
    expect(toldMissingLine("loading", pronounsOf({}))).toBe("Loading what they told us…");
    expect(toldMissingLine("ready", her)).toBe(NOT_ASKED_YET);
  });

  it("reuses the renewal check's pace sentence", () => {
    const client = { renewal: { pacePerWeek: 2, proof: {} } as unknown as RenewalSnapshot } as Client;
    const consistency = pairs([], pulse(), client).find((r) => r.key === "consistency")!;
    expect(consistency.measured.source).toBe("Last 8 weeks · from the nightly renewal check");
    expect(consistency.measured.text).toMatch(/^Comes .* a week\.$/);
  });
});
