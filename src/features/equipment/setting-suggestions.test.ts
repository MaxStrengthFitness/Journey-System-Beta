import { describe, expect, it } from "vitest";
import {
  displayValue,
  formatHeight,
  parseHeightInches,
  statureBand,
  statureTip,
  suggestFromTrend,
} from "./setting-suggestions";

const v = (clients: number, byHeight: Record<string, number>) => ({ clients, sets: clients * 3, medianBest: null, byHeight });

const TREND = {
  settings: {
    seat: {
      "6": v(9, { "66": 2, "67": 3, "68": 1, "74": 3 }),
      "8": v(6, { "72": 4, "73": 2 }),
      "5": v(2, { "65": 2 }),
    },
    "chest-pad": {
      b: v(3, { "67": 1, "70": 2 }),
    },
  },
};

describe("formatHeight / parseHeightInches", () => {
  it("round-trips a height", () => {
    expect(formatHeight(67)).toBe("5'7\"");
    expect(parseHeightInches("5'7\"")).toBe(67);
  });
});

describe("displayValue", () => {
  it("turns stored keys back into typed values", () => {
    expect(displayValue("6_5")).toBe("6.5");
    expect(displayValue("b")).toBe("B");
    expect(displayValue("b", ["A", "B"])).toBe("B");
    expect(displayValue("narrow_grip")).toBe("narrow grip");
  });
});

describe("suggestFromTrend", () => {
  it("returns the most-used value within ±2 inches", () => {
    // 67 ± 2 → heights 65..69: seat 6 has 6 clients, seat 5 has 2 → 8 in band.
    expect(suggestFromTrend(TREND, ["Seat"], 67)).toEqual({
      value: "6",
      clients: 6,
      bandClients: 8,
      heightLabel: "5'7\"",
    });
  });

  it("finds the field by its legacy label or catalog slug", () => {
    expect(suggestFromTrend(TREND, ["Seat Height", "seat"], 73)?.value).toBe("8");
  });

  it("says nothing under the minimum sample", () => {
    // chest pad around 5'8": 1 + 2 = 3 clients < 5
    expect(suggestFromTrend(TREND, ["Chest Pad"], 68)).toBeNull();
    // nobody near 5'0"
    expect(suggestFromTrend(TREND, ["Seat"], 60)).toBeNull();
  });

  it("never offers a value only one client in the band uses", () => {
    const thin = { settings: { seat: { "3": v(1, { "67": 1 }), "4": v(1, { "67": 1 }), "5": v(1, { "66": 1 }), "7": v(1, { "68": 1 }), "9": v(1, { "69": 1 }) } } };
    expect(suggestFromTrend(thin, ["Seat"], 67)).toBeNull();
  });

  it("says nothing without a height, a trend or the field", () => {
    expect(suggestFromTrend(TREND, ["Seat"], null)).toBeNull();
    expect(suggestFromTrend(null, ["Seat"], 67)).toBeNull();
    expect(suggestFromTrend(TREND, ["Gap"], 67)).toBeNull();
  });
});

describe("statureBand / statureTip", () => {
  it("bands against the catalog's gendered baseline", () => {
    expect(statureBand(64, "Male")).toBe("shorter");
    expect(statureBand(64, "Female")).toBe("average");
    expect(statureBand(68, "female")).toBe("taller");
    expect(statureBand(null, "Male")).toBeNull();
    expect(statureBand(70, undefined)).toBe("taller");
  });

  it("joins the matching column into one line", () => {
    const adj = {
      shorterStature: { seatAdjustment: "Raise seat", specialNotes: "Use the footstool" },
      tallerStature: { padHandlePlacement: " " },
      limitedMobility: {},
    };
    expect(statureTip(adj, "shorter")).toBe("Raise seat · Use the footstool");
    expect(statureTip(adj, "taller")).toBeNull();
    expect(statureTip(adj, "average")).toBeNull();
    expect(statureTip(undefined, "shorter")).toBeNull();
  });
});
