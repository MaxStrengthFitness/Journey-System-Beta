import { describe, it, expect } from "vitest";
import { gainSentence, healthLines, journeyLines, strengthGains } from "./brief";
import { DEFAULT_RENEWAL_SETTINGS } from "./settings";
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
    overallStatus: "green",
    overallPercent: 72.4,
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

  it("tells the journey from the snapshot", () => {
    expect(journeyLines(client, snap, DEFAULT_RENEWAL_SETTINGS)).toEqual([
      "Trained in 11 of the last 12 weeks",
      "Comes 1.5× a week",
      "Used 60 of 96 sessions on this package",
    ]);
  });

  it("leads with health: InBody, the check-in, the goal", () => {
    expect(healthLines(client, snap, TODAY)).toEqual([
      "InBody since Jan 15: muscle up 2.3 lb, body fat down 1.8 points",
      "90-day check-in, Jun 2: overall Green (72%)",
      "Red on: Sleep & Recovery",
      "Their goal: Carry groceries without back pain",
    ]);
  });
});
