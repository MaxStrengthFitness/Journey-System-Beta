import { describe, it, expect } from "vitest";
import { gainSentence, healthLines, journeyLines, strengthGains } from "./brief";
import { DEFAULT_RENEWAL_SETTINGS } from "./settings";
import { DEFAULT_INBODY_VARIATION, normalizeInBodyVariation } from "../inbody/variation";
import type { Client } from "../../types";
import type { RenewalSnapshot } from "./types";

const TODAY = "2026-09-11";

const client = {
  id: "c1",
  firstName: "Mary",
  lastName: "Smith",
  homeStudioId: "s",
  height: "",
  isActive: true,
  remainingSessions: 0,
  smartGoal: "Carry groceries without back pain",
  machineStats: {
    m1: { firstWeight: 100, lastWeight: 130, timesPerformed: 12 },
    m2: { firstWeight: 80, lastWeight: 100, timesPerformed: 10 },
    m3: { firstWeight: 60, lastWeight: 58, timesPerformed: 9 },
    m4: { firstWeight: 40, lastWeight: 80, timesPerformed: 2 },
  },
  subjectiveSnapshot: {
    reportId: "r",
    date: "2026-06-02",
    // What snapshotForClient writes: a fraction, and Yellow because 72% is
    // under the 75% line.
    overallStatus: "yellow",
    overallPercent: 0.724,
    proteinStatus: null,
    hydrationStatus: null,
    redCategories: ["sleepRecovery"],
    flags: [],
  },
} as unknown as Client;

const snap = {
  packageKey: "committed",
  sessionsLeft: 36,
  sessionsLeftSource: "mindbody",
  paymentMode: "monthly",
  pacePerWeek: 1.5,
  proof: { weeksAttended: 11, weeksObserved: 12, machinesImproved: 2, machinesTracked: 3, bestGain: null, inbody: { muscleLbChange: 2.3, bodyFatPctChange: -1.8, since: "2026-01-15" } },
} as unknown as RenewalSnapshot;

describe("the Brief", () => {
  it("ranks strength gains in plain words, skipping thin samples and losses", () => {
    const gains = strengthGains(client, { m1: "Leg Press", m2: "Chest Press", m3: "Row", m4: "Curl" });
    expect(gains.map((g) => g.name)).toEqual(["Leg Press", "Chest Press"]);
    expect(gainSentence(gains[0])).toBe("Leg Press: 100 → 130 lb, 30% stronger");
  });

  it("says 'In Journey since' when Journey's first session is her only date and her story is not all here", () => {
    const filemaker = { ...client, firstSessionDate: "2026-09-02T15:00:00" } as Client;
    expect(journeyLines(filemaker, null, DEFAULT_RENEWAL_SETTINGS, "partial")[0]).toBe("In Journey since Sep 2026");
    expect(journeyLines(filemaker, null, DEFAULT_RENEWAL_SETTINGS)[0]).toBe("In Journey since Sep 2026");
    expect(journeyLines(filemaker, null, DEFAULT_RENEWAL_SETTINGS, "complete")[0]).toBe("Client since Sep 2026");
  });

  it("tells the journey from the snapshot", () => {
    expect(journeyLines(client, snap, DEFAULT_RENEWAL_SETTINGS)).toEqual([
      "Trained in 11 of the last 12 weeks",
      "Comes 1.5× a week",
      "About 60 of 96 sessions used on this package",
    ]);
  });

  // Client codex, Sep 2026 (AJ's decision 8): before this round the first
  // line read "InBody since Jan 15: muscle up 2.3 lb, body fat down 1.8
  // points". Both are inside Max Strength's default variation.
  it("leads with health: InBody, the check-in, the goal", () => {
    expect(healthLines(client, snap, TODAY, DEFAULT_INBODY_VARIATION)).toEqual([
      "InBody since Jan 15: no change bigger than the scanner's normal variation",
      "Pulse, Jun 2: overall Yellow (72%)",
      "Red on: Sleep & Recovery",
      "Their goal: Carry groceries without back pain",
    ]);
  });

  it("names an InBody change only beyond the client's studio's variation", () => {
    const tight = normalizeInBodyVariation({ skeletalMuscleMassLb: 2, percentBodyFat: 1.5 });
    expect(healthLines(client, snap, TODAY, tight)[0]).toBe(
      "InBody since Jan 15: muscle up 2.3 lb, body fat down 1.8 points",
    );
    const mixed = normalizeInBodyVariation({ skeletalMuscleMassLb: 2 });
    expect(healthLines(client, snap, TODAY, mixed)[0]).toBe("InBody since Jan 15: muscle up 2.3 lb");
    const bigger = {
      ...snap,
      proof: { ...snap.proof, inbody: { muscleLbChange: 4, bodyFatPctChange: -3.1, since: "2026-01-15" } },
    } as RenewalSnapshot;
    expect(healthLines(client, bigger, TODAY, DEFAULT_INBODY_VARIATION)[0]).toBe(
      "InBody since Jan 15: muscle up 4 lb, body fat down 3.1 points",
    );
    // Exactly at the variation is a change; a hair under is not.
    const edge = (muscleLbChange: number) =>
      ({ ...snap, proof: { ...snap.proof, inbody: { muscleLbChange, bodyFatPctChange: 0, since: "2026-01-15" } } }) as RenewalSnapshot;
    expect(healthLines(client, edge(3.5), TODAY, DEFAULT_INBODY_VARIATION)[0]).toBe("InBody since Jan 15: muscle up 3.5 lb");
    expect(healthLines(client, edge(3.4), TODAY, DEFAULT_INBODY_VARIATION)[0]).toBe(
      "InBody since Jan 15: no change bigger than the scanner's normal variation",
    );
  });

  it("has no InBody line without a scan pair", () => {
    const none = { ...snap, proof: { ...snap.proof, inbody: null } } as RenewalSnapshot;
    expect(healthLines(client, none, TODAY, DEFAULT_INBODY_VARIATION)[0]).toBe("Pulse, Jun 2: overall Yellow (72%)");
  });

  it("prints the stored fraction as a percentage, even under half", () => {
    const red = {
      ...client,
      subjectiveSnapshot: { ...client.subjectiveSnapshot!, overallStatus: "red", overallPercent: 0.42 },
    } as Client;
    expect(healthLines(red, snap, TODAY, DEFAULT_INBODY_VARIATION)).toContain("Pulse, Jun 2: overall Red (42%)");
  });
});
