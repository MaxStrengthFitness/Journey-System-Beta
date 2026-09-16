import { describe, expect, it } from "vitest";
import {
  DIAL_VALUES,
  DOSE_SCALE,
  FREQUENCY_SCALE,
  INTENSITY_SCALE,
  MASTERY_SCALE,
  READINESS_KEYS,
  READINESS_SCALES,
  REGION_SCALE,
  TEN_POINTS,
  absoluteToTen,
  compactReadiness,
  dialFromClientFeel,
  dialFromEnergyLevel,
  dialFromRegionState,
  dialFromSleepQuality,
  dialFromStressLevel,
  dialTone,
  dialWord,
  importanceFromPriority,
  isBelowCentre,
  isDialValue,
  regionStateFromDial,
  tenToAbsolute,
  toDialValue,
  worstReadiness,
} from "./dial";

describe("the Dial's shape", () => {
  it("has five positions with the centre at 0", () => {
    expect(DIAL_VALUES).toEqual([-2, -1, 0, 1, 2]);
    expect(isDialValue(0)).toBe(true);
    expect(isDialValue(3)).toBe(false);
    expect(isDialValue("1")).toBe(false);
    expect(isDialValue(null)).toBe(false);
  });

  it("every scale has exactly five words and a centre word", () => {
    const scales = [
      ...Object.values(READINESS_SCALES),
      REGION_SCALE,
      DOSE_SCALE,
      FREQUENCY_SCALE,
      INTENSITY_SCALE,
      MASTERY_SCALE,
    ];
    for (const s of scales) {
      expect(s.words).toHaveLength(5);
      expect(new Set(s.words).size).toBe(5);
      expect(s.ask.length).toBeGreaterThan(0);
      expect(s.untouched.length).toBeGreaterThan(0);
    }
  });

  it("relative scales rest on 'As usual' / 'Just right' — the centre is the expected place", () => {
    for (const k of READINESS_KEYS) expect(READINESS_SCALES[k].words[2]).toBe("As usual");
    expect(REGION_SCALE.words[2]).toBe("As usual");
    expect(DOSE_SCALE.words[2]).toBe("Just right");
  });

  it("the Pulse uses the reference document's frequency words, verbatim", () => {
    expect(FREQUENCY_SCALE.words).toEqual(["Not at all", "Rarely", "Sometimes", "Often", "Nearly always"]);
  });

  it("left is always worse: intensity runs Worst → None", () => {
    expect(INTENSITY_SCALE.words[0]).toBe("Worst");
    expect(INTENSITY_SCALE.words[4]).toBe("None");
  });

  it("clamps and rounds onto the five positions", () => {
    expect(toDialValue(7)).toBe(2);
    expect(toDialValue(-9)).toBe(-2);
    expect(toDialValue(0.4)).toBe(0);
    expect(toDialValue(1.6)).toBe(2);
    expect(toDialValue(NaN)).toBe(0);
  });
});

describe("the 0–10 conversions the Pulse stores through", () => {
  it("lands on the five anchor points scale v2 already had", () => {
    expect(TEN_POINTS).toEqual([0, 3, 5, 8, 10]);
    expect(DIAL_VALUES.map((v) => absoluteToTen(v))).toEqual([0, 3, 5, 8, 10]);
  });

  it("reverses for intensity so the left-hand Worst stores as 10", () => {
    expect(absoluteToTen(-2, INTENSITY_SCALE)).toBe(10);
    expect(absoluteToTen(2, INTENSITY_SCALE)).toBe(0);
    expect(absoluteToTen(0, INTENSITY_SCALE)).toBe(5);
  });

  it("round-trips every position", () => {
    for (const v of DIAL_VALUES) {
      expect(tenToAbsolute(absoluteToTen(v))).toBe(v);
      expect(tenToAbsolute(absoluteToTen(v, INTENSITY_SCALE), INTENSITY_SCALE)).toBe(v);
    }
  });

  it("puts an old 0–10 answer on the nearest word, ties toward the centre", () => {
    expect(tenToAbsolute(1)).toBe(-2); // 1 is nearer 0 than 3
    expect(tenToAbsolute(2)).toBe(-1); // 2 is nearer 3
    expect(tenToAbsolute(4)).toBe(0); // 4 is equidistant from 3 and 5 → centre
    expect(tenToAbsolute(6)).toBe(0); // nearer 5 than 8
    expect(tenToAbsolute(7)).toBe(1);
    expect(tenToAbsolute(9)).toBe(1); // 9 is equidistant from 8 and 10 → nearer centre
    expect(tenToAbsolute(null)).toBeNull();
    expect(tenToAbsolute(undefined)).toBeNull();
  });
});

describe("legacy vocabularies read onto the Dial", () => {
  it("sleep: Poor / Average / Optimal → -1 / 0 / +1, unknown → null", () => {
    expect(dialFromSleepQuality("poor")).toBe(-1);
    expect(dialFromSleepQuality("average")).toBe(0);
    expect(dialFromSleepQuality("optimal")).toBe(1);
    expect(dialFromSleepQuality(undefined)).toBeNull();
    expect(dialFromSleepQuality("great")).toBeNull();
  });

  it("stress 1–5: calm is up, maxed out is really down", () => {
    expect(dialFromStressLevel(1)).toBe(1);
    expect(dialFromStressLevel(2)).toBe(0);
    expect(dialFromStressLevel(3)).toBe(0);
    expect(dialFromStressLevel(4)).toBe(-1);
    expect(dialFromStressLevel(5)).toBe(-2);
    expect(dialFromStressLevel("5")).toBe(-2);
    expect(dialFromStressLevel(undefined)).toBeNull();
  });

  it("energy and the post-session feel", () => {
    expect(dialFromEnergyLevel("low")).toBe(-1);
    expect(dialFromEnergyLevel("high")).toBe(1);
    expect(dialFromClientFeel("Wiped Out")).toBe(-2);
    expect(dialFromClientFeel("Good")).toBe(0);
    expect(dialFromClientFeel("Energized")).toBe(1);
    expect(dialFromClientFeel("wiped")).toBe(-2); // the lower-case spelling one screen wrote
    expect(dialFromClientFeel("great")).toBeNull();
  });

  it("body regions go both ways so old readers keep working", () => {
    expect(dialFromRegionState("stiff")).toBe(-1);
    expect(dialFromRegionState("prime")).toBe(1);
    expect(regionStateFromDial(-2)).toBe("stiff");
    expect(regionStateFromDial(0)).toBe("prime");
    expect(regionStateFromDial(2)).toBe("prime");
  });

  it("the closing note's priority becomes a journal importance", () => {
    expect(importanceFromPriority("High")).toBe("critical");
    expect(importanceFromPriority("Medium")).toBe("elevated");
    expect(importanceFromPriority("Low")).toBe("standard");
    expect(importanceFromPriority(undefined)).toBe("standard");
  });
});

describe("reading a value", () => {
  it("gives the word, or the scale's untouched text", () => {
    expect(dialWord(DOSE_SCALE, -2)).toBe("Wiped out");
    expect(dialWord(DOSE_SCALE, 0)).toBe("Just right");
    expect(dialWord(DOSE_SCALE, null)).toBe("Not judged");
    expect(dialWord(READINESS_SCALES.sleep, undefined)).toBe("Not asked");
  });

  it("colours by urgency", () => {
    expect(dialTone(-2)).toBe("alert");
    expect(dialTone(-1)).toBe("warn");
    expect(dialTone(0)).toBe("live");
    expect(dialTone(1)).toBe("ok");
    expect(dialTone(2)).toBe("ok-strong");
    expect(isBelowCentre(-1)).toBe(true);
    expect(isBelowCentre(0)).toBe(false);
    expect(isBelowCentre(null)).toBe(false);
  });

  it("stores only the tapped dials, and nothing when nothing was tapped", () => {
    expect(compactReadiness({})).toBeUndefined();
    expect(compactReadiness({ sleep: undefined })).toBeUndefined();
    expect(compactReadiness({ sleep: 0, stress: -1 })).toEqual({ sleep: 0, stress: -1 });
    // An explicit centre tap IS stored — it means "confirmed normal".
    expect(compactReadiness({ energy: 0 })).toEqual({ energy: 0 });
  });

  it("finds the worst reading for a one-line summary", () => {
    expect(worstReadiness(undefined)).toBeNull();
    expect(worstReadiness({})).toBeNull();
    expect(worstReadiness({ sleep: 1, recovery: -2, stress: -1 })).toEqual({ key: "recovery", value: -2 });
    expect(worstReadiness({ sleep: 0 })).toEqual({ key: "sleep", value: 0 });
  });
});
