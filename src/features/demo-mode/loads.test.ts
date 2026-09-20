import { describe, it, expect } from "vitest";
import {
  ADD_WEIGHT_ABOVE,
  DEMO_LOADS,
  HOLD_ADD_WEIGHT_ABOVE,
  HOLD_MAX_SECONDS,
  HOLD_MIN_SECONDS,
  LEARNING_CURVE_PERFORMANCES,
  LOAD_STEP,
  MAX_REPS,
  MIN_LOAD,
  MIN_REPS,
  SETTLED_REPS,
  VETERAN_SESSIONS,
  capabilityAfter,
  increaseAfter,
  increaseAfterHold,
  loadsFor,
  onTheStack,
  repsFor,
  secondsFor,
} from "./loads";
import { DEMO_MACHINES } from "./seed-core";
import { DEMO_CLIENTS, type DemoClientSeed } from "./roster";

const client = (over: Partial<DemoClientSeed> = {}): DemoClientSeed => ({
  key: "test",
  firstName: "Test",
  lastName: "Client",
  gender: "Female",
  age: 55,
  height: "5' 5\"",
  weight: "145",
  sessions: 20,
  remainingSessions: 28,
  priorSessions: 0,
  preference: "female",
  hasRoughSets: false,
  daysSinceLastSession: 3,
  teaches: "",
  ...over,
});

describe("what the machine can be set to", () => {
  it("rounds everything to two pounds and never goes under twenty", () => {
    /*
     * AJ, Sep 20 2026: "our machines can only move up in two pound
     * increments. As some of the current weights have 35 pounds, 32.5, 37,
     * 53." Every one of those is now unreachable.
     */
    expect(onTheStack(32.5)).toBe(32);
    expect(onTheStack(35)).toBe(36);
    expect(onTheStack(37)).toBe(38);
    expect(onTheStack(53)).toBe(54);
    expect(onTheStack(5)).toBe(MIN_LOAD);
    expect(onTheStack(-40)).toBe(MIN_LOAD);
    for (let n = 0; n < 400; n += 1) {
      const out = onTheStack(n * 1.37);
      expect(out % LOAD_STEP).toBe(0);
      expect(out).toBeGreaterThanOrEqual(MIN_LOAD);
    }
  });
});

describe("the table", () => {
  it("names every machine the demo puts on the floor", () => {
    // A machine that falls through to the catalog fallback gets a number
    // nobody chose, and the catalog's own numbers are what this round exists
    // to stop using.
    const missing = DEMO_MACHINES.map((m) => m.id).filter((id) => !DEMO_LOADS[id]);
    expect(missing).toEqual([]);
  });

  it("is made entirely of loads a machine can be set to", () => {
    for (const [id, entry] of Object.entries(DEMO_LOADS)) {
      for (const sex of ["male", "female"] as const) {
        const { novice, intermediate } = entry[sex];
        expect(`${id}.${sex}.novice=${novice}`).toBe(`${id}.${sex}.novice=${onTheStack(novice)}`);
        expect(`${id}.${sex}.intermediate=${intermediate}`).toBe(
          `${id}.${sex}.intermediate=${onTheStack(intermediate)}`,
        );
      }
    }
  });

  it("starts a novice under what they can do, not at it", () => {
    // "we should be intentionally underestimating the strength of the new
    // client" — Academy 2/Exercise Selection Template.txt.
    for (const [id, entry] of Object.entries(DEMO_LOADS)) {
      for (const sex of ["male", "female"] as const) {
        const { novice, intermediate } = entry[sex];
        const share = novice / intermediate;
        expect(`${id}.${sex}`).toBe(`${id}.${sex}`);
        expect(share).toBeLessThanOrEqual(0.8);
        // …but not so far under that the first set runs past the practical
        // upper limit and teaches discomfort instead of control.
        expect(share).toBeGreaterThanOrEqual(0.65);
      }
    }
  });

  it("does not leg-press fifty pounds", () => {
    // The specific complaint. Both sexes, before any scaling.
    expect(DEMO_LOADS["m-leg-press"].female.novice).toBeGreaterThan(120);
    expect(DEMO_LOADS["m-leg-press"].male.novice).toBeGreaterThan(200);
  });
});

describe("scaling the table to a person", () => {
  it("gives an older client less and a younger one more", () => {
    const young = loadsFor(client({ age: 45 }), "m-leg-press", 1).capability;
    const middle = loadsFor(client({ age: 55 }), "m-leg-press", 1).capability;
    const older = loadsFor(client({ age: 72 }), "m-leg-press", 1).capability;
    const oldest = loadsFor(client({ age: 81 }), "m-leg-press", 1).capability;
    expect(young).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(older);
    expect(older).toBeGreaterThan(oldest);
  });

  it("never scales anybody off the bottom of the stack", () => {
    const tiny = client({ age: 92, weight: "95", gender: "Female" });
    for (const machine of DEMO_MACHINES) {
      const { start, capability } = loadsFor(tiny, machine.id, 0.92);
      expect(start).toBeGreaterThanOrEqual(MIN_LOAD);
      expect(capability).toBeGreaterThanOrEqual(MIN_LOAD);
      expect(start % LOAD_STEP).toBe(0);
      expect(capability % LOAD_STEP).toBe(0);
    }
  });

  it("starts a veteran where they left off, not at a novice's weight", () => {
    /*
     * Arwen. Twelve years and 304 sessions before Journey ever saw her, and
     * a model that only knew her age would have had her opening lighter than
     * a sedentary 81-year-old who had never trained — the opposite of the
     * point she is in the roster to make.
     */
    const novice = loadsFor(client({ age: 81, priorSessions: 0 }), "m-leg-press", 1);
    const veteran = loadsFor(
      client({ age: 81, priorSessions: 304 }),
      "m-leg-press",
      1,
    );
    expect(novice.start).toBeLessThan(novice.capability);
    expect(veteran.start).toBe(veteran.capability);
    expect(veteran.capability).toBeGreaterThan(novice.capability);
  });

  it("never opens above capability", () => {
    for (const seed of DEMO_CLIENTS) {
      for (const machine of DEMO_MACHINES) {
        const { start, capability } = loadsFor(seed, machine.id, 1);
        expect(start).toBeLessThanOrEqual(capability);
      }
    }
  });
});

describe("reps are what the load means", () => {
  it("lands a settled client in the Academy's band", () => {
    // "6–10 reps → Typically appropriate challenge."
    expect(repsFor(100, 100, 0)).toBe(SETTLED_REPS);
    expect(repsFor(100, 100, 1)).toBeLessThanOrEqual(10);
    expect(repsFor(100, 100, -1)).toBeGreaterThanOrEqual(6);
  });

  it("lands a novice at ten to twelve or more", () => {
    // "which would most likely land them at a 10 - 12 or more rep set."
    const reps = repsFor(75, 100, 0);
    expect(reps).toBeGreaterThanOrEqual(12);
    expect(reps).toBeLessThanOrEqual(MAX_REPS);
  });

  it("never runs a set outside the bands, however wrong the load", () => {
    for (let load = 10; load <= 400; load += 3) {
      for (const wobble of [-1, 0, 1]) {
        const reps = repsFor(load, 150, wobble);
        expect(reps).toBeGreaterThanOrEqual(MIN_REPS);
        expect(reps).toBeLessThanOrEqual(MAX_REPS);
      }
    }
  });

  it("falls as the weight rises", () => {
    let previous = Infinity;
    for (let load = 60; load <= 140; load += 4) {
      const reps = repsFor(load, 120, 0);
      expect(reps).toBeLessThanOrEqual(previous);
      previous = reps;
    }
  });
});

describe("when the load goes up", () => {
  it("leaves it alone while the set is in the band", () => {
    for (let reps = MIN_REPS; reps <= ADD_WEIGHT_ABOVE; reps += 1) {
      expect(increaseAfter(reps, 20, 150, 140)).toBe(0);
      expect(increaseAfter(reps, 0, 150, 100)).toBe(0);
    }
  });

  it("adds the machine's own step once the weight is settled", () => {
    expect(increaseAfter(11, LEARNING_CURVE_PERFORMANCES, 150, 140)).toBe(LOAD_STEP);
    // A set past the practical upper limit is not slightly light, it is wrong.
    expect(increaseAfter(MAX_REPS, LEARNING_CURVE_PERFORMANCES, 150, 140)).toBe(LOAD_STEP * 2);
  });

  it("closes the gap while the working weight is still being found", () => {
    /*
     * And DECELERATES, which is what stops the opening reading like a
     * machine: a flat percentage put four identical twenty-pound jumps on
     * the front of every male client's leg press.
     */
    const capability = 260;
    let load = 194;
    const steps: number[] = [];
    for (let n = 0; n < LEARNING_CURVE_PERFORMANCES; n += 1) {
      const added = increaseAfter(MAX_REPS, n, capability, load);
      if (added === 0) break;
      steps.push(added);
      load += added;
    }
    expect(steps.length).toBeGreaterThan(2);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]).toBeLessThanOrEqual(steps[i - 1]);
    }
    for (const step of steps) {
      expect(step % LOAD_STEP).toBe(0);
      expect(step).toBeLessThanOrEqual(20); // AJ: "up to even 20 lb", early only
    }
    expect(load).toBeLessThanOrEqual(capability + LOAD_STEP);
  });
});

describe("holds progress on time first, load second", () => {
  it("sits a settled client well above the assessment interval", () => {
    // "SH's are typically introduced at a time interval of 30 to 45 seconds
    // maximum to assess tolerance." Nobody stays there.
    expect(secondsFor(100, 100, 0)).toBeGreaterThan(HOLD_MIN_SECONDS + 20);
    expect(secondsFor(100, 100, 0)).toBeLessThan(HOLD_ADD_WEIGHT_ABOVE);
  });

  it("caps at two minutes, where the Academy says to add load instead", () => {
    expect(secondsFor(20, 400, 1)).toBe(HOLD_MAX_SECONDS);
    expect(increaseAfterHold(HOLD_MAX_SECONDS, 20, 100, 90)).toBe(LOAD_STEP);
    expect(increaseAfterHold(HOLD_MIN_SECONDS, 20, 100, 90)).toBe(0);
  });

  it("reads to the nearest five seconds, the way a trainer reads a clock", () => {
    for (let load = 30; load <= 200; load += 7) {
      expect(secondsFor(load, 150, 0) % 5).toBe(0);
    }
  });
});

describe("capability grows, then flattens", () => {
  it("gets a novice meaningfully stronger over a full history", () => {
    const base = 120;
    const after = capabilityAfter(base, 22, 0);
    expect(after).toBeGreaterThan(base);
    // Enough to see on a chart, nowhere near doubling.
    expect(after / base).toBeGreaterThan(1.08);
    expect(after / base).toBeLessThan(1.2);
  });

  it("barely moves for somebody with twelve years behind them", () => {
    const base = 120;
    expect(capabilityAfter(base, 22, 304) / base).toBeLessThan(1.05);
  });

  it("flattens rather than climbing for ever", () => {
    const early = capabilityAfter(120, 10, 0) - capabilityAfter(120, 0, 0);
    const late = capabilityAfter(120, 60, 0) - capabilityAfter(120, 50, 0);
    expect(late).toBeLessThan(early);
  });

  it("only ever returns a load the machine can be set to", () => {
    for (let n = 0; n < 60; n += 1) {
      const out = capabilityAfter(137, n, 0);
      expect(out % LOAD_STEP).toBe(0);
      expect(out).toBeGreaterThanOrEqual(MIN_LOAD);
    }
  });

  it("treats a hundred prior sessions as the line between the two", () => {
    expect(VETERAN_SESSIONS).toBe(100);
    expect(capabilityAfter(120, 22, VETERAN_SESSIONS)).toBeLessThan(
      capabilityAfter(120, 22, VETERAN_SESSIONS - 1),
    );
  });
});
