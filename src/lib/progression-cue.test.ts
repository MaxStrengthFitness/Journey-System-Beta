import { describe, expect, it } from "vitest";
import { progressionCue, traineeLevelOf } from "./progression-cue";

describe("progressionCue — form, then sequence, then reps, then resistance", () => {
  it("says nothing without a performed set or a load", () => {
    expect(progressionCue(null).direction).toBe("none");
    expect(progressionCue({ weight: null, reps: 10 }).direction).toBe("none");
    expect(progressionCue({ weight: 0, reps: 10 }).direction).toBe("none");
    expect(progressionCue({ weight: 100, reps: null }).direction).toBe("none");
  });

  it("holds on form before anything else — even with the reps there", () => {
    const cue = progressionCue({ weight: 100, reps: 14, quality: 1 });
    expect(cue.direction).toBe("hold");
    expect(cue.label).toContain("form");
    expect(cue.nextWeight).toBeNull();
  });

  it("never moves the load on a timed static contraction", () => {
    const cue = progressionCue({ weight: 100, seconds: 90, isTSC: true, quality: 3 });
    expect(cue.direction).toBe("hold");
    expect(cue.label).toContain("TSC");
  });

  it("goes up by one step once the reps pass the level's window in good form", () => {
    expect(progressionCue({ weight: 100, reps: 13, quality: 2 }, "novice")).toMatchObject({ direction: "up", nextWeight: 102 });
    expect(progressionCue({ weight: 100, reps: 13, quality: 3 }, "novice", 5)).toMatchObject({ direction: "up", nextWeight: 105 });
    // 13 is inside nothing for an intermediate (5–10) either — up.
    expect(progressionCue({ weight: 100, reps: 11 }, "intermediate")).toMatchObject({ direction: "up", nextWeight: 102 });
    // ...but 11 is inside a novice's 8–12: hold.
    expect(progressionCue({ weight: 100, reps: 11 }, "novice").direction).toBe("hold");
  });

  it("goes down when the set could not reach five reps — too heavy to fail in form", () => {
    expect(progressionCue({ weight: 100, reps: 4 }, "novice")).toMatchObject({ direction: "down", nextWeight: 98 });
    // An advanced trainee's window starts at 3, so 4 reps is inside it.
    expect(progressionCue({ weight: 100, reps: 4 }, "advanced").direction).toBe("hold");
    expect(progressionCue({ weight: 100, reps: 2 }, "advanced").direction).toBe("down");
    expect(progressionCue({ weight: 1, reps: 2 }).nextWeight).toBe(0);
  });

  it("holds and asks for reps when the set is under or inside the window", () => {
    expect(progressionCue({ weight: 100, reps: 6 }, "novice")).toMatchObject({ direction: "hold", label: "Hold · add reps" });
    expect(progressionCue({ weight: 100, reps: 10 }, "novice").direction).toBe("hold");
    expect(progressionCue({ weight: 100, reps: 12 }, "novice").direction).toBe("hold");
  });

  it("an unrated set counts as completed, like everywhere else in the app", () => {
    expect(progressionCue({ weight: 100, reps: 13, quality: null }).direction).toBe("up");
    expect(progressionCue({ weight: 100, reps: 13 }).direction).toBe("up");
  });
});

describe("traineeLevelOf", () => {
  it("reads the pedigree first, the experience level second, and defaults to novice", () => {
    expect(traineeLevelOf({ trainingPedigree: "Protocol Veteran" })).toBe("advanced");
    expect(traineeLevelOf({ trainingPedigree: "Advanced" })).toBe("advanced");
    expect(traineeLevelOf({ trainingPedigree: "Intermediate" })).toBe("intermediate");
    expect(traineeLevelOf({ trainingPedigree: "Novice", experienceLevel: "Advanced" })).toBe("novice");
    expect(traineeLevelOf({ experienceLevel: "Intermediate" })).toBe("intermediate");
    expect(traineeLevelOf({ experienceLevel: "Beginner" })).toBe("novice");
    expect(traineeLevelOf(null)).toBe("novice");
  });
});
