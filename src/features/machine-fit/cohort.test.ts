import { describe, expect, it } from "vitest";
import { buildCohort, reachAt } from "./cohort";
import { body, client, compoundRowStudio } from "./fixtures";
import { DEFAULT_MATCH_SPEC, withFactor } from "./match-spec";
import type { MatchSpec } from "./types";

const studio = compoundRowStudio();

describe("the tolerance ladder", () => {
  it("starts at her exact height and widens one inch at a time until the minimum is met", () => {
    const cohort = buildCohort(studio, body(67), DEFAULT_MATCH_SPEC);
    // 5'7" alone is two clients; 5'6"–5'8" is six.
    expect(cohort.ladder).toEqual([
      { ring: 0, clients: 2 },
      { ring: 1, clients: 6 },
    ]);
    expect(cohort.ring).toBe(1);
    expect(cohort.enough).toBe(true);
    expect(cohort.bands.height).toEqual({ lo: 66, hi: 68 });
    expect(cohort.used).toEqual(["height"]);
  });

  it("never uses a wider band than it needs", () => {
    const roomy = [...studio, client(67, { seat: "4" }), client(67, { seat: "4" }), client(67, { seat: "4" })];
    const cohort = buildCohort(roomy, body(67), DEFAULT_MATCH_SPEC);
    expect(cohort.ring).toBe(0);
    expect(cohort.clients).toBe(5);
    expect(cohort.samples.every((s) => s.factors.heightIn === 67)).toBe(true);
  });

  it("comes back 'not enough' with the count when the ladder runs out", () => {
    const cohort = buildCohort(studio, body(76), DEFAULT_MATCH_SPEC);
    expect(cohort.enough).toBe(false);
    expect(cohort.ring).toBe(3);
    // 6'1" and the two at 6'2" are all that sit within 3".
    expect(cohort.clients).toBe(3);
    expect(cohort.ladder).toHaveLength(4);
  });

  it("leaves the client herself out of her own comparison group", () => {
    const me = client(67, { seat: "9" }, { clientId: "judy" });
    const cohort = buildCohort([...studio, me], body(67), DEFAULT_MATCH_SPEC, { excludeClientId: "judy" });
    expect(cohort.samples.some((s) => s.clientId === "judy")).toBe(false);
    expect(cohort.clients).toBe(6);
  });

  it("matches on gender only when asked to", () => {
    const spec: MatchSpec = { ...DEFAULT_MATCH_SPEC, gender: true };
    const cohort = buildCohort(studio, body(68, { gender: "f" }), spec);
    // Women only: 5'8" has one, ±1" three, ±2" five.
    expect(cohort.ladder.map((l) => l.clients)).toEqual([1, 3, 5]);
    expect(cohort.samples.every((s) => s.factors.gender === "f")).toBe(true);
    expect(cohort.used).toEqual(["height", "gender"]);
  });

  it("sets a factor aside, and says so, when THIS client has no value for it", () => {
    const spec = withFactor(DEFAULT_MATCH_SPEC, "wingspan", { on: true });
    const cohort = buildCohort(studio, body(67), spec);
    expect(cohort.missing).toEqual(["wingspan"]);
    expect(cohort.used).toEqual(["height"]);
    expect(cohort.clients).toBe(6); // exactly the height-only answer
  });

  it("leaves out samples that have no value for a factor in use", () => {
    const spec = withFactor(DEFAULT_MATCH_SPEC, "wingspan", { on: true });
    const withSpans = [
      ...studio,
      client(67, { seat: "4" }, { wingspanIn: 66 }),
      client(67, { seat: "4" }, { wingspanIn: 67 }),
      client(66, { seat: "4" }, { wingspanIn: 72 }), // long arms: 6" away, out of reach at every ring (±4" at most)
    ];
    const cohort = buildCohort(withSpans, body(67, { wingspanIn: 66 }), spec);
    expect(cohort.clients).toBe(2);
    expect(cohort.enough).toBe(false);
    expect(cohort.samples.every((s) => typeof s.factors.wingspanIn === "number")).toBe(true);
  });

  it("gives a continuous factor a base width — nobody weighs 'exactly' 150", () => {
    const spec = withFactor(withFactor(DEFAULT_MATCH_SPEC, "height", { on: false }), "weight", { on: true });
    expect(reachAt(spec, "weight", 0)).toBe(10);
    expect(reachAt(spec, "weight", 2)).toBe(30);
    expect(reachAt(spec, "weight", 9)).toBe(40); // capped at maxSteps
    const people = [141, 149, 158, 162, 171, 176, 190].map((w) => client(66, { seat: "4" }, { weightLb: w }));
    const cohort = buildCohort(people, body(null, { weightLb: 150 }), spec);
    // ±10 lb holds three; ±20 lb holds four; ±30 lb holds six.
    expect(cohort.ladder.map((l) => l.clients)).toEqual([3, 4, 6]);
    expect(cohort.bands.weight).toEqual({ lo: 120, hi: 180 });
  });

  it("with nothing to match on, everyone is the group and nothing is 'used'", () => {
    const cohort = buildCohort(studio, body(null), DEFAULT_MATCH_SPEC);
    expect(cohort.used).toEqual([]);
    expect(cohort.missing).toEqual(["height"]);
    expect(cohort.clients).toBe(studio.length);
  });

  it("counts a company sample as the number of clients it stands for", () => {
    const company = [
      { settings: { seat: "4" }, n: 4, factors: { heightIn: 67, gender: "f" as const } },
      { settings: { seat: "5" }, n: 3, factors: { heightIn: 67, gender: "f" as const } },
    ];
    const cohort = buildCohort(company, body(67), DEFAULT_MATCH_SPEC);
    expect(cohort.clients).toBe(7);
    expect(cohort.ring).toBe(0);
  });
});
