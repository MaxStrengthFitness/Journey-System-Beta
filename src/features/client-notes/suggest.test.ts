import { describe, expect, it } from "vitest";
import { suggestFiling } from "./suggest";

const s = (text: string, inSession = true) => {
  const r = suggestFiling(text, { inSession });
  return r ? [r.category, r.flavour] : null;
};

describe("suggestFiling — where a note probably goes, from the trainer's words (Oct 3 2026)", () => {
  it("reads the notes trainers actually write", () => {
    expect(s("Left knee sore after the hike")).toEqual(["health", "Injury"]);
    expect(s("Rotator cuff surgery on the 14th, no pressing until cleared")).toEqual(["health", "Surgery"]);
    expect(s("Started Ozempic last month")).toEqual(["health", "Medication"]);
    expect(s("Just diagnosed with osteopenia")).toEqual(["health", "Diagnosis"]);
    expect(s("Sees a chiropractor every other Thursday")).toEqual(["health", "OutsideCare"]);
    expect(s("Felt dizzy stepping off the leg press, sat for five minutes")).toEqual(["incident", null]);
    expect(s("Left her phone on the chest press")).toEqual(["incident", null]);
    expect(s("Not sure she'll renew in May, money is tight")).toEqual(["retention", null]);
    expect(s("Rushes the turnaround on the last two reps")).toEqual(["coaching", "Pace"]);
    expect(s("Seat two notches lower than the card")).toEqual(["coaching", "Setup"]);
    expect(s("Granddaughter graduates in May")).toEqual(["ford", null]);
    expect(s("Likes the fan on and no music")).toEqual(["preference", null]);
  });

  it("puts what happened in the room ahead of her health, and her health ahead of the rest", () => {
    // A fall that hurt her knee is an incident first: it happened here.
    expect(s("Slipped on the leg press step, knee sore")).toEqual(["incident", null]);
    // Pain in a coaching sentence is still about her body.
    expect(s("Lower back pain when she rushes the turnaround")).toEqual(["health", "Injury"]);
  });

  it("reads the body part from the same words", () => {
    expect(suggestFiling("Left knee sore after the hike")?.bodyParts).toEqual([{ part: "knee", side: "left" }]);
    expect(suggestFiling("Both shoulders stiff today")?.bodyParts).toEqual([{ part: "shoulder", side: "both" }]);
    // A body part alone is about her body.
    expect(s("right hip")).toEqual(["health", null]);
  });

  it("never guesses from a word that means something else", () => {
    expect(s("Her birthday falls on a Sunday this year")).toEqual(["ford", null]);
    expect(s("Lost her husband last spring")).toEqual(["ford", null]);
    expect(s("Going to work harder on the last rep")).toEqual(["coaching", null]);
    expect(s("Stop at the top of the rep")).toEqual(["coaching", null]);
    expect(s("ok")).toBeNull();
    expect(s("Great session today")).toBeNull();
    expect(s("")).toBeNull();
  });

  it("reads a machine's seat or pad as set-up only where a machine is in front of her", () => {
    expect(s("Needs the extra pad", true)).toEqual(["coaching", "Setup"]);
    expect(s("Needs the extra pad", false)).toBeNull();
  });
});
