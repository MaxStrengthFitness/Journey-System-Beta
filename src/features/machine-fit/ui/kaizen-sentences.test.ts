import { describe, expect, it } from "vitest";
import type { BodyStats, FactorLink, FieldReport } from "../kaizen";
import {
  NOT_ENOUGH,
  bandLabel,
  bodyLine,
  checkSentence,
  coverageSentence,
  habitSentence,
  linkSentence,
  linkSentences,
  studioSentence,
} from "./kaizen-sentences";

const link = (over: Partial<FactorLink> = {}): FactorLink => ({ factor: "height", clients: 146, r: -0.82, slope: -0.45, ...over });

const field = (over: Partial<FieldReport> = {}): FieldReport => ({
  key: "seat",
  clients: 146,
  numeric: true,
  values: [],
  otherClients: 0,
  bands: [],
  links: [],
  tested: [],
  ...over,
});

const stats = (over: Partial<BodyStats> = {}): BodyStats => ({
  clients: 12,
  women: 9,
  men: 3,
  withHeight: 12,
  avgHeightIn: 64.4,
  minHeightIn: 62,
  maxHeightIn: 66,
  avgWeightLb: 148,
  avgAgeYears: 61,
  ...over,
});

describe("bandLabel", () => {
  it("is one height, or a range", () => {
    expect(bandLabel({ from: 64, to: 64 })).toBe("5'4\"");
    expect(bandLabel({ from: 63, to: 65 })).toBe("5'3\"–5'5\"");
  });
});

describe("what a setting follows", () => {
  it("says a close link in notches per inches, never as a number between −1 and 1", () => {
    const s = linkSentence("Seat", link());
    expect(s).toBe("Seat follows height closely: about one lower for every 2 inches of height (146 clients).");
    expect(s).not.toMatch(/0\.\d/);
  });

  it("speaks per inch when the setting moves faster than the measure", () => {
    expect(linkSentence("Seat", link({ slope: 1.24, r: 0.9 }))).toBe(
      "Seat follows height closely: about 1.2 higher for every inch of height (146 clients).",
    );
  });

  it("rounds weight and age to spans a person would say", () => {
    expect(linkSentence("Seat", link({ factor: "weight", slope: 0.043, r: 0.7 }))).toContain("for every 25 lb of weight");
    expect(linkSentence("Seat", link({ factor: "age", slope: -0.02, r: -0.65 }))).toContain("one lower for every 50 years of age");
  });

  it("hedges a loose link", () => {
    expect(linkSentence("Back Pad", link({ r: 0.4, slope: 0.2 }))).toBe(
      "Back Pad loosely follows height: taller clients tend to be set higher, with plenty of exceptions (146 clients).",
    );
  });

  it("says 'does not follow' only when it was actually tested, with the sample", () => {
    const tested = linkSentences("Gap", field({ key: "gap", tested: [{ factor: "height", clients: 140 }] }));
    expect(tested).toHaveLength(1);
    expect(tested[0]).toContain("does not follow height on this machine (140 clients)");
    const untested = linkSentences("Gap", field({ key: "gap" }));
    expect(untested[0]).toContain(NOT_ENOUGH);
    expect(untested[0]).toContain("10 clients");
  });

  it("does not compare a worded setting with height at all", () => {
    expect(linkSentences("Handles", field({ numeric: false }))[0]).toContain("is a choice, not a number");
  });

  it("lists a height link and a second measure without a 'does not follow' line", () => {
    const out = linkSentences(
      "Seat",
      field({
        links: [link(), link({ factor: "wingspan", r: -0.5, slope: -0.3, clients: 40 })],
        tested: [
          { factor: "height", clients: 146 },
          { factor: "wingspan", clients: 40 },
        ],
      }),
    );
    expect(out).toHaveLength(2);
    expect(out[1]).toContain("loosely follows wingspan");
  });
});

describe("bodyLine — who is on a value", () => {
  it("reads as a line", () => {
    expect(bodyLine(stats())).toBe("avg 5'4\" (5'2\"–5'6\") · 9 women, 3 men · avg 148 lb · avg 61 yr");
  });

  it("says so when there are too few heights, and leaves out what it does not have", () => {
    expect(bodyLine(stats({ clients: 3, women: 1, men: 0, avgHeightIn: null, minHeightIn: null, maxHeightIn: null, avgWeightLb: null, avgAgeYears: null }))).toBe(
      `heights: ${NOT_ENOUGH} · 1 woman`,
    );
  });

  it("does not print a range for one height", () => {
    expect(bodyLine(stats({ minHeightIn: 64, maxHeightIn: 64, avgHeightIn: 64 }))).toContain("all 5'4\"");
  });
});

describe("the lines at the top", () => {
  it("counts who is set up, who is waiting on a first session, and who has no height", () => {
    expect(coverageSentence({ onFile: 40, clients: 37, withHeight: 35, studios: 1 }, "studio")).toBe(
      "40 clients set up. 3 clients have only accepted suggestions so far, which do not count until they have trained on them. 2 clients have no height on file and are left out of anything by height.",
    );
    expect(coverageSentence({ onFile: 412, clients: 412, withHeight: 412, studios: 4 }, "company")).toBe("412 clients set up across 4 studios.");
    expect(coverageSentence({ onFile: 0, clients: 0, withHeight: 0, studios: 0 }, "studio")).toBe(
      "Nobody at this studio is set up on this machine yet.",
    );
  });

  it("sums up the check without alarm", () => {
    expect(checkSentence({ onFile: 40, checked: 36, unusual: 0 })).toBe(
      "36 of 40 clients could be compared with similar clients; nobody is set somewhere unusual for their build.",
    );
    expect(checkSentence({ onFile: 40, checked: 36, unusual: 2 })).toContain("2 are set somewhere nobody similar is");
    expect(checkSentence({ onFile: 4, checked: 0, unusual: 0 })).toContain("five similar clients");
    expect(checkSentence({ onFile: 0, checked: 0, unusual: 0 })).toBe("");
  });
});

describe("studios", () => {
  it("describes a studio in counts, never as a rank", () => {
    expect(studioSentence("Solon", { clients: 212, checked: 203, unusual: 9, habits: [] })).toBe(
      "Solon: 212 clients set up, 203 compared, 9 set somewhere nobody similar is.",
    );
    expect(studioSentence("Willoughby", { clients: 3, checked: 0, unusual: 0, habits: [] })).toBe(
      "Willoughby: 3 clients set up; none could be compared yet.",
    );
    expect(studioSentence("New", { clients: 0, checked: 0, unusual: 0, habits: [] })).toBe("New: nobody set up on this machine yet.");
  });

  it("names a habit as something to look at, with three possible reasons", () => {
    const s = habitSentence(
      { key: "gap", studioValue: "2", studioClients: 14, studioOutOf: 18, elsewhereValue: "0", elsewhereClients: 160, elsewhereOutOf: 171 },
      { label: () => "Gap", value: (_k, v) => v },
    );
    expect(s).toContain("Gap: mostly 2 here (14 of 18), mostly 0 at the other studios (160 of 171).");
    expect(s).toContain("a different machine, a different habit, or the same thing written two ways");
  });
});
